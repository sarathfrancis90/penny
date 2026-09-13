import CryptoKit
import Foundation

struct CloudSnapshotDescriptor: Codable, Equatable, Sendable {
    var objectId: String
    var snapshotId: String
    var envelopeVersion = 1
    var snapshotSchemaVersion: Int
    var sha256: String
    var byteCount: Int
    var createdAt: String
    static let keys: Set<String> = ["objectId", "snapshotId", "envelopeVersion", "snapshotSchemaVersion", "sha256", "byteCount", "createdAt"]
}
struct CloudManifest: Codable, Identifiable, Equatable, Sendable {
    var schemaVersion = 1
    var manifestId: String
    var provider: String
    var accountTag: String
    var vaultTag: String
    var writerId: String
    var localRevision: Int
    var createdAt: String
    var verifiedAt: String
    var previousManifestId: String?
    var snapshot: CloudSnapshotDescriptor
    var id: String { manifestId }
    var manifestName: String { "manifest-\(manifestId).pennymanifest" }
    var snapshotName: String { "snapshot-\(snapshot.objectId).pennybackup" }
    static let keys: Set<String> = ["schemaVersion", "manifestId", "provider", "accountTag", "vaultTag", "writerId", "localRevision", "createdAt", "verifiedAt", "previousManifestId", "snapshot"]
    enum CodingKeys: String, CodingKey { case schemaVersion, manifestId, provider, accountTag, vaultTag, writerId, localRevision, createdAt, verifiedAt, previousManifestId, snapshot }
    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(schemaVersion, forKey: .schemaVersion); try c.encode(manifestId, forKey: .manifestId); try c.encode(provider, forKey: .provider)
        try c.encode(accountTag, forKey: .accountTag); try c.encode(vaultTag, forKey: .vaultTag); try c.encode(writerId, forKey: .writerId)
        try c.encode(localRevision, forKey: .localRevision); try c.encode(createdAt, forKey: .createdAt); try c.encode(verifiedAt, forKey: .verifiedAt)
        try c.encode(previousManifestId, forKey: .previousManifestId); try c.encode(snapshot, forKey: .snapshot)
    }
    func validate() throws {
        guard schemaVersion == 1, ["icloud", "drive"].contains(provider), (0...CloudWire.maximumRevision).contains(localRevision),
              CloudWire.isDigest(accountTag), CloudWire.isDigest(vaultTag), CivilDate.validTimestamp(createdAt), CivilDate.validTimestamp(verifiedAt),
              previousManifestId != manifestId, snapshot.envelopeVersion == 1, (1...3).contains(snapshot.snapshotSchemaVersion),
              CloudWire.isDigest(snapshot.sha256), (1...BackupArchive.maximumEnvelopeBytes).contains(snapshot.byteCount),
              CivilDate.validTimestamp(snapshot.createdAt) else { throw CloudFailure.invalidManifest }
        for id in [manifestId, writerId, snapshot.objectId, snapshot.snapshotId] { try FinanceValidation.uuid(id) }
        if let previousManifestId { try FinanceValidation.uuid(previousManifestId) }
    }
}

enum CloudFailure: LocalizedError, Equatable {
    case unavailable, disabled, accountChanged, cancelled, invalidManifest, verification, incompleteListing, conflict, quota, permission, transient, staleRestore, historyCapacity
    var errorDescription: String? {
        switch self {
        case .unavailable: "iCloud backup is unavailable in this build. You can still save an encrypted backup using Files."
        case .disabled: "Enable iCloud backup explicitly with a confirmed recovery key first."
        case .accountChanged: "The iCloud account, recovery key or restored vault changed. Re-enable backup for the current account. Earlier backups are unchanged."
        case .cancelled: "Backup was cancelled. The previous verified backup remains available."
        case .invalidManifest, .verification: "The downloaded backup did not pass authentication and validation. Your local vault and previous verified backup are unchanged."
        case .historyCapacity: "Your iCloud backup history has reached its safe discovery capacity. Existing backups are preserved. Save an encrypted Files backup instead."
        case .incompleteListing: "Backup history could not be listed completely within its safe limits. Nothing was selected or deleted."
        case .conflict: "A remote object already exists or multiple backups conflict. Existing backups were preserved."
        case .quota: "iCloud storage is full. Free space or use encrypted Files export, then retry."
        case .permission: "iCloud access is unavailable or was revoked. Check your account in Settings and explicitly re-enable backup."
        case .transient: "iCloud could not finish this operation. Your previous verified backup is unchanged. Retry when available."
        case .staleRestore: "Your local vault changed after this restore preview. Review the backup again before replacing it."
        }
    }
}

