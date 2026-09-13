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
        let key = SymmetricKey(size: .bits256)
        var add = query
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
    private(set) var snapshot = VaultSnapshot()
    private(set) var snapshotBytes = 0
    private(set) var isReady = false
    private(set) var revision = 0
    private(set) var writerId = UUID().uuidString.lowercased()
    private(set) var restoreEpoch = UUID().uuidString.lowercased()
    private var hasDurableIdentity = false
    var errorMessage: String?
    private let file: URL
    private var key: SymmetricKey?
    private let suppliedKey: SymmetricKey?
    // Fault injection exercises transaction boundaries without changing crypto.
    enum CommitStage { case staged, rollbackSaved, committed }
    private let commitCheckpoint: ((CommitStage) throws -> Void)?

    init(directory: URL? = nil, key: SymmetricKey? = nil, commitCheckpoint: ((CommitStage) throws -> Void)? = nil) {
        let support = directory ?? FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        file = support.appendingPathComponent("PennyOffline", isDirectory: true).appendingPathComponent("vault-v1.pennyvault")
        suppliedKey = key
        self.commitCheckpoint = commitCheckpoint
        load()
    }
    var expenses: [Expense] { snapshot.expenses.sorted { $0.expenseDate == $1.expenseDate ? $0.createdAt > $1.createdAt : $0.expenseDate > $1.expenseDate } }
    var currentMonthTotal: Int64 {
        let prefix = String(CivilDate.string(Date()).prefix(7))
        return expenses.filter { $0.expenseDate.hasPrefix(prefix) }.reduce(0) { $0 + $1.amountMinor }
    }
    func load() {
        do {
            let exists = FileManager.default.fileExists(atPath: file.path)
            let localKey = try suppliedKey ?? DeviceKey.load(create: !exists)
            if exists {
                let clear = try VaultCipher.open(StrictJSON.boundedRead(file, maximum: 16 * 1_024 * 1_024), key: localKey)
                let decoded = try LocalVaultFrame.decode(clear)
                snapshot = decoded.snapshot; snapshotBytes = decoded.snapshotBytes
                if let metadata = decoded.metadata {
                    writerId = metadata.writerId; revision = metadata.revision; restoreEpoch = metadata.restoreEpoch; hasDurableIdentity = true
                }
            }
            key = localKey
            isReady = true
            errorMessage = nil
        } catch {
            isReady = false
            errorMessage = (error as? ExpenseError)?.localizedDescription ?? ExpenseError.lockedVault.localizedDescription
        }
    }
    func save(_ expense: Expense, attachments: [ReceiptAttachment]? = nil) throws { try replace(expenseProposal(expense, attachments: attachments)) }
    func saveAsync(_ expense: Expense, attachments: [ReceiptAttachment]? = nil) async throws { try await replaceAsync(expenseProposal(expense, attachments: attachments)) }
    private func expenseProposal(_ expense: Expense, attachments: [ReceiptAttachment]?) throws -> VaultSnapshot {
        try expense.validate()
        var next = snapshot
        if let index = next.expenses.firstIndex(where: { $0.id == expense.id }) { next.expenses[index] = expense }
        else { next.expenses.append(expense) }
        if let attachments {
            guard attachments.allSatisfy({ $0.expenseId == expense.id }) else { throw ExpenseError.invalidSnapshot }
            next.attachments.removeAll { $0.expenseId == expense.id }
            next.attachments.append(contentsOf: attachments)
        }
        return next
    }
    func receipts(for expenseId: String) -> [ReceiptAttachment] { snapshot.attachments.filter { $0.expenseId == expenseId } }
    func deleteAsync(_ id: String) async throws {
        var next = snapshot; next.expenses.removeAll { $0.id == id }; next.attachments.removeAll { $0.expenseId == id }; try await replaceAsync(next)
    }
    func delete(_ id: String) throws {
        var next = snapshot
        next.expenses.removeAll { $0.id == id }
        next.attachments.removeAll { $0.expenseId == id }
        try replace(next)
    }
    func replace(_ next: VaultSnapshot) throws {
        guard isReady, let key else { throw ExpenseError.lockedVault }
        try commit(next, key: key)
    }
    /// Called only after backup authentication, validation, and explicit replacement confirmation.
    func restore(_ next: VaultSnapshot, expectedRevision: Int? = nil) throws {
        guard expectedRevision == nil || expectedRevision == revision else { throw ExpenseError.invalidSnapshot }
        try next.validate()
        let recoveryDeviceKey = try suppliedKey ?? DeviceKey.load(create: true)
        try commit(next, key: recoveryDeviceKey, restoring: true)
        key = recoveryDeviceKey
        isReady = true
        errorMessage = nil
    }
    func ensurePublicationIdentityAsync() async throws { if !hasDurableIdentity { try await replaceAsync(snapshot) } }
    func ensurePublicationIdentity() throws {
        if !hasDurableIdentity { try replace(snapshot) }
    }
    /// Each attempt reserves a durable generation before creating remote objects.
    /// Retries after an uncertain server result must never reuse a writer revision.
    func reservePublicationRevision() throws { try replace(snapshot) }
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
        try apply(PreparedVaultWrite.prepare(next, key: key, revision: revision, writerId: writerId, restoreEpoch: restoreEpoch, restoring: restoring))
    }
    func prepareWrite(_ next: VaultSnapshot, restoring: Bool = false, expectedRevision: Int? = nil) async throws -> PreparedVaultWrite {
        guard expectedRevision == nil || expectedRevision == revision else { throw CloudFailure.staleRestore }
        guard restoring || isReady else { throw ExpenseError.lockedVault }
        let deviceKey = try restoring ? (suppliedKey ?? DeviceKey.load(create: true)) : key
        guard let deviceKey else { throw ExpenseError.lockedVault }
        return try await ArchiveWorker.shared.prepareVault(next, key: deviceKey, revision: revision, writerId: writerId, restoreEpoch: restoreEpoch, restoring: restoring)
    }
    func replaceAsync(_ next: VaultSnapshot) async throws { try apply(await prepareWrite(next)) }
    func restoreAsync(_ next: VaultSnapshot, expectedRevision: Int? = nil) async throws {
        try apply(await prepareWrite(next, restoring: true, expectedRevision: expectedRevision))
    }
    /// Only the non-suspending disk replacement runs on MainActor. The expensive
    /// image validation, encoding and encryption were completed on the worker.
    /// Reject any proposal whose base generation changed while it was prepared.
    func apply(_ prepared: PreparedVaultWrite) throws {
        try Task.checkCancellation()
        guard revision == prepared.sourceRevision, writerId == prepared.metadata.writerId,
              restoreEpoch == prepared.sourceRestoreEpoch else { throw CloudFailure.staleRestore }
        let next = prepared.snapshot, key = prepared.key, framed = prepared.framed, sealed = prepared.sealed, metadata = prepared.metadata
        var directory = file.deletingLastPathComponent()
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true,
                                               attributes: [.protectionKey: FileProtectionType.complete])
        var resources = URLResourceValues()
        resources.isExcludedFromBackup = true
        try directory.setResourceValues(resources)
        let staging = directory.appendingPathComponent("vault-staging.pennyvault")
        let rollback = directory.appendingPathComponent("vault-rollback.pennyvault")
        defer { try? FileManager.default.removeItem(at: staging) }
        try sealed.write(to: staging, options: [.atomic, .completeFileProtection])
        let handle = try FileHandle(forWritingTo: staging)
        try handle.synchronize()
        try handle.close()
        let verified = try VaultCipher.open(StrictJSON.boundedRead(staging, maximum: 16 * 1_024 * 1_024), key: key)
        guard verified == framed else { throw ExpenseError.invalidSnapshot }
        // The source model was fully validated before encoding; authenticated
        // byte equality proves staging contains that same validated generation.
        // Untrusted loads/restores still pass the complete strict decoder.
        try commitCheckpoint?(.staged)
        let previous = FileManager.default.fileExists(atPath: file.path)
            ? try StrictJSON.boundedRead(file, maximum: 16 * 1_024 * 1_024) : nil
        if let previous {
            try previous.write(to: rollback, options: [.atomic, .completeFileProtection])
            try synchronize(rollback)
        }
        try commitCheckpoint?(.rollbackSaved)
        do {
            // Foundation's atomic replacement leaves the old live file intact if
            // the replacement write fails. The separate rollback survives a crash.
            try sealed.write(to: file, options: [.atomic, .completeFileProtection])
            try synchronize(file)
            try commitCheckpoint?(.committed)
            let reopened = try VaultCipher.open(StrictJSON.boundedRead(file, maximum: 16 * 1_024 * 1_024), key: key)
            guard reopened == framed else { throw ExpenseError.invalidSnapshot }
        } catch {
            do {
                if let previous {
                    try previous.write(to: file, options: [.atomic, .completeFileProtection])
                    try synchronize(file)
                } else { try FileManager.default.removeItem(at: file) }
            } catch {
                isReady = false
                errorMessage = ExpenseError.lockedVault.localizedDescription
                throw error
            }
            throw error
        }
        snapshot = next; snapshotBytes = prepared.byteCount
        self.key = key; isReady = true; errorMessage = nil
        revision = metadata.revision; restoreEpoch = metadata.restoreEpoch; hasDurableIdentity = true
    }
    private func synchronize(_ url: URL) throws {
        let handle = try FileHandle(forWritingTo: url)
        defer { try? handle.close() }
        try handle.synchronize()
    }
}
