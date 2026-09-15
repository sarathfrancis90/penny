import CryptoKit
import Foundation

/// Immutable, validated output from the serial worker; never constructed from
/// external bytes without full model validation. The device key stays in memory.
struct PreparedVaultWrite: Sendable {
    let sourceDigest: String?
    let sourceStoreId: String
    let snapshot: VaultSnapshot
    let byteCount: Int
    let metadata: LocalVaultMetadata
    let sourceRevision: Int
    let sourceRestoreEpoch: String
    let key: SymmetricKey
    let framed: Data
    let sealed: Data
    static func prepare(_ next: VaultSnapshot, key: SymmetricKey, revision: Int, writerId: String, restoreEpoch: String, restoring: Bool, sourceDigest: String? = nil, sourceStoreId: String = UUID().uuidString.lowercased()) throws -> Self {
        try Task.checkCancellation(); try next.validate()
        let encoder = JSONEncoder(); encoder.outputFormatting = [.withoutEscapingSlashes]
        let data = try encoder.encode(next); try BackupArchive.validateExportCapacity(data.count)
        guard revision < CloudWire.maximumRevision else { throw ExpenseError.invalidSnapshot }
        let metadata = LocalVaultMetadata(writerId: writerId, revision: revision + 1, restoreEpoch: restoring ? UUID().uuidString.lowercased() : restoreEpoch)
        let framed = try LocalVaultFrame.encode(snapshot: data, metadata: metadata)
        let sealed = try VaultCipher.seal(framed, key: key)
        try Task.checkCancellation()
        return Self(sourceDigest: sourceDigest, sourceStoreId: sourceStoreId, snapshot: next, byteCount: data.count, metadata: metadata, sourceRevision: revision, sourceRestoreEpoch: restoreEpoch, key: key, framed: framed, sealed: sealed)
    }
}
