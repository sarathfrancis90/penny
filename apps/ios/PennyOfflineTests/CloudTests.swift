import CryptoKit
import XCTest
@testable import PennyOffline

@MainActor final class FakeCloud: CloudTransport {
    let provider = "drive"
    var identityText = "synthetic-opaque-account-01"
    var accountEpoch = UUID()
    var onAccountChange: (() -> Void)?
    var objects: [String: Data] = [:]
    var hook: ((String) -> Void)?
    var failing: String?
    var failure = CloudFailure.transient
    var phases: [String] = []
    var customPages: [CloudRemotePage]?
    private var page = 0
    func identity() async throws -> String { await Task.yield(); return identityText }
    func switchAccount(_ identity: String) { identityText = identity; accountEpoch = UUID(); onAccountChange?() }
    private func suspend(_ phase: String) async throws {
        phases.append(phase); await Task.yield(); hook?(phase)
        if phase == failing { throw failure }
    }
    func upload(name: String, encryptedFile: URL) async throws {
        let bytes = try StrictJSON.boundedRead(encryptedFile, maximum: BackupArchive.maximumEnvelopeBytes)
        try await suspend(name.hasPrefix("snapshot-") ? "snapshotUpload" : "manifestUpload")
        guard objects[name] == nil else { throw CloudFailure.conflict }; objects[name] = bytes
    }
    func download(name: String, maximumBytes: Int) async throws -> Data {
        try await suspend(name.hasPrefix("snapshot-") ? "snapshotDownload" : "manifestDownload")
        guard let bytes = objects[name], bytes.count <= maximumBytes else { throw CloudFailure.verification }; return bytes
    }
    func list(token: String?) async throws -> CloudRemotePage {
        try await suspend("list")
        if token == nil { page = 0 }
        if let customPages { defer { page += 1 }; return customPages[min(page, customPages.count - 1)] }
        return CloudRemotePage(items: objects.keys.sorted().map { CloudRemoteItem(id: $0, name: $0) }, nextToken: nil)
    }
}

