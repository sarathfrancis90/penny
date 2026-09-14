import CryptoKit
import Foundation
import Observation
import Security

struct VaultCipher {
    static let context = Data("PENNY-OFFLINE-LOCAL:1".utf8)
    static func seal(_ data: Data, key: SymmetricKey) throws -> Data {
        guard let sealed = try AES.GCM.seal(data, using: key, authenticating: context).combined else { throw ExpenseError.lockedVault }
        return sealed
    }
    static func open(_ data: Data, key: SymmetricKey) throws -> Data {
        try AES.GCM.open(AES.GCM.SealedBox(combined: data), using: key, authenticating: context)
    }
}

enum DeviceKey {
    static func load(create: Bool) throws -> SymmetricKey {
        let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword,
                                   kSecAttrService as String: "ca.penny.offline.dev.vault",
                                   kSecAttrAccount as String: "local-v1"]
        var read = query
        read[kSecReturnData as String] = true
        var result: CFTypeRef?
        let status = SecItemCopyMatching(read as CFDictionary, &result)
        if status == errSecSuccess, let data = result as? Data, data.count == 32 { return SymmetricKey(data: data) }
        guard status == errSecItemNotFound else { throw ExpenseError.keychain(status) }
        guard create else { throw ExpenseError.missingKey }
        return try createAbsent()
    }
    /// Atomic create-only operation for explicit repair. A newly appearing alias
    /// is a conflict; it can never be silently adopted as this operation's key.
    static func createAbsent() throws -> SymmetricKey {
        let key = SymmetricKey(size: .bits256)
        var add: [String: Any] = [kSecClass as String: kSecClassGenericPassword,
                                  kSecAttrService as String: "ca.penny.offline.dev.vault",
                                  kSecAttrAccount as String: "local-v1"]
        add[kSecValueData as String] = key.withUnsafeBytes { Data($0) }
        add[kSecAttrAccessible as String] = kSecAttrAccessibleWhenUnlockedThisDeviceOnly
        add[kSecAttrSynchronizable as String] = false
        let inserted = SecItemAdd(add as CFDictionary, nil)
        guard inserted == errSecSuccess else { throw ExpenseError.keychain(inserted) }
        return key
    }
}

@MainActor @Observable
final class VaultStore {
    private(set) var liveBody = VaultSnapshot()
    var snapshot: VaultSnapshot { get throws { try compatibilitySnapshot() } }
    var receiptDescriptors: [LocalReceiptDescriptor] { receiptReferences }
    private(set) var snapshotBytes = 0
    private(set) var isReady = false
    private(set) var revision = 0
    private(set) var writerId = UUID().uuidString.lowercased()
    private(set) var restoreEpoch = UUID().uuidString.lowercased()
    private var hasDurableIdentity = false
    var errorMessage: String?
    private let file: URL
    private var isWriting = false
    private var diskDigest: String?
    private var storeId = UUID().uuidString.lowercased()
    private var receiptReferences: [LocalReceiptDescriptor] = []
    private let localReceiptOwner = UUID()
    private var key: SymmetricKey?
    private let suppliedKey: SymmetricKey?
    private let deviceKeyReader: @Sendable (Bool) throws -> SymmetricKey
    private let deviceKeyCreator: @Sendable () throws -> SymmetricKey
    private let hydrationCheckpoint: (@Sendable () throws -> Void)?
    // Fault injection exercises transaction boundaries without changing crypto.
    enum CommitStage: Sendable { case staged, rollbackSaved, committed, verified, journalCleared }
    private let commitCheckpoint: (@Sendable (CommitStage) throws -> Void)?

