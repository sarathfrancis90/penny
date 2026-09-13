import CryptoKit
import Foundation
import Security

struct RecoveryKeyMismatch: LocalizedError { var errorDescription: String? { "The full recovery keys do not match. Re-enter every character before enabling backups." } }

enum RecoveryKeyStore {
    static let service = "ca.penny.offline.dev.recovery"
    static func confirm(_ candidate: String, reentry: String, service: String = service, verify: (() throws -> String?)? = nil) throws {
        _ = try BackupArchive.key(candidate)
        guard candidate == reentry, candidate == candidate.trimmingCharacters(in: FinanceValidation.wireWhitespace) else { throw RecoveryKeyMismatch() }
        let previous = try load(service: service)
        try write(candidate, service: service)
        do {
            let stored: String?
            if let verify { stored = try verify() } else { stored = try load(service: service) }
            guard stored == candidate else { throw RecoveryKeyMismatch() }
        } catch {
            if let previous { try write(previous, service: service) }
            else {
                let status = SecItemDelete(query(service: service) as CFDictionary)
                guard status == errSecSuccess || status == errSecItemNotFound else { throw ExpenseError.keychain(status) }
            }
            throw error
        }
    }
    private static func query(service: String) -> [String: Any] {
        [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecAttrAccount as String: "portable-v1"]
    }
    private static func write(_ key: String, service: String) throws {
        let query = query(service: service)
        let attributes: [String: Any] = [kSecValueData as String: Data(key.utf8), kSecAttrAccessible as String: kSecAttrAccessibleWhenUnlockedThisDeviceOnly, kSecAttrSynchronizable as String: false]
        var status = SecItemUpdate(query as CFDictionary, attributes as CFDictionary)
        if status == errSecItemNotFound { status = SecItemAdd(query.merging(attributes) { _, new in new } as CFDictionary, nil) }
        guard status == errSecSuccess else { throw ExpenseError.keychain(status) }
    }
    static func load(service: String = service) throws -> String? {
        let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecAttrAccount as String: "portable-v1", kSecReturnData as String: true]
        var result: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        if status == errSecItemNotFound { return nil }
        guard status == errSecSuccess, let data = result as? Data, let key = String(data: data, encoding: .utf8) else { throw ExpenseError.keychain(status) }
        _ = try BackupArchive.key(key)
        return key
    }
}

final class VerifiedBackupExport {
    enum Stage { case staged, beforeDestinationVerification }
    enum Failure: LocalizedError {
        case verification
        var errorDescription: String? { "The encrypted file could not be reopened and verified at its destination. Export is not confirmed. Your local vault is unchanged." }
    }
    let url: URL
    private(set) var verifiedSnapshot = VaultSnapshot()
    var bytes: Data { expected }
    private let recoveryKey: String
    private let expected: Data
    private let checkpoint: ((Stage) throws -> Void)?
    private var cancelled = false
    init(snapshot: VaultSnapshot, recoveryKey: String, directory: URL? = nil, checkpoint: ((Stage) throws -> Void)? = nil) throws {
        self.recoveryKey = recoveryKey; self.checkpoint = checkpoint
        var directory = directory ?? FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("PennyOffline/Exports", isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true, attributes: [.protectionKey: FileProtectionType.complete])
        var values = URLResourceValues(); values.isExcludedFromBackup = true; try directory.setResourceValues(values)
        url = directory.appendingPathComponent("Penny-\(CivilDate.string(Date()))-\(UUID().uuidString).pennybackup")
        expected = try BackupArchive.export(snapshot, recoveryKey: recoveryKey)
        do {
            try expected.write(to: url, options: [.atomic, .completeFileProtection])
            let handle = try FileHandle(forWritingTo: url); try handle.synchronize(); try handle.close()
            try checkpoint?(.staged)
            verifiedSnapshot = try verify(url)
        } catch { try? FileManager.default.removeItem(at: url); throw error }
    }
    func writeNewFile(in folder: URL) throws -> URL {
        try writeNewFile(to: folder.appendingPathComponent(url.lastPathComponent))
    }
    func writeNewFile(to destination: URL) throws -> URL {
        guard !cancelled else { throw CancellationError() }
        _ = try verify(url)
        guard destination.lastPathComponent == url.lastPathComponent, destination.standardizedFileURL != url.standardizedFileURL else { throw Failure.verification }
        // The selected folder grants access; the app owns the immutable UUID name.
        // O_EXCL through withoutOverwriting protects any pre-existing last-good file.
        try expected.write(to: destination, options: [.withoutOverwriting])
        let handle = try FileHandle(forWritingTo: destination); try handle.synchronize(); try handle.close()
        return destination
    }
    func verifyDestination(_ destination: URL) throws {
        guard !cancelled, destination.standardizedFileURL != url.standardizedFileURL else { throw Failure.verification }
        try checkpoint?(.beforeDestinationVerification)
        _ = try verify(destination)
    }
    private func verify(_ destination: URL) throws -> VaultSnapshot {
        guard !cancelled else { throw CancellationError() }
        let data = try StrictJSON.boundedRead(destination, maximum: BackupArchive.maximumEnvelopeBytes)
        guard data == expected else { throw Failure.verification }
        return try BackupArchive.restore(data, recoveryKey: recoveryKey)
    }
    func cancel() { cancelled = true; try? FileManager.default.removeItem(at: url) }
    deinit { try? FileManager.default.removeItem(at: url) }
}