@MainActor final class CloudTests: XCTestCase {
    private func file(_ name: String) throws -> Data { try Data(contentsOf: XCTUnwrap(Bundle(for: Self.self).resourceURL).appendingPathComponent("fixtures/" + name)) }
    private func key() throws -> String {
        struct Vector: Decodable { let recoveryKey: String }
        return try JSONDecoder().decode(Vector.self, from: file("cloud-golden-vector-v1.json")).recoveryKey
    }
    private func fixture() throws -> CloudManifest { try CloudWire.decode(file("cloud-manifest-v1.json")) }
    private func saved(_ vault: VaultStore) throws -> CloudManifest? {
        struct Saved: Decodable { let lastGood: CloudManifest? }
        return try JSONDecoder().decode(Saved.self, from: vault.openCloudState(Data(contentsOf: vault.cloudStateURL))).lastGood
    }
    private func directory() -> URL { FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString) }
    func testMandatoryCloudVectorAndMutationCorpus() throws {
        let key = try key(), expected = try fixture()
        XCTAssertEqual(try CloudWire.accountTag(provider: "drive", identity: "synthetic-opaque-account-01"), expected.accountTag)
        XCTAssertEqual(try CloudWire.vaultTag("33333333-3333-4333-8333-333333333333"), expected.vaultTag)
        let manifest = try CloudWire.open(file("cloud-manifest-v1.pennymanifest"), key: key, provider: "drive", accountTag: expected.accountTag)
        XCTAssertEqual(manifest, expected)
        let snapshot = try CloudWire.verifySnapshot(file("cloud-snapshot-v1.pennybackup"), key: key, manifest: manifest)
        XCTAssertEqual(snapshot.recordCount, 10); XCTAssertEqual(snapshot.attachments.count, 1)
        let generated = try CloudWire.seal(manifest, key: key)
        XCTAssertEqual(try CloudWire.open(generated, key: key, provider: "drive", accountTag: expected.accountTag), manifest)
        XCTAssertThrowsError(try CloudWire.open(generated, key: BackupArchive.newRecoveryKey(), provider: "drive", accountTag: expected.accountTag))
        XCTAssertThrowsError(try CloudWire.open(generated, key: key, provider: "icloud", accountTag: expected.accountTag))
        XCTAssertThrowsError(try CloudWire.open(generated, key: key, provider: "drive", accountTag: String(repeating: "0", count: 64)))
        XCTAssertThrowsError(try CloudWire.open(file("cloud-snapshot-v1.pennybackup"), key: key, provider: "drive", accountTag: expected.accountTag))
        XCTAssertThrowsError(try BackupArchive.restore(generated, recoveryKey: key))
        let original = try XCTUnwrap(JSONSerialization.jsonObject(with: file("cloud-manifest-v1.json")) as? [String: Any])
        let corpus = try XCTUnwrap(JSONSerialization.jsonObject(with: file("cloud-conformance-v1.json")) as? [String: Any])
        for set in ["manifestMutations", "descriptorMutations"] {
            for mutation in try XCTUnwrap(corpus[set] as? [[String: Any]]) {
                var candidate = original; let field = try XCTUnwrap(mutation["field"] as? String)
                if set == "manifestMutations" { candidate[field] = mutation["value"] }
                else { var nested = try XCTUnwrap(candidate["snapshot"] as? [String: Any]); nested[field] = mutation["value"]; candidate["snapshot"] = nested }
                XCTAssertThrowsError(try CloudWire.decode(JSONSerialization.data(withJSONObject: candidate)), mutation["name"] as? String ?? "")
            }
        }
        XCTAssertThrowsError(try CloudWire.open(Data(repeating: 0, count: CloudWire.maximumEnvelope + 1), key: key, provider: "drive", accountTag: expected.accountTag))
        XCTAssertThrowsError(try CloudWire.accountTag(provider: "drive", identity: "bad\nidentity"))
    }
    func testDurableRevisionFrameLegacyUpgradeAndRestoreEpoch() throws {
        let dir = directory(); defer { try? FileManager.default.removeItem(at: dir) }
        let deviceKey = SymmetricKey(size: .bits256)
        let store = VaultStore(directory: dir, key: deviceKey)
        try store.replace(StrictJSON.snapshot(file("snapshot-v3.json")))
        let writer = store.writerId, epoch = store.restoreEpoch, revision = store.revision
        let reopened = VaultStore(directory: dir, key: deviceKey)
        XCTAssertEqual(reopened.writerId, writer); XCTAssertEqual(reopened.revision, revision); XCTAssertEqual(reopened.restoreEpoch, epoch)
        try reopened.save(Expense(merchant: "Later", amountMinor: 100, expenseDate: "2026-01-01", category: Categories.other))
        XCTAssertEqual(VaultStore(directory: dir, key: deviceKey).revision, revision + 1)
        try reopened.restore((try reopened.compatibilitySnapshot()))
        XCTAssertEqual(reopened.writerId, writer); XCTAssertNotEqual(reopened.restoreEpoch, epoch)
        XCTAssertEqual(VaultStore(directory: dir, key: deviceKey).restoreEpoch, reopened.restoreEpoch)
        let legacy = directory(); defer { try? FileManager.default.removeItem(at: legacy) }
        let legacyFile = legacy.appendingPathComponent("PennyOffline/vault-v1.pennyvault")
        try FileManager.default.createDirectory(at: legacyFile.deletingLastPathComponent(), withIntermediateDirectories: true)
        try VaultCipher.seal(file("snapshot-v2.json"), key: deviceKey).write(to: legacyFile)
        let upgraded = VaultStore(directory: legacy, key: deviceKey); XCTAssertTrue(upgraded.isReady)
        try upgraded.ensurePublicationIdentity()
        let again = VaultStore(directory: legacy, key: deviceKey)
        XCTAssertEqual(again.writerId, upgraded.writerId); XCTAssertEqual((try again.compatibilitySnapshot()).attachments, (try upgraded.compatibilitySnapshot()).attachments)
        enum Failure: Error { case write }
        let failed = VaultStore(directory: dir, key: deviceKey, commitCheckpoint: { if $0 == .committed { throw Failure.write } })
        let previousRevision = failed.revision, previousEpoch = failed.restoreEpoch
        XCTAssertThrowsError(try failed.restore(VaultSnapshot()))
        XCTAssertEqual(VaultStore(directory: dir, key: deviceKey).revision, previousRevision)
        XCTAssertEqual(VaultStore(directory: dir, key: deviceKey).restoreEpoch, previousEpoch)
    }
    func testPublicationVerifiesBothObjectsAndKeepsConcurrentEditsPending() async throws {
        let dir = directory(); defer { try? FileManager.default.removeItem(at: dir) }
        let deviceKey = SymmetricKey(size: .bits256), key = try key(), provider = FakeCloud()
        let vault = VaultStore(directory: dir, key: deviceKey); try vault.replace(StrictJSON.snapshot(file("snapshot-v3.json")))
        let cloud = CloudPublication(vault: vault, provider: provider, keyReader: { key })
        XCTAssertFalse(cloud.enabled); await cloud.enable(); XCTAssertTrue(cloud.enabled)
        let revision = vault.revision + 1
        provider.hook = { phase in
            if phase == "snapshotUpload" { try! vault.save(Expense(merchant: "During upload", amountMinor: 100, expenseDate: "2026-01-01", category: Categories.other)) }
        }
        await cloud.publish()
        XCTAssertNil(cloud.error); XCTAssertEqual(cloud.lastGood?.localRevision, revision); XCTAssertTrue(cloud.pendingChanges)
        XCTAssertEqual(provider.phases, ["list", "snapshotUpload", "snapshotDownload", "manifestUpload", "manifestDownload"])
        XCTAssertEqual(provider.objects.count, 2)
        let last = try XCTUnwrap(cloud.lastGood)
        _ = try CloudWire.verifySnapshot(XCTUnwrap(provider.objects[last.snapshotName]), key: key, manifest: last)
        for (name, bytes) in [("ios-cloud-runtime.pennymanifest", try XCTUnwrap(provider.objects[last.manifestName])), ("ios-cloud-runtime.pennybackup", try XCTUnwrap(provider.objects[last.snapshotName]))] {
            let artifact = XCTAttachment(data: bytes, uniformTypeIdentifier: "public.data"); artifact.name = name; artifact.lifetime = .keepAlways; add(artifact)
        }
        let reopened = VaultStore(directory: dir, key: deviceKey)
        let restarted = CloudPublication(vault: reopened, provider: provider, keyReader: { key })
        XCTAssertEqual(restarted.lastGood, last); XCTAssertTrue(restarted.pendingChanges)
        provider.hook = nil; await restarted.publish()
        XCTAssertNil(restarted.error); XCTAssertFalse(restarted.pendingChanges); XCTAssertEqual(provider.objects.count, 4)
        let second = try XCTUnwrap(restarted.lastGood)
        await restarted.publish()
        XCTAssertGreaterThan(try XCTUnwrap(restarted.lastGood).localRevision, second.localRevision)
        XCTAssertEqual(restarted.lastGood?.previousManifestId, second.manifestId)
        XCTAssertEqual(provider.objects.count, 6)
    }
    func testAllPublicationFailurePhasesPreserveLastGood() async throws {
        let key = try key()
        for phase in ["list", "snapshotUpload", "snapshotDownload", "manifestUpload", "manifestDownload"] {
            for failure in [CloudFailure.quota, .permission, .transient, .cancelled] {
                let dir = directory(); defer { try? FileManager.default.removeItem(at: dir) }
                let vault = VaultStore(directory: dir, key: SymmetricKey(size: .bits256)), provider = FakeCloud()
                let cloud = CloudPublication(vault: vault, provider: provider, keyReader: { key })
                await cloud.enable(); await cloud.publish()
                let original = try XCTUnwrap(saved(vault)), objects = provider.objects
                provider.failing = phase; provider.failure = failure
                await cloud.publish()
                XCTAssertEqual(try saved(vault), original, "\(phase) \(failure)")
                for (name, bytes) in objects { XCTAssertEqual(provider.objects[name], bytes) }
                XCTAssertNotNil(cloud.error); XCTAssertFalse(cloud.isBusy)
            }
        }
    }
    func testAccountSwitchAwayBackCancellationAndRestoreAtEverySuspension() async throws {
        let key = try key()
        for phase in ["list", "snapshotUpload", "snapshotDownload", "manifestUpload", "manifestDownload"] {
            for change in ["account", "cancel", "restore"] {
                let dir = directory(); defer { try? FileManager.default.removeItem(at: dir) }
                let vault = VaultStore(directory: dir, key: SymmetricKey(size: .bits256)), provider = FakeCloud()
                let cloud = CloudPublication(vault: vault, provider: provider, keyReader: { key })
                await cloud.enable(); await cloud.publish(); let last = try XCTUnwrap(saved(vault)), originals = provider.objects
                provider.hook = { at in
                    guard at == phase else { return }
                    if change == "account" { provider.switchAccount("different-opaque-account"); provider.switchAccount("synthetic-opaque-account-01") }
                    else if change == "cancel" { cloud.cancel() }
                    else { try! vault.restore((try vault.compatibilitySnapshot())) }
                }
                await cloud.publish()
                XCTAssertEqual(try saved(vault), last, "\(phase) \(change)")
                for (name, data) in originals { XCTAssertEqual(provider.objects[name], data) }
                if change != "cancel" { XCTAssertFalse(cloud.enabled) }
            }
        }
    }
    func testCleanInstallDiscoveryRestoreWrongKeyAndStalePreview() async throws {
        let dir = directory(); defer { try? FileManager.default.removeItem(at: dir) }
        let vault = VaultStore(directory: dir, key: SymmetricKey(size: .bits256)), provider = FakeCloud(), key = try key(), manifest = try fixture()
        provider.objects = [manifest.manifestName: try file("cloud-manifest-v1.pennymanifest"), manifest.snapshotName: try file("cloud-snapshot-v1.pennybackup")]
        let wrongKey = BackupArchive.newRecoveryKey()
        let wrong = CloudPublication(vault: vault, provider: provider, keyReader: { wrongKey })
        await wrong.discover(); XCTAssertTrue(wrong.history.isEmpty); XCTAssertNotNil(wrong.historyWarning); XCTAssertEqual((try vault.compatibilitySnapshot()).recordCount, 0)
        let cloud = CloudPublication(vault: vault, provider: provider, keyReader: { key })
        await cloud.discover(); XCTAssertEqual(cloud.history, [manifest]); XCTAssertFalse(cloud.enabled)
        await cloud.prepareRestore(manifest); let stale = try XCTUnwrap(cloud.preview)
        try vault.save(Expense(merchant: "Keep this edit", amountMinor: 100, expenseDate: "2026-01-01", category: Categories.other))
        await cloud.confirmRestore(stale); XCTAssertEqual((try vault.compatibilitySnapshot()).expenses.first?.merchant, "Keep this edit")
        await cloud.prepareRestore(manifest); await cloud.confirmRestore(try XCTUnwrap(cloud.preview))
        XCTAssertEqual((try vault.compatibilitySnapshot()).recordCount, 10); XCTAssertFalse(cloud.enabled)
        XCTAssertEqual(provider.objects.count, 2)
    }
    func testDiscoveryBoundsAndWriterConflictsDoNotChooseLatest() async throws {
        let dir = directory(); defer { try? FileManager.default.removeItem(at: dir) }
        let vault = VaultStore(directory: dir, key: SymmetricKey(size: .bits256)), provider = FakeCloud(), key = try key()
        let cloud = CloudPublication(vault: vault, provider: provider, keyReader: { key })
        provider.customPages = [CloudRemotePage(items: [], nextToken: "repeat")]
        await cloud.discover(); XCTAssertNotNil(cloud.error); XCTAssertTrue(cloud.history.isEmpty)
        provider.customPages = [CloudRemotePage(items: (0..<101).map { CloudRemoteItem(id: String($0), name: "unknown") }, nextToken: nil)]
        await cloud.discover(); XCTAssertNotNil(cloud.error)
        provider.customPages = nil
        let first = try fixture(); var conflict = first; conflict.manifestId = UUID().uuidString.lowercased(); conflict.snapshot.sha256 = String(repeating: "0", count: 64)
        var secondWriter = first; secondWriter.manifestId = UUID().uuidString.lowercased(); secondWriter.writerId = UUID().uuidString.lowercased()
        for manifest in [first, conflict, secondWriter] { provider.objects[manifest.manifestName] = try CloudWire.seal(manifest, key: key) }
        await cloud.discover(); XCTAssertNil(cloud.error); XCTAssertEqual(cloud.groups.count, 2)
        XCTAssertTrue(cloud.groups.contains { $0.hasConflict }); XCTAssertNil(cloud.preview); XCTAssertEqual((try vault.compatibilitySnapshot()).recordCount, 0)
    }
    func testCorruptReadbackRotatedKeyAndLocalStatusWriteFailurePreserveLastGood() async throws {
        for phase in ["snapshotDownload", "manifestDownload"] {
            let dir = directory(); defer { try? FileManager.default.removeItem(at: dir) }
            let vault = VaultStore(directory: dir, key: SymmetricKey(size: .bits256)), provider = FakeCloud(), key = try key()
            let cloud = CloudPublication(vault: vault, provider: provider, keyReader: { key })
            await cloud.enable(); await cloud.publish()
            let last = try XCTUnwrap(saved(vault)), originals = provider.objects
            provider.hook = { at in
                if at == phase {
                    for name in provider.objects.keys where originals[name] == nil {
                        if name.hasPrefix(phase == "snapshotDownload" ? "snapshot-" : "manifest-") { provider.objects[name] = Data("invalid".utf8) }
                    }
                }
            }
            await cloud.publish(); XCTAssertNotNil(cloud.error); XCTAssertEqual(try saved(vault), last)
            for (name, bytes) in originals { XCTAssertEqual(provider.objects[name], bytes) }
        }
        for phase in ["list", "snapshotUpload", "snapshotDownload", "manifestUpload", "manifestDownload"] {
            let dir = directory(); defer { try? FileManager.default.removeItem(at: dir) }
            let vault = VaultStore(directory: dir, key: SymmetricKey(size: .bits256)), provider = FakeCloud()
            var recoveryKey = try key()
            let cloud = CloudPublication(vault: vault, provider: provider, keyReader: { recoveryKey })
            await cloud.enable(); await cloud.publish(); let last = try XCTUnwrap(saved(vault))
            provider.hook = { if $0 == phase { recoveryKey = BackupArchive.newRecoveryKey() } }
            await cloud.publish(); XCTAssertFalse(cloud.enabled); XCTAssertEqual(try saved(vault), last)
        }
        let dir = directory(); defer { try? FileManager.default.removeItem(at: dir) }
        let vault = VaultStore(directory: dir, key: SymmetricKey(size: .bits256)), provider = FakeCloud(), key = try key()
        var failStatus = false
        let cloud = CloudPublication(vault: vault, provider: provider, keyReader: { key }, persistenceCheckpoint: { if failStatus { throw CloudFailure.verification } })
        await cloud.enable(); await cloud.publish(); let last = try XCTUnwrap(saved(vault))
        failStatus = true; await cloud.publish()
        XCTAssertEqual(cloud.lastGood, last); XCTAssertEqual(try saved(vault), last); XCTAssertNotNil(cloud.error)
    }
    func testPublicationReservesDiscoveryCapacityWithoutDeletingObjects() async throws {
        let key = try key()
        for (total, manifests, allowed) in [(998, 99, true), (999, 99, false), (100, 100, false)] {
            let dir = directory(); defer { try? FileManager.default.removeItem(at: dir) }
            let vault = VaultStore(directory: dir, key: SymmetricKey(size: .bits256)), provider = FakeCloud()
            let items = (0..<total).map { index in
                CloudRemoteItem(id: String(index), name: index < manifests ? "manifest-\(UUID().uuidString.lowercased()).pennymanifest" : "unrecognized-\(index)")
            }
            provider.customPages = stride(from: 0, to: total, by: 100).map { start in
                CloudRemotePage(items: Array(items[start..<min(start + 100, total)]), nextToken: start + 100 < total ? String(start + 100) : nil)
            }
            let cloud = CloudPublication(vault: vault, provider: provider, keyReader: { key })
            await cloud.enable(); let revision = vault.revision
            await cloud.publish()
            if allowed { XCTAssertNil(cloud.error); XCTAssertEqual(provider.objects.count, 2); XCTAssertNotNil(cloud.lastGood) }
            else { XCTAssertNotNil(cloud.error); XCTAssertTrue(provider.objects.isEmpty); XCTAssertEqual(vault.revision, revision) }
        }
    }
    func testMandatoryAndroidCloudRuntimePairRestoresAllDomainsAndReceipts() async throws {
        let key = try key(), expected = try StrictJSON.snapshot(file("snapshot-v3.json")), provider = FakeCloud()
        let manifestBytes = try file("native-exports/android-cloud-v1.pennymanifest")
        let snapshotBytes = try file("native-exports/android-cloud-v1.pennybackup")
        let tag = try CloudWire.accountTag(provider: "drive", identity: "synthetic-opaque-account-01")
        let manifest = try CloudWire.open(manifestBytes, key: key, provider: "drive", accountTag: tag)
        provider.objects = [manifest.manifestName: manifestBytes, manifest.snapshotName: snapshotBytes]
        let dir = directory(); defer { try? FileManager.default.removeItem(at: dir) }
        let deviceKey = SymmetricKey(size: .bits256), vault = VaultStore(directory: dir, key: deviceKey)
        let cloud = CloudPublication(vault: vault, provider: provider, keyReader: { key })
        await cloud.discover(); XCTAssertEqual(cloud.history, [manifest])
        await cloud.prepareRestore(manifest); await cloud.confirmRestore(try XCTUnwrap(cloud.preview))
        XCTAssertNil(cloud.error)
        let result = (try VaultStore(directory: dir, key: deviceKey).compatibilitySnapshot())
        XCTAssertEqual(result.vaultId, expected.vaultId)
        XCTAssertEqual(result.expenses.sorted { $0.id < $1.id }, expected.expenses.sorted { $0.id < $1.id })
        XCTAssertEqual(result.attachments.sorted { $0.id < $1.id }, expected.attachments.sorted { $0.id < $1.id })
        XCTAssertEqual(result.budgets.sorted { $0.id < $1.id }, expected.budgets.sorted { $0.id < $1.id })
        XCTAssertEqual(result.incomeSources.sorted { $0.id < $1.id }, expected.incomeSources.sorted { $0.id < $1.id })
        XCTAssertEqual(result.incomeEntries.sorted { $0.id < $1.id }, expected.incomeEntries.sorted { $0.id < $1.id })
        XCTAssertEqual(result.savingsGoals.sorted { $0.id < $1.id }, expected.savingsGoals.sorted { $0.id < $1.id })
        XCTAssertEqual(result.savingsEntries.sorted { $0.id < $1.id }, expected.savingsEntries.sorted { $0.id < $1.id })
        XCTAssertEqual(result.recurringExpenses.sorted { $0.id < $1.id }, expected.recurringExpenses.sorted { $0.id < $1.id })
    }
    func testDefaultBuildCannotConstructCloudKit() throws {
        XCTAssertFalse(CloudBuildConfiguration.available)
        XCTAssertThrowsError(try CloudKitTransport()) { XCTAssertEqual($0 as? CloudFailure, .unavailable) }
    }
}
