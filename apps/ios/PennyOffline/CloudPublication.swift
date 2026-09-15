import Foundation
import Observation

struct CloudBinding: Codable, Equatable {
    let provider: String
    let accountTag: String
    let vaultTag: String
    let restoreEpoch: String
    let keyTag: String
}
private struct CloudLocalState: Codable {
    var binding: CloudBinding?
    var lastGood: CloudManifest?
    var completedAt: String?
    var automatic: AutomaticBackupSettings?
}
struct CloudRestorePreview: Identifiable {
    let id = UUID()
    let snapshot: VaultSnapshot
    let revision: Int
    let operationId: UUID
    let accountTag: String
    let providerEpoch: UUID
    let restoreEpoch: String
}
struct CloudHistoryGroup: Identifiable {
    let vaultTag: String
    let writerId: String
    let candidates: [CloudManifest]
    var id: String { vaultTag + writerId }
    var hasConflict: Bool {
        Dictionary(grouping: candidates, by: \.localRevision).values.contains { Set($0.map(\.snapshot.sha256)).count > 1 }
    }
}

@MainActor @Observable final class CloudPublication {
    let vault: VaultStore
    private let suppliedProvider: (any CloudTransport)?
    private let keyReader: () throws -> String?
    private let persistenceCheckpoint: (() throws -> Void)?
    private var transport: (any CloudTransport)?
    private var state = CloudLocalState()
    private var operationId = UUID()
    private var sessionEpoch = UUID()
    private var operationKeyTag: String?
    private var discoveryBinding: (tag: String, providerEpoch: UUID, restoreEpoch: String)?
    private(set) var isBusy = false
    private(set) var phase = "Disabled"
    private(set) var error: String?
    private(set) var lastFailure: CloudFailure?
    private(set) var history: [CloudManifest] = []
    private(set) var historyWarning: String?
    var preview: CloudRestorePreview?
    init(vault: VaultStore, provider: (any CloudTransport)? = nil, keyReader: @escaping () throws -> String? = { try RecoveryKeyStore.load() }, persistenceCheckpoint: (() throws -> Void)? = nil) {
        self.vault = vault; suppliedProvider = provider; self.keyReader = keyReader; self.persistenceCheckpoint = persistenceCheckpoint
        do {
            if FileManager.default.fileExists(atPath: vault.cloudStateURL.path) {
                let clear = try vault.openCloudState(StrictJSON.boundedRead(vault.cloudStateURL, maximum: 65_564))
                state = try JSONDecoder().decode(CloudLocalState.self, from: clear)
                try state.lastGood?.validate()
            }
            if !bindingMatchesLocal { state.binding = nil; phase = "Disabled" }
            else { phase = "Enabled · account check required" }
        } catch { self.error = "Saved backup settings could not be opened. Local finances remain available."; state = CloudLocalState() }
    }
    private var automaticStopURL: URL { vault.cloudStateURL.deletingLastPathComponent().appendingPathComponent("automatic-backup-stopped") }
    private func markAutomaticStopped() throws {
        // The containing vault directory already exists whenever automatic backup
        // can be enabled. No financial data or credentials enter this marker.
        let marker = Data("PENNY-AUTOMATIC-STOP:1".utf8)
        try marker.write(to: automaticStopURL, options: [.atomic, .completeFileProtection])
        let handle = try FileHandle(forWritingTo: automaticStopURL); try handle.synchronize(); try handle.close()
        guard try StrictJSON.boundedRead(automaticStopURL, maximum: 128) == marker else { throw CloudFailure.verification }
    }
    var automaticSettings: AutomaticBackupSettings {
        if FileManager.default.fileExists(atPath: automaticStopURL.path) {
            return AutomaticBackupSettings(pauseReason: state.automatic?.pauseReason ?? "Automatic backup is paused. Enable it explicitly when ready.")
        }
        return state.automatic ?? AutomaticBackupSettings()
    }
    func setAutomaticSettings(_ value: AutomaticBackupSettings, explicitEnable: Bool = false) throws {
        guard (0...2).contains(value.retryCount), !value.enabled || (available && enabled && hasConfirmedKey),
              !value.enabled || explicitEnable || automaticSettings.enabled else { throw CloudFailure.disabled }
        var next = state; next.automatic = value
        do {
            // This independent marker remains if the encrypted settings update fails.
            // A future process checks it before it can schedule any automatic work.
            try markAutomaticStopped()
            try persist(next); state = next
            if value.enabled {
                try FileManager.default.removeItem(at: automaticStopURL)
                guard !FileManager.default.fileExists(atPath: automaticStopURL.path) else { throw CloudFailure.verification }
            }
        } catch {
            state.automatic = AutomaticBackupSettings(pauseReason: "Automatic backup is paused because its settings could not be saved. Open Penny and enable it again after resolving storage access.")
            throw error
        }
    }
    var hasConfirmedKey: Bool { (try? keyReader()) != nil }
    var available: Bool { suppliedProvider != nil || CloudBuildConfiguration.available }
    var enabled: Bool { state.binding != nil && bindingMatchesLocal }
    var lastGood: CloudManifest? { enabled ? state.lastGood : nil }
    var completedAt: String? { enabled ? state.completedAt : nil }
    var pendingChanges: Bool { lastGood?.writerId != vault.writerId || lastGood?.localRevision != vault.revision }
    var groups: [CloudHistoryGroup] {
        Dictionary(grouping: history, by: { $0.vaultTag + $0.writerId }).values.map { values in
            CloudHistoryGroup(vaultTag: values[0].vaultTag, writerId: values[0].writerId,
                candidates: values.sorted { $0.localRevision == $1.localRevision ? $0.manifestId < $1.manifestId : $0.localRevision > $1.localRevision })
        }.sorted { $0.id < $1.id }
    }
    private var bindingMatchesLocal: Bool {
        guard let binding = state.binding, binding.restoreEpoch == vault.restoreEpoch,
              binding.vaultTag == (try? CloudWire.vaultTag(vault.liveBody.vaultId)),
              let key = try? keyReader(), CloudWire.digest(Data(key.utf8)) == binding.keyTag else { return false }
        return true
    }
    private func provider() throws -> any CloudTransport {
        if let transport { return transport }
        let created: any CloudTransport = try suppliedProvider ?? CloudKitTransport()
        created.onAccountChange = { [weak self] in self?.accountDidChange() }
        transport = created; return created
    }
    private func key() throws -> String { guard let key = try keyReader() else { throw CloudFailure.disabled }; _ = try BackupArchive.key(key); return key }
    private func currentKeyTag() -> String? { (try? keyReader()).map { CloudWire.digest(Data($0.utf8)) } }
    private func begin(_ label: String) -> UUID { operationKeyTag = currentKeyTag(); operationId = UUID(); isBusy = true; phase = label; error = nil; lastFailure = nil; preview = nil; return operationId }
    private func localGuard(_ id: UUID, epoch: UUID, restoreEpoch: String, providerEpoch: UUID, provider: any CloudTransport) throws {
        try Task.checkCancellation()
        guard operationId == id, sessionEpoch == epoch else { throw CloudFailure.cancelled }
        guard operationKeyTag == currentKeyTag(), operationKeyTag != nil, vault.restoreEpoch == restoreEpoch, provider.accountEpoch == providerEpoch else { throw CloudFailure.accountChanged }
    }
    private func account(_ id: UUID, epoch: UUID, restoreEpoch: String, providerEpoch: UUID, provider: any CloudTransport, expected: String? = nil) async throws -> String {
        try localGuard(id, epoch: epoch, restoreEpoch: restoreEpoch, providerEpoch: providerEpoch, provider: provider)
        let identity = try await provider.identity()
        try localGuard(id, epoch: epoch, restoreEpoch: restoreEpoch, providerEpoch: providerEpoch, provider: provider)
        let tag = try CloudWire.accountTag(provider: provider.provider, identity: identity)
        guard expected == nil || expected == tag else { throw CloudFailure.accountChanged }
        return tag
    }
    private func finish(_ id: UUID, failure: Error? = nil) {
        guard operationId == id else { return }; isBusy = false
        if let failure {
            lastFailure = failure as? CloudFailure
            error = failure.localizedDescription; phase = "Not verified"
            if failure as? CloudFailure == .accountChanged || failure as? CloudFailure == .permission {
                state.binding = nil; state.automatic = nil; sessionEpoch = UUID(); phase = "Re-enable required"
                do { try markAutomaticStopped(); try persist(state) } catch { self.error = error.localizedDescription }
            }
        }
    }
    private func accountDidChange() {
        cancel(); state.binding = nil; state.automatic = nil; history = []; discoveryBinding = nil
        error = CloudFailure.accountChanged.localizedDescription; phase = "Re-enable required"
        do { try markAutomaticStopped(); try persist(state) } catch { self.error = error.localizedDescription }
    }
    func cancel() { operationId = UUID(); sessionEpoch = UUID(); isBusy = false; phase = "Cancelled · prior backup preserved"; preview = nil }
    func disable() {
        cancel(); state.binding = nil; state.lastGood = nil; state.completedAt = nil; state.automatic = nil
        transport = nil; discoveryBinding = nil; history = []; phase = "Disabled"
        do { try markAutomaticStopped(); try persist(state) } catch { self.error = error.localizedDescription }
    }
    func localVaultChanged() {
        if state.binding != nil && !bindingMatchesLocal { disable(); error = CloudFailure.accountChanged.localizedDescription }
    }
    func enable() async {
        let id = begin("Checking iCloud account"), epoch = sessionEpoch, restore = vault.restoreEpoch
        do {
            let key = try key(), provider = try provider(), providerEpoch = provider.accountEpoch
            let tag = try await account(id, epoch: epoch, restoreEpoch: restore, providerEpoch: providerEpoch, provider: provider)
            try await vault.ensurePublicationIdentityAsync()
            _ = try await account(id, epoch: epoch, restoreEpoch: restore, providerEpoch: providerEpoch, provider: provider, expected: tag)
            let binding = CloudBinding(provider: provider.provider, accountTag: tag, vaultTag: try CloudWire.vaultTag(vault.liveBody.vaultId), restoreEpoch: vault.restoreEpoch, keyTag: CloudWire.digest(Data(key.utf8)))
            let next = CloudLocalState(binding: binding, lastGood: state.binding == binding ? state.lastGood : nil, completedAt: state.binding == binding ? state.completedAt : nil, automatic: state.binding == binding ? state.automatic : nil)
            try persist(next); state = next; phase = "Enabled · ready to back up"; finish(id)
        } catch { finish(id, failure: error) }
    }
    func publish() async {
        let id = begin("Preparing encrypted snapshot"), epoch = sessionEpoch, restore = vault.restoreEpoch
        do {
            guard enabled, let binding = state.binding else { throw CloudFailure.disabled }
            let key = try key(), provider = try provider(), providerEpoch = provider.accountEpoch
            func check() async throws {
                _ = try await account(id, epoch: epoch, restoreEpoch: restore, providerEpoch: providerEpoch, provider: provider, expected: binding.accountTag)
                guard enabled, state.binding == binding else { throw CloudFailure.accountChanged }
            }
            try await check()
            phase = "Checking backup history capacity"
            let existing = try await inventory(provider: provider, check: check)
            // Reserve room for both immutable objects before publishing. Orphaned
            // objects count too; never delete prior backups to recover capacity.
            guard existing.manifests.count < 100, existing.total <= 998 else { throw CloudFailure.historyCapacity }
            try await check()
            try await vault.replaceAsync(vault.compatibilitySnapshot())
            try await check()
            let revision = vault.revision, writer = vault.writerId
            let staged = try await ArchiveWorker.shared.prepare(vault.compatibilitySnapshot(), key: key)
            defer { Task { await ArchiveWorker.shared.cancel(staged) } }
            try await check()
            let snapshotBytes = staged.bytes, snapshot = staged.snapshot
            let previous = state.lastGood?.writerId == writer ? state.lastGood : nil
            var manifest = CloudManifest(manifestId: UUID().uuidString.lowercased(), provider: provider.provider, accountTag: binding.accountTag,
                vaultTag: binding.vaultTag, writerId: writer, localRevision: revision, createdAt: CivilDate.timestamp(), verifiedAt: CivilDate.timestamp(), previousManifestId: previous?.manifestId,
                snapshot: CloudSnapshotDescriptor(objectId: UUID().uuidString.lowercased(), snapshotId: snapshot.snapshotId, snapshotSchemaVersion: snapshot.schemaVersion,
                    sha256: CloudWire.digest(snapshotBytes), byteCount: snapshotBytes.count, createdAt: snapshot.createdAt))
            _ = try await ArchiveWorker.shared.verify(snapshotBytes, key: key, manifest: manifest); try await check()
            phase = "Uploading encrypted snapshot"; try await check()
            try await provider.upload(name: manifest.snapshotName, encryptedFile: staged.url); try await check()
            phase = "Verifying remote snapshot"
            let downloaded = try await provider.download(name: manifest.snapshotName, maximumBytes: BackupArchive.maximumEnvelopeBytes); try await check()
            guard downloaded == snapshotBytes else { throw CloudFailure.verification }
            _ = try await ArchiveWorker.shared.verify(downloaded, key: key, manifest: manifest); try await check()
            manifest.verifiedAt = CivilDate.timestamp(); manifest.createdAt = CivilDate.timestamp()
            let manifestBytes = try CloudWire.seal(manifest, key: key)
            let manifestURL = staged.url.deletingLastPathComponent().appendingPathComponent(manifest.manifestName)
            defer { try? FileManager.default.removeItem(at: manifestURL) }
            try manifestBytes.write(to: manifestURL, options: [.atomic, .completeFileProtection])
            let handle = try FileHandle(forWritingTo: manifestURL); try handle.synchronize(); try handle.close()
            let reopened = try StrictJSON.boundedRead(manifestURL, maximum: CloudWire.maximumEnvelope)
            guard reopened == manifestBytes, try CloudWire.open(reopened, key: key, provider: binding.provider, accountTag: binding.accountTag, vaultTag: binding.vaultTag) == manifest else { throw CloudFailure.verification }
            phase = "Publishing verified snapshot manifest"; try await check()
            try await provider.upload(name: manifest.manifestName, encryptedFile: manifestURL); try await check()
            phase = "Verifying remote manifest"
            let remoteManifest = try await provider.download(name: manifest.manifestName, maximumBytes: CloudWire.maximumEnvelope); try await check()
            guard remoteManifest == manifestBytes, try CloudWire.open(remoteManifest, key: key, provider: binding.provider, accountTag: binding.accountTag, vaultTag: binding.vaultTag) == manifest else { throw CloudFailure.verification }
            guard vault.revision >= revision else { throw CloudFailure.verification }
            let next = CloudLocalState(binding: binding, lastGood: manifest, completedAt: CivilDate.timestamp(), automatic: state.automatic)
            try persist(next); state = next; phase = pendingChanges ? "Verified · newer local changes pending" : "Current revision verified remotely"; finish(id)
        } catch { finish(id, failure: error) }
    }
    private func inventory(provider: any CloudTransport, check: () async throws -> Void) async throws -> (manifests: [CloudRemoteItem], total: Int) {
        var token: String?, tokens = Set<String>(), ids = Set<String>(), names = Set<String>(), candidates: [CloudRemoteItem] = []
        var complete = false
        let uuid = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"
        for _ in 0..<10 {
            try await check(); let page = try await provider.list(token: token); try await check()
            guard page.items.count <= 100 else { throw CloudFailure.incompleteListing }
            for item in page.items {
                guard (1...1024).contains(item.id.unicodeScalars.count), item.name.unicodeScalars.count <= 256,
                      ids.insert(item.id).inserted, ids.count <= 1000 else { throw CloudFailure.incompleteListing }
                let manifest = item.name.range(of: "^manifest-\(uuid)\\.pennymanifest$", options: .regularExpression) != nil
                let snapshot = item.name.range(of: "^snapshot-\(uuid)\\.pennybackup$", options: .regularExpression) != nil
                if manifest || snapshot { guard names.insert(item.name).inserted else { throw CloudFailure.conflict } }
                if manifest { candidates.append(item) }
                guard candidates.count <= 100 else { throw CloudFailure.incompleteListing }
            }
            token = page.nextToken
            if let token { guard !token.isEmpty, token.unicodeScalars.count <= 2048, tokens.insert(token).inserted else { throw CloudFailure.incompleteListing } }
            else { complete = true; break }
        }
        guard complete else { throw CloudFailure.incompleteListing }
        return (candidates, ids.count)
    }
    func discover() async {
        let id = begin("Reading complete backup history"), epoch = sessionEpoch, restore = vault.restoreEpoch
        history = []; historyWarning = nil; discoveryBinding = nil
        do {
            let key = try key(), provider = try provider(), providerEpoch = provider.accountEpoch
            let tag = try await account(id, epoch: epoch, restoreEpoch: restore, providerEpoch: providerEpoch, provider: provider)
            func check() async throws { _ = try await account(id, epoch: epoch, restoreEpoch: restore, providerEpoch: providerEpoch, provider: provider, expected: tag) }
            let inventory = try await inventory(provider: provider, check: check)
            let candidates = inventory.manifests
            var verified: [CloudManifest] = [], unreadable = 0
            for item in candidates {
                try await check(); let bytes = try await provider.download(name: item.name, maximumBytes: CloudWire.maximumEnvelope); try await check()
                do {
                    let manifest = try CloudWire.open(bytes, key: key, provider: provider.provider, accountTag: tag)
                    guard manifest.manifestName == item.name else { throw CloudFailure.invalidManifest }
                    verified.append(manifest)
                } catch { unreadable += 1 }
            }
            try await check(); history = verified; discoveryBinding = (tag, providerEpoch, restore)
            historyWarning = unreadable > 0 ? "\(unreadable) manifest files could not authenticate with this key or account. They were left untouched." : nil
            phase = verified.isEmpty ? "No authenticated manifests found" : "Choose a backup to download and verify"
            finish(id)
        } catch { finish(id, failure: error) }
    }
    func prepareRestore(_ manifest: CloudManifest) async {
        let id = begin("Downloading selected backup"), epoch = sessionEpoch
        do {
            guard let discovered = discoveryBinding, history.contains(manifest) else { throw CloudFailure.staleRestore }
            let provider = try provider(), key = try key()
            _ = try await account(id, epoch: epoch, restoreEpoch: discovered.restoreEpoch, providerEpoch: discovered.providerEpoch, provider: provider, expected: discovered.tag)
            let bytes = try await provider.download(name: manifest.snapshotName, maximumBytes: manifest.snapshot.byteCount)
            _ = try await account(id, epoch: epoch, restoreEpoch: discovered.restoreEpoch, providerEpoch: discovered.providerEpoch, provider: provider, expected: discovered.tag)
            let revision = vault.revision
            let snapshot = try await ArchiveWorker.shared.verify(bytes, key: key, manifest: manifest)
            _ = try await account(id, epoch: epoch, restoreEpoch: discovered.restoreEpoch, providerEpoch: discovered.providerEpoch, provider: provider, expected: discovered.tag)
            guard vault.revision == revision else { throw CloudFailure.staleRestore }
            preview = CloudRestorePreview(snapshot: snapshot, revision: vault.revision, operationId: id, accountTag: discovered.tag, providerEpoch: discovered.providerEpoch, restoreEpoch: vault.restoreEpoch)
            phase = "Verified restore preview · local vault unchanged"; finish(id)
        } catch { finish(id, failure: error) }
    }
    func confirmRestore(_ preview: CloudRestorePreview) async {
        isBusy = true; phase = "Checking account before restore"
        let id = preview.operationId, epoch = sessionEpoch
        do {
            let provider = try provider()
            _ = try await account(id, epoch: epoch, restoreEpoch: preview.restoreEpoch, providerEpoch: preview.providerEpoch, provider: provider, expected: preview.accountTag)
            guard vault.revision == preview.revision else { throw CloudFailure.staleRestore }
            let prepared = try await vault.prepareWrite(preview.snapshot, restoring: true, expectedRevision: preview.revision)
            _ = try await account(id, epoch: epoch, restoreEpoch: preview.restoreEpoch, providerEpoch: preview.providerEpoch, provider: provider, expected: preview.accountTag)
            try vault.apply(prepared)
            disable(); phase = "Restored locally · cloud backup disabled until re-enabled"
        } catch { finish(id, failure: error); if operationId == id { self.preview = nil } }
    }
    private func persist(_ next: CloudLocalState) throws {
        try vault.ensurePublicationIdentity()
        let bytes = try JSONEncoder().encode(next), encrypted = try vault.sealCloudState(bytes), url = vault.cloudStateURL
        let old = FileManager.default.fileExists(atPath: url.path) ? try StrictJSON.boundedRead(url, maximum: 65_564) : nil
        do {
            try encrypted.write(to: url, options: [.atomic, .completeFileProtection])
            let handle = try FileHandle(forWritingTo: url); try handle.synchronize(); try handle.close()
            try persistenceCheckpoint?()
            guard try vault.openCloudState(StrictJSON.boundedRead(url, maximum: 65_564)) == bytes else { throw CloudFailure.verification }
        } catch {
            if let old {
                try old.write(to: url, options: [.atomic, .completeFileProtection])
                let handle = try FileHandle(forWritingTo: url); try handle.synchronize(); try handle.close()
                guard try StrictJSON.boundedRead(url, maximum: 65_564) == old else { throw CloudFailure.verification }
            }
            else { try? FileManager.default.removeItem(at: url) }
            throw error
        }
    }
}
