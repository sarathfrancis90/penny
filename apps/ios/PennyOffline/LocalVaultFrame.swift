import Foundation

struct LocalVaultMetadata: Codable, Sendable {
    var writerId: String
    var revision: Int
    var restoreEpoch: String
    func validate() throws {
        try FinanceValidation.uuid(writerId); try FinanceValidation.uuid(restoreEpoch)
        guard (0...CloudWire.maximumRevision).contains(revision) else { throw ExpenseError.invalidSnapshot }
    }
}
/// Local-only framing keeps portable JSON bytes intact. The frame and metadata
/// commit in the same authenticated encrypted generation as the financial data.
enum LocalVaultFrame {
    private static let marker = Data("PENNY-LOCAL:2\n".utf8)
    static func encode(snapshot: Data, metadata: LocalVaultMetadata) throws -> Data {
        try metadata.validate()
        let header = try JSONEncoder().encode(metadata)
        guard header.count <= 1_024 else { throw ExpenseError.invalidSnapshot }
        var size = UInt32(header.count).bigEndian
        return marker + withUnsafeBytes(of: &size) { Data($0) } + header + snapshot
    }
    static func decode(_ data: Data) throws -> (snapshot: VaultSnapshot, metadata: LocalVaultMetadata?, snapshotBytes: Int) {
        guard data.starts(with: marker) else { return (try StrictJSON.snapshot(data), nil, data.count) }
        let offset = marker.count
        guard data.count > offset + 4 else { throw ExpenseError.invalidSnapshot }
        let length = data[offset..<offset + 4].reduce(0) { ($0 << 8) | Int($1) }
        guard (1...1_024).contains(length), data.count > offset + 4 + length else { throw ExpenseError.invalidSnapshot }
        let header = data.subdata(in: offset + 4..<offset + 4 + length)
        _ = try StrictJSON.object(header, keys: ["writerId", "revision", "restoreEpoch"])
        let metadata = try JSONDecoder().decode(LocalVaultMetadata.self, from: header); try metadata.validate()
        return (try StrictJSON.snapshot(data.subdata(in: offset + 4 + length..<data.count)), metadata, data.count - offset - 4 - length)
    }
}