    init(directory: URL? = nil, key: SymmetricKey? = nil, deviceKeyReader: @escaping @Sendable (Bool) throws -> SymmetricKey = { try DeviceKey.load(create: $0) }, deviceKeyCreator: @escaping @Sendable () throws -> SymmetricKey = { try DeviceKey.createAbsent() }, commitCheckpoint: (@Sendable (CommitStage) throws -> Void)? = nil, hydrationCheckpoint: (@Sendable () throws -> Void)? = nil) {
        let support = directory ?? FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        file = support.appendingPathComponent("PennyOffline", isDirectory: true).appendingPathComponent("vault-v1.pennyvault")
        suppliedKey = key
        self.deviceKeyReader = deviceKeyReader
        self.deviceKeyCreator = deviceKeyCreator
        self.commitCheckpoint = commitCheckpoint
        self.hydrationCheckpoint = hydrationCheckpoint
        load()
    }
    var expenses: [Expense] { liveBody.expenses.sorted { $0.expenseDate == $1.expenseDate ? $0.createdAt > $1.createdAt : $0.expenseDate > $1.expenseDate } }
    var currentMonthTotal: Int64 {
        let prefix = String(CivilDate.string(Date()).prefix(7))
        return expenses.filter { $0.expenseDate.hasPrefix(prefix) }.reduce(0) { $0 + $1.amountMinor }
    }
    func load() {
        guard !isWriting else { return }
        do {
            let storage = try DurableVaultStorage(file.deletingLastPathComponent(), hydrationCheckpoint: hydrationCheckpoint)
            let localKey = try storage.leased {
                // Capture the encrypted source even when platform key loading
                // fails, so explicit verified recovery can guard its replacement.
                diskDigest = try storage.liveBytes().map(DurableVaultStorage.digest)
                return try suppliedKey ?? deviceKeyReader(storage.liveBytes() == nil && !storage.establishedWithoutLive())
            }
            try storage.leased {
                diskDigest = try storage.liveBytes().map(DurableVaultStorage.digest)
                if let decoded = try storage.loadLive(key: localKey, initial: LocalVaultMetadata(writerId: writerId, revision: revision, restoreEpoch: restoreEpoch), storeId: storeId) { adopt(decoded) }
                diskDigest = try storage.liveBytes().map(DurableVaultStorage.digest)
            }
            key = localKey
            isReady = true
            errorMessage = nil
        } catch {
            isReady = false
            errorMessage = (error as? ExpenseError)?.localizedDescription ?? ExpenseError.lockedVault.localizedDescription
        }
    }
    func save(_ expense: Expense, attachments: [ReceiptAttachment]? = nil) throws {
        if attachments == nil && hasDurableIdentity {
            _ = try DurableVaultStorage.expenseEditProposal(expense, body: liveBody, receipts: receiptReferences)
            let request = try liveEditRequest(); isWriting = true; defer { isWriting = false }
            do { let result = try request.take().run(expense, checkpoint: commitCheckpoint); adopt(result.0); diskDigest = result.1 }
            catch { isReady = false; errorMessage = ExpenseError.lockedVault.localizedDescription; throw error }
        }
        else { try replace(expenseProposal(expense, attachments: attachments)) }
    }
    func saveAsync(_ expense: Expense, attachments: [ReceiptAttachment]? = nil, expectedOriginal: Expense? = nil) async throws {
        if let expectedOriginal {
            guard liveBody.expenses.first(where: { $0.id == expense.id }) == expectedOriginal else { throw CloudFailure.staleRestore }
        }
        if attachments != nil { try await replaceAsync(expenseProposal(expense, attachments: attachments)); return }
        _ = try DurableVaultStorage.expenseEditProposal(expense, body: liveBody, receipts: receiptReferences)
        try await ensurePublicationIdentityAsync()
        if let expectedOriginal {
            guard liveBody.expenses.first(where: { $0.id == expense.id }) == expectedOriginal else { throw CloudFailure.staleRestore }
        }
        let request = try liveEditRequest(); isWriting = true; defer { isWriting = false }
        do { let result = try await ArchiveWorker.shared.editExpense(expense, request: request, checkpoint: commitCheckpoint); adopt(result.0); diskDigest = result.1 }
        catch { isReady = false; errorMessage = ExpenseError.lockedVault.localizedDescription; throw error }
    }
    private func liveEditRequest() throws -> V4Transfer<DurableVaultStorage.LiveEditRequest> {
        let existing = try existingReplacementKey(), supplied = suppliedKey, reader = deviceKeyReader
        let request = try DurableVaultStorage.LiveEditRequest(directory: file.deletingLastPathComponent(), key: existing,
            owner: localReceiptOwner, digest: diskDigest, storeId: storeId,
            metadata: LocalVaultMetadata(writerId: writerId, revision: revision, restoreEpoch: restoreEpoch),
            currentKey: { try supplied ?? reader(false) }, hydrationCheckpoint: hydrationCheckpoint)
        return V4Transfer(request, cleanup: { _ in })
    }
    func compatibilitySnapshot() throws -> VaultSnapshot {
        let existing = try existingReplacementKey()
        let storage = try DurableVaultStorage(file.deletingLastPathComponent(), hydrationCheckpoint: hydrationCheckpoint)
        return try storage.leased {
            guard try storage.liveBytes().map(DurableVaultStorage.digest) == diskDigest else { throw CloudFailure.staleRestore }
            if let loaded = try storage.load(key: existing) { return loaded.snapshot }
            guard !hasDurableIdentity else { throw ExpenseError.lockedVault }; return liveBody
        }
    }
    func openReceipt(_ id: String) async throws -> LiveReceiptImage {
        let (bytes, owner) = try await ArchiveWorker.shared.readReceipt(id, request: captureV4Export())
        do { try Task.checkCancellation(); return LiveReceiptImage(id: id, bytes: bytes, owner: owner) }
        catch { try owner.close(); throw error }
    }
    private func expenseProposal(_ expense: Expense, attachments: [ReceiptAttachment]?) throws -> VaultSnapshot {
        try expense.validate()
        var next = try compatibilitySnapshot()
        if let index = next.expenses.firstIndex(where: { $0.id == expense.id }) { next.expenses[index] = expense }
        else { next.expenses.append(expense) }
        if let attachments {
            guard attachments.allSatisfy({ $0.expenseId == expense.id }) else { throw ExpenseError.invalidSnapshot }
            next.attachments.removeAll { $0.expenseId == expense.id }
            next.attachments.append(contentsOf: attachments)
        }
        return next
    }
    func receipts(for expenseId: String) throws -> [ReceiptAttachment] { try compatibilitySnapshot().attachments.filter { $0.expenseId == expenseId } }
    func deleteAsync(_ id: String) async throws {
        var next = try compatibilitySnapshot(); next.expenses.removeAll { $0.id == id }; next.attachments.removeAll { $0.expenseId == id }; try await replaceAsync(next)
    }
    func delete(_ id: String) throws {
        var next = try compatibilitySnapshot()
        next.expenses.removeAll { $0.id == id }
        next.attachments.removeAll { $0.expenseId == id }
        try replace(next)
    }
    func replace(_ next: VaultSnapshot) throws {
        guard isReady, let key else { throw ExpenseError.lockedVault }
        try commit(next, key: key)
    }
    /// Internal synchronous local seam. Never provisions a device key.
    func captureLocalReceiptTarget() throws -> DurableVaultStorage.ReceivingBinding {
        let existing = try existingReplacementKey()
        return try DurableVaultStorage.ReceivingBinding.capture(directory: file.deletingLastPathComponent(), key: existing,
            owner: localReceiptOwner, digest: diskDigest, storeId: storeId,
            source: LocalVaultMetadata(writerId: writerId, revision: revision, restoreEpoch: restoreEpoch))
    }
    func captureRepairTarget() throws -> DurableVaultStorage.RepairBinding {
        guard !isWriting else { throw CloudFailure.staleRestore }
        let observation = try DurableVaultStorage.RepairKey.read { try suppliedKey ?? deviceKeyReader(false) }
        return try DurableVaultStorage.RepairBinding.capture(directory: file.deletingLastPathComponent(), owner: localReceiptOwner,
            cachedDigest: diskDigest, storeId: storeId, metadata: LocalVaultMetadata(writerId: writerId, revision: revision, restoreEpoch: restoreEpoch), observedKey: observation)
    }
    func ownsRepairTarget(_ binding: DurableVaultStorage.RepairBinding) -> Bool { binding.belongs(to: localReceiptOwner) }
    func validateRepairTarget(_ binding: DurableVaultStorage.RepairBinding) throws {
        guard matchesRepairTarget(binding) else { throw CloudFailure.staleRestore }
        try binding.validate { try suppliedKey ?? deviceKeyReader(false) }
    }
    func matchesRepairTarget(_ binding: DurableVaultStorage.RepairBinding) -> Bool {
        !isWriting && binding.matches(owner: localReceiptOwner, digest: diskDigest, storeId: storeId,
            metadata: LocalVaultMetadata(writerId: writerId, revision: revision, restoreEpoch: restoreEpoch))
    }
    /// Explicit repair alone may install when the existing vault cannot open.
    /// Archive validation and owned input close have completed before this call.
    func installRepair(_ snapshot: VaultSnapshot, binding: DurableVaultStorage.RepairBinding) async throws {
        guard ownsRepairTarget(binding) else { throw CloudFailure.staleRestore }
        guard matchesRepairTarget(binding) else { binding.close(); throw CloudFailure.staleRestore }
        isWriting = true; defer { isWriting = false }
        let supplied = suppliedKey, reader = deviceKeyReader, create = deviceKeyCreator
        let owned = V4Transfer(binding, cleanup: { $0.close() })
        do {
            let (loaded, digest, installedKey) = try await ArchiveWorker.shared.repair(snapshot, binding: owned,
                currentKey: { try supplied ?? reader(false) }, createKey: create, checkpoint: commitCheckpoint)
            adopt(loaded); diskDigest = digest; key = installedKey; isReady = true; errorMessage = nil
        } catch { isReady = false; errorMessage = ExpenseError.lockedVault.localizedDescription; throw error }
    }
    private func existingReplacementKey() throws -> SymmetricKey {
        try Task.checkCancellation()
        guard !isWriting, isReady, let key else { throw ExpenseError.lockedVault }
        do {
            let existing = try suppliedKey ?? deviceKeyReader(false)
            guard existing == key else { throw ExpenseError.missingKey }; return existing
        } catch { isReady = false; errorMessage = ExpenseError.lockedVault.localizedDescription; throw error }
    }
    func beginLocalReceiptReplacement(_ body: VaultSnapshot, receipts: [DurableReceiptDeclaration]) throws -> DurableVaultStorage.Preparation {
        try beginLocalReceiptReplacement(captureLocalReceiptTarget(), body: body, receipts: receipts)
    }
    func beginLocalReceiptReplacement(_ binding: DurableVaultStorage.ReceivingBinding, body: VaultSnapshot,
                                     receipts: [DurableReceiptDeclaration], cancellation: @escaping () throws -> Void = { try Task.checkCancellation() }) throws -> DurableVaultStorage.Preparation {
        defer { binding.invalidate(owner: localReceiptOwner) }
        let existing = try existingReplacementKey()
        guard binding.matches(owner: localReceiptOwner, digest: diskDigest, storeId: storeId,
            source: LocalVaultMetadata(writerId: writerId, revision: revision, restoreEpoch: restoreEpoch)) else { throw CloudFailure.staleRestore }
        return try binding.begin(body: body, receipts: receipts, owner: localReceiptOwner, key: existing, cancellation: cancellation)
    }
    func captureV4Export() throws -> V4Transfer<DurableVaultStorage.ExportRequest> {
        let existing = try existingReplacementKey()
        let request = try DurableVaultStorage.ExportRequest(directory: file.deletingLastPathComponent(), key: existing,
            owner: localReceiptOwner, digest: diskDigest, storeId: storeId,
            metadata: LocalVaultMetadata(writerId: writerId, revision: revision, restoreEpoch: restoreEpoch))
        return V4Transfer(request, cleanup: { _ in })
    }
    func ownsLocalReceiptCandidate(_ candidate: DurableVaultStorage.InactiveCandidate) -> Bool { candidate.belongs(to: localReceiptOwner) }
    /// Reserve on MainActor; the sole candidate owner and all leased publication
    /// work (including final hydration) move to ArchiveWorker.
    func installLocalReceiptReplacementAsync(_ candidate: DurableVaultStorage.InactiveCandidate) async throws {
        let owner = localReceiptOwner, sourceRevision = revision, sourceWriter = writerId, sourceEpoch = restoreEpoch
        let sourceStore = storeId, sourceDigest = diskDigest, sourceKey = key
        let supplied = suppliedKey, reader = deviceKeyReader
        let validateIdentity: @Sendable (LocalReceiptTarget, SymmetricKey) throws -> Void = { target, candidateKey in
            try Task.checkCancellation()
            guard target.owner == owner, target.metadata.revision == sourceRevision,
                  target.metadata.writerId == sourceWriter, target.metadata.restoreEpoch == sourceEpoch,
                  target.storeId == sourceStore, target.digest == sourceDigest, sourceKey == candidateKey else { throw CloudFailure.staleRestore }
        }
        let validate: @Sendable (LocalReceiptTarget, SymmetricKey) throws -> Void = { target, candidateKey in
            try validateIdentity(target, candidateKey)
            guard try (supplied ?? reader(false)) == candidateKey else { throw ExpenseError.missingKey }
        }
        var entered = false
        defer { if entered { isWriting = false } }
        do {
            let transfer = try candidate.reserve(owner: owner) { target, candidateKey in
                guard !isWriting, isReady else { throw CloudFailure.staleRestore }
                try validateIdentity(target, candidateKey)
                isWriting = true; entered = true
                try validate(target, candidateKey)
            }
            let (loaded, digest, installedKey) = try await ArchiveWorker.shared.installCandidate(transfer, owner: owner, validate: validate, checkpoint: commitCheckpoint)
            // No cancellation throw after a successful durable result: publication
            // already applied its cancellation/rollback policy on the worker.
            guard isWriting, isReady, revision == sourceRevision, writerId == sourceWriter, restoreEpoch == sourceEpoch,
                  storeId == sourceStore, diskDigest == sourceDigest, key == sourceKey else { throw CloudFailure.staleRestore }
            guard try (supplied ?? reader(false)) == installedKey else { throw ExpenseError.missingKey }
            adopt(loaded); diskDigest = digest; key = installedKey; isReady = true; errorMessage = nil
        } catch {
            if entered { isReady = false; errorMessage = ExpenseError.lockedVault.localizedDescription }
            throw error
        }
    }
    func installLocalReceiptReplacement(_ candidate: DurableVaultStorage.InactiveCandidate) throws {
        var entered = false
        defer { if entered { isWriting = false } }
        do {
            let (loaded, digest, installedKey) = try candidate.install(owner: localReceiptOwner, validate: { target, candidateKey in
                try Task.checkCancellation()
                guard (!isWriting || entered), isReady, revision == target.metadata.revision,
                      writerId == target.metadata.writerId, restoreEpoch == target.metadata.restoreEpoch,
                      storeId == target.storeId, diskDigest == target.digest, let key, key == candidateKey else { throw CloudFailure.staleRestore }
                isWriting = true; entered = true
                let existing = try suppliedKey ?? deviceKeyReader(false)
                guard existing == candidateKey else { throw ExpenseError.missingKey }
            }, checkpoint: commitCheckpoint)
            adopt(loaded); diskDigest = digest; key = installedKey; isReady = true; errorMessage = nil
        } catch {
            if entered { isReady = false; errorMessage = ExpenseError.lockedVault.localizedDescription }
            throw error
        }
    }
    /// Called only after backup authentication, validation, and explicit replacement confirmation.
    func restore(_ next: VaultSnapshot, expectedRevision: Int? = nil) throws {
        guard expectedRevision == nil || expectedRevision == revision else { throw ExpenseError.invalidSnapshot }
        try next.validate()
        let recoveryDeviceKey = try suppliedKey ?? deviceKeyReader(true)
        try commit(next, key: recoveryDeviceKey, restoring: true)
        key = recoveryDeviceKey
        isReady = true
        errorMessage = nil
    }
    func ensurePublicationIdentityAsync() async throws { if !hasDurableIdentity { try await replaceAsync(compatibilitySnapshot()) } }
    func ensurePublicationIdentity() throws {
        if !hasDurableIdentity { try replace(compatibilitySnapshot()) }
    }
    /// Each attempt reserves a durable generation before creating remote objects.
    /// Retries after an uncertain server result must never reuse a writer revision.
    func reservePublicationRevision() throws { try replace(compatibilitySnapshot()) }
    var cloudStateURL: URL { file.deletingLastPathComponent().appendingPathComponent("cloud-state.pennyvault") }
    func sealCloudState(_ data: Data) throws -> Data {
        guard isReady, let key, data.count <= 65_536 else { throw ExpenseError.lockedVault }
        return try AES.GCM.seal(data, using: key, authenticating: Data("PENNY-OFFLINE-CLOUD-LOCAL:1".utf8)).combined!
    }
    func openCloudState(_ data: Data) throws -> Data {
        guard isReady, let key, data.count <= 65_536 + 28 else { throw ExpenseError.lockedVault }
        return try AES.GCM.open(AES.GCM.SealedBox(combined: data), using: key, authenticating: Data("PENNY-OFFLINE-CLOUD-LOCAL:1".utf8))
    }
    private func commit(_ next: VaultSnapshot, key: SymmetricKey, restoring: Bool = false) throws {
        try apply(PreparedVaultWrite.prepare(next, key: key, revision: revision, writerId: writerId, restoreEpoch: restoreEpoch, restoring: restoring, sourceDigest: diskDigest, sourceStoreId: storeId))
    }
    func prepareWrite(_ next: VaultSnapshot, restoring: Bool = false, expectedRevision: Int? = nil) async throws -> PreparedVaultWrite {
        guard !isWriting, expectedRevision == nil || expectedRevision == revision else { throw CloudFailure.staleRestore }
        guard restoring || isReady else { throw ExpenseError.lockedVault }
        let deviceKey = try restoring ? (suppliedKey ?? deviceKeyReader(true)) : key
        guard let deviceKey else { throw ExpenseError.lockedVault }
        return try await ArchiveWorker.shared.prepareVault(next, key: deviceKey, revision: revision, writerId: writerId, restoreEpoch: restoreEpoch, restoring: restoring, sourceDigest: diskDigest, sourceStoreId: storeId)
    }
    func replaceAsync(_ next: VaultSnapshot) async throws { try await applyAsync(prepareWrite(next)) }
    func restoreAsync(_ next: VaultSnapshot, expectedRevision: Int? = nil) async throws {
        try await applyAsync(prepareWrite(next, restoring: true, expectedRevision: expectedRevision))
    }
    private func applyAsync(_ prepared: PreparedVaultWrite) async throws {
        guard !isWriting, revision == prepared.sourceRevision, writerId == prepared.metadata.writerId,
              restoreEpoch == prepared.sourceRestoreEpoch, storeId == prepared.sourceStoreId, diskDigest == prepared.sourceDigest else { throw CloudFailure.staleRestore }
        isWriting = true; defer { isWriting = false }
        do {
            let (loaded, digest) = try await ArchiveWorker.shared.commitVault(prepared, directory: file.deletingLastPathComponent(), receipts: receiptReferences, checkpoint: commitCheckpoint)
            adopt(loaded); diskDigest = digest; key = prepared.key; isReady = true; errorMessage = nil
        } catch {
            // Disk recovery decides any uncertain transition before further writes.
            isReady = false; errorMessage = ExpenseError.lockedVault.localizedDescription; throw error
        }
    }
    /// Only the non-suspending disk replacement runs on MainActor. The expensive
    /// image validation, encoding and encryption were completed on the worker.
    /// Reject any proposal whose base generation changed while it was prepared.
    func apply(_ prepared: PreparedVaultWrite) throws {
        try Task.checkCancellation()
        guard !isWriting, revision == prepared.sourceRevision, writerId == prepared.metadata.writerId,
              restoreEpoch == prepared.sourceRestoreEpoch else { throw CloudFailure.staleRestore }
        guard prepared.sourceStoreId == storeId, prepared.sourceDigest == diskDigest else { throw CloudFailure.staleRestore }
        let storage = try DurableVaultStorage(file.deletingLastPathComponent(), hydrationCheckpoint: hydrationCheckpoint)
        do {
            try storage.leased {
                let loaded = try storage.commit(prepared, sourceDigest: prepared.sourceDigest, storeId: storeId, receipts: receiptReferences, checkpoint: commitCheckpoint)
                diskDigest = try storage.liveBytes().map(DurableVaultStorage.digest)
                adopt(loaded)
            }
            key = prepared.key; isReady = true; errorMessage = nil
        } catch {
            // An uncertain rollback never permits writes using cached identity.
            let current = try? storage.leased { try storage.liveBytes().map(DurableVaultStorage.digest) }
            if current != diskDigest { isReady = false; errorMessage = ExpenseError.lockedVault.localizedDescription }
            throw error
        }
    }
    func leaseSnapshot() throws -> DurableSnapshotLease {
        guard !isWriting, isReady, let key else { throw ExpenseError.lockedVault }
        let storage = try DurableVaultStorage(file.deletingLastPathComponent(), hydrationCheckpoint: hydrationCheckpoint)
        return try storage.leased { try storage.pinSnapshot(key: key) }
    }
    @discardableResult func collectReceiptGarbage() throws -> Int {
        guard !isWriting, isReady, let key else { throw ExpenseError.lockedVault }
        let storage = try DurableVaultStorage(file.deletingLastPathComponent(), hydrationCheckpoint: hydrationCheckpoint)
        return try storage.leased { try storage.collectGarbage(key: key) }
    }
    private func adopt(_ loaded: DurableLiveLoaded) {
        liveBody = loaded.body; snapshotBytes = loaded.snapshotBytes; receiptReferences = loaded.receipts
        writerId = loaded.metadata.writerId; revision = loaded.metadata.revision; restoreEpoch = loaded.metadata.restoreEpoch
        storeId = loaded.storeId; hasDurableIdentity = true; isReady = true; errorMessage = nil
    }
    private func adopt(_ loaded: DurableLoaded) {
        liveBody = loaded.snapshot; liveBody.attachments = []; snapshotBytes = loaded.snapshotBytes; receiptReferences = loaded.receipts
        if let local = loaded.metadata {
            writerId = local.writerId; revision = local.revision; restoreEpoch = local.restoreEpoch; hasDurableIdentity = true
        }
        if let local = loaded.storeId { storeId = local }
    }
}

@MainActor final class LiveReceiptImage: Identifiable {
    let id: String
    private(set) var bytes: Data?
    private let owner: V4Transfer<DurableVaultStorage.ExportSource>
    init(id: String, bytes: Data, owner: V4Transfer<DurableVaultStorage.ExportSource>) { self.id = id; self.bytes = bytes; self.owner = owner }
    func close() throws { bytes = nil; try owner.close() }
}