enum CloudWire {
    static let maximumRevision = 9_007_199_254_740_991
    static let maximumPlaintext = 8_192
    static let maximumEnvelope = 12_288
    static let aad = Data("PENNY-OFFLINE-CLOUD-MANIFEST:1".utf8)
    static func digest(_ data: Data) -> String { SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined() }
    static func isDigest(_ value: String) -> Bool { value.range(of: #"^[0-9a-f]{64}$"#, options: .regularExpression) != nil }
    static func accountTag(provider: String, identity: String) throws -> String {
        guard ["icloud", "drive"].contains(provider), (1...1024).contains(identity.unicodeScalars.count),
              !identity.unicodeScalars.contains(where: { $0.value < 32 || $0.value == 127 }) else { throw CloudFailure.accountChanged }
        return digest(Data("PENNY-OFFLINE-CLOUD-ACCOUNT:1\0\(provider)\0\(identity)".utf8))
    }
    static func vaultTag(_ id: String) throws -> String { try FinanceValidation.uuid(id); return digest(Data("PENNY-OFFLINE-CLOUD-VAULT:1\0\(id)".utf8)) }
    static func decode(_ data: Data) throws -> CloudManifest {
        guard data.count <= maximumPlaintext else { throw CloudFailure.invalidManifest }
        let object = try StrictJSON.object(data, keys: CloudManifest.keys)
        guard let descriptor = object["snapshot"] as? [String: Any], Set(descriptor.keys) == CloudSnapshotDescriptor.keys else { throw CloudFailure.invalidManifest }
        let value = try JSONDecoder().decode(CloudManifest.self, from: data); try value.validate(); return value
    }
    static func seal(_ manifest: CloudManifest, key: String) throws -> Data {
        try manifest.validate()
        let encoder = JSONEncoder(); encoder.outputFormatting = [.withoutEscapingSlashes]
        let clear = try encoder.encode(manifest); guard clear.count <= maximumPlaintext else { throw CloudFailure.invalidManifest }
        let box = try AES.GCM.seal(clear, using: BackupArchive.key(key), authenticating: aad)
        let bytes = try encoder.encode(BackupEnvelope(formatVersion: 1, algorithm: "AES-256-GCM", nonce: box.nonce.withUnsafeBytes { Data($0).base64EncodedString() }, ciphertext: box.ciphertext.base64EncodedString(), tag: box.tag.base64EncodedString()))
        guard bytes.count <= maximumEnvelope else { throw CloudFailure.invalidManifest }; return bytes
    }
    static func open(_ data: Data, key: String, provider: String, accountTag: String, vaultTag: String? = nil) throws -> CloudManifest {
        guard data.count <= maximumEnvelope else { throw CloudFailure.invalidManifest }
        _ = try StrictJSON.object(data, keys: ["formatVersion", "algorithm", "nonce", "ciphertext", "tag"])
        let envelope = try JSONDecoder().decode(BackupEnvelope.self, from: data)
        guard envelope.formatVersion == 1, envelope.algorithm == "AES-256-GCM", envelope.ciphertext.utf8.count <= 4 * ((maximumPlaintext + 2) / 3),
              let nonce = Data(base64Encoded: envelope.nonce), nonce.count == 12, nonce.base64EncodedString() == envelope.nonce,
              let tag = Data(base64Encoded: envelope.tag), tag.count == 16, tag.base64EncodedString() == envelope.tag,
              let cipher = Data(base64Encoded: envelope.ciphertext), (1...maximumPlaintext).contains(cipher.count), cipher.base64EncodedString() == envelope.ciphertext else { throw CloudFailure.invalidManifest }
        let clear = try AES.GCM.open(AES.GCM.SealedBox(nonce: AES.GCM.Nonce(data: nonce), ciphertext: cipher, tag: tag), using: BackupArchive.key(key), authenticating: aad)
        let manifest = try decode(clear)
        guard manifest.provider == provider, manifest.accountTag == accountTag, vaultTag == nil || manifest.vaultTag == vaultTag else { throw CloudFailure.accountChanged }
        return manifest
    }
    static func verifySnapshot(_ data: Data, key: String, manifest: CloudManifest) throws -> VaultSnapshot {
        try manifest.validate()
        guard data.count == manifest.snapshot.byteCount, digest(data) == manifest.snapshot.sha256 else { throw CloudFailure.verification }
        let restored = try BackupArchive.decode(data, recoveryKey: key)
        let snapshot = restored.snapshot
        guard restored.originalSchemaVersion == manifest.snapshot.snapshotSchemaVersion, snapshot.snapshotId == manifest.snapshot.snapshotId,
              snapshot.createdAt == manifest.snapshot.createdAt, try vaultTag(snapshot.vaultId) == manifest.vaultTag else { throw CloudFailure.verification }
        return snapshot
    }
}
