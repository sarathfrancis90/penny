import CryptoKit
import Foundation
import SwiftUI
import UniformTypeIdentifiers

struct BackupEnvelope: Codable {
    let formatVersion: Int
    let algorithm: String
    let nonce: String
    let ciphertext: String
    let tag: String
}

enum BackupArchive {
    static let aad = Data("PENNY-OFFLINE-BACKUP:1".utf8)
    static let maximumEnvelopeBytes = 20 * 1_024 * 1_024
    // Base64 expands every 3 plaintext bytes to 4 bytes. Reserve 1 KiB for the
    // fixed envelope, nonce and tag so every committed vault remains exportable.
    static let maximumExportablePlaintextBytes = ((maximumEnvelopeBytes - 1_024) / 4) * 3
    static func validateExportCapacity(_ byteCount: Int) throws {
        guard byteCount >= 0, byteCount <= maximumExportablePlaintextBytes else { throw ExpenseError.vaultCapacity }
    }
    static func newRecoveryKey() -> String {
        "pny1-" + SymmetricKey(size: .bits256).withUnsafeBytes { $0.map { String(format: "%02x", $0) }.joined() }
    }
    static func key(_ input: String) throws -> SymmetricKey {
        let text = input.trimmingCharacters(in: .whitespacesAndNewlines)
        guard text.range(of: #"^pny1-[0-9a-f]{64}$"#, options: .regularExpression) != nil else { throw BackupError.invalidKey }
        let hex = Array(text.dropFirst(5))
        return SymmetricKey(data: Data(stride(from: 0, to: hex.count, by: 2).map { UInt8(String(hex[$0...$0 + 1]), radix: 16)! }))
    }
    static func export(_ original: VaultSnapshot, recoveryKey: String) throws -> Data {
        var snapshot = original
        snapshot.snapshotId = UUID().uuidString.lowercased()
        snapshot.createdAt = CivilDate.timestamp()
        try snapshot.validate()
        snapshot.schemaVersion = 3
        let snapshotEncoder = JSONEncoder()
        snapshotEncoder.outputFormatting = [.withoutEscapingSlashes]
        let plaintext = try snapshotEncoder.encode(snapshot)
        try validateExportCapacity(plaintext.count)
        let box = try AES.GCM.seal(plaintext, using: key(recoveryKey), authenticating: aad)
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.withoutEscapingSlashes]
        let data = try encoder.encode(BackupEnvelope(formatVersion: 1, algorithm: "AES-256-GCM",
            nonce: box.nonce.withUnsafeBytes { Data($0).base64EncodedString() },
            ciphertext: box.ciphertext.base64EncodedString(), tag: box.tag.base64EncodedString()))
        guard data.count <= maximumEnvelopeBytes else { throw BackupError.invalidArchive }
        return data
    }
    static func restore(_ data: Data, recoveryKey: String) throws -> VaultSnapshot { try decode(data, recoveryKey: recoveryKey).snapshot }
    static func decode(_ data: Data, recoveryKey: String) throws -> (snapshot: VaultSnapshot, originalSchemaVersion: Int) {
        guard data.count <= 20 * 1_024 * 1_024 else { throw BackupError.invalidArchive }
        _ = try StrictJSON.object(data, keys: ["formatVersion", "algorithm", "nonce", "ciphertext", "tag"])
        let envelope = try JSONDecoder().decode(BackupEnvelope.self, from: data)
        guard envelope.formatVersion == 1, envelope.algorithm == "AES-256-GCM",
              let nonce = Data(base64Encoded: envelope.nonce), nonce.count == 12,
              let ciphertext = Data(base64Encoded: envelope.ciphertext), ciphertext.count <= 15 * 1_024 * 1_024,
              let tag = Data(base64Encoded: envelope.tag), tag.count == 16,
              nonce.base64EncodedString() == envelope.nonce, ciphertext.base64EncodedString() == envelope.ciphertext,
              tag.base64EncodedString() == envelope.tag else { throw BackupError.invalidArchive }
        do {
            let box = try AES.GCM.SealedBox(nonce: AES.GCM.Nonce(data: nonce), ciphertext: ciphertext, tag: tag)
            let clear = try AES.GCM.open(box, using: key(recoveryKey), authenticating: aad)
            let snapshot = try StrictJSON.snapshot(clear)
            struct Header: Decodable { let schemaVersion: Int }
            return (snapshot, try JSONDecoder().decode(Header.self, from: clear).schemaVersion)
        } catch { throw BackupError.cannotRestore }
    }
    enum BackupError: LocalizedError {
        case invalidKey, invalidArchive, cannotRestore
        var errorDescription: String? {
            switch self {
            case .invalidKey: "Enter the recovery key beginning with pny1- followed by 64 lowercase letters and digits."
            case .invalidArchive: "This backup is unsupported, damaged, or too large. Your vault has not changed."
            case .cannotRestore: "The recovery key does not match, or this backup is damaged. Your vault has not changed."
            }
        }
    }
}

struct BackupDocument: FileDocument {
    static var readableContentTypes: [UTType] { [.data] }
    var data: Data
    init(data: Data) { self.data = data }
    init(configuration: ReadConfiguration) throws { data = configuration.file.regularFileContents ?? Data() }
    func fileWrapper(configuration: WriteConfiguration) throws -> FileWrapper { FileWrapper(regularFileWithContents: data) }
}
