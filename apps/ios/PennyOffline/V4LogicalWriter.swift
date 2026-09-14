import CryptoKit
import Foundation
import PennyV4

/// Pull-based encoder: retains typed receipt-free rows, at most one encoded JSON
/// record and one native-validated raw receipt. No complete plaintext archive.
final class V4LogicalWriter: PennyV4Input {
    private struct Receipt: Encodable { let id: String, expenseId: String, mediaType: String; let byteCount: Int; let sha256: String }
    private enum Plan { case json(UInt8, () throws -> Data); case blob(Int) }
    private let source: DurableVaultStorage.ExportSource, plans: [Plan], begin: Data
    private let counts: [String: Int], bodyBytes: Int, receiptBytes: Int, policyBytes: Int, records: Int
    let expectedPlaintextBytes: Int, expectedCiphertextBytes: Int
    private var closed = false, index = -1, pieces: [Data] = [], piece = 0, offset = 0, end = false
    private var transcript = SHA256(), fullHash = SHA256(), plaintextBytes = 0
    private(set) var transcriptDigest: String?, plaintextDigest: String?
    private static func json<T: Encodable>(_ value: T) throws -> Data {
        let encoder = JSONEncoder(); encoder.outputFormatting = [.sortedKeys, .withoutEscapingSlashes]
        let data = try encoder.encode(value)
        guard !data.isEmpty, data.count <= 65_536 else { throw ExpenseError.vaultCapacity }; return data
    }
    private static func object(_ value: [String: Any]) throws -> Data {
        let bytes = try JSONSerialization.data(withJSONObject: value, options: [.sortedKeys, .withoutEscapingSlashes])
        guard !bytes.isEmpty, bytes.count <= 65_536 else { throw ExpenseError.vaultCapacity }; return bytes
    }
    private static func header(_ kind: UInt8, _ size: Int) -> Data {
        var length = UInt64(size).bigEndian; return Data([kind]) + withUnsafeBytes(of: &length) { Data($0) }
    }
    init(source: DurableVaultStorage.ExportSource) throws {
        self.source = source
        let body = source.body
        var plans: [Plan] = [], size = 0, raw = 0
        func add<T: Encodable & Identifiable>(_ rows: [T], kind: UInt8) throws where T.ID == String {
            for row in rows.sorted(by: { $0.id < $1.id }) {
                try Task.checkCancellation()
                let count = try Self.json(row).count
                let (next, overflow) = size.addingReportingOverflow(count + 9)
                guard !overflow else { throw ExpenseError.vaultCapacity }; size = next
                plans.append(.json(kind, { try Self.json(row) }))
            }
        }
        try add(body.budgets, kind: 2); try add(body.incomeSources, kind: 3); try add(body.incomeEntries, kind: 4)
        try add(body.savingsGoals, kind: 5); try add(body.savingsEntries, kind: 6); try add(body.recurringExpenses, kind: 7); try add(body.expenses, kind: 8)
        for (index, descriptor) in source.receipts.enumerated() {
            let receipt = Receipt(id: descriptor.id, expenseId: descriptor.expenseId, mediaType: descriptor.mediaType, byteCount: descriptor.byteCount, sha256: descriptor.sha256)
            let count = try Self.json(receipt).count
            let (next, overflow) = size.addingReportingOverflow(count + 18)
            guard !overflow else { throw ExpenseError.vaultCapacity }; size = next
            raw += receipt.byteCount; plans.append(.json(9, { try Self.json(receipt) })); plans.append(.blob(index))
        }
        counts = ["budgets": body.budgets.count, "incomeSources": body.incomeSources.count, "incomeEntries": body.incomeEntries.count,
            "savingsGoals": body.savingsGoals.count, "savingsEntries": body.savingsEntries.count, "recurringExpenses": body.recurringExpenses.count,
            "expenses": body.expenses.count, "attachments": source.receipts.count]
        begin = try Self.object(["schemaVersion": 4, "capacityProfile": "A", "snapshotId": body.snapshotId, "vaultId": body.vaultId,
            "createdAt": body.createdAt, "counts": counts, "receiptBytes": raw, "nonReceiptBytes": size])
        records = plans.count + 1
        let final = try Self.object(["snapshotId": body.snapshotId, "counts": counts, "receiptBytes": raw, "nonReceiptBytes": size,
            "recordCount": records, "streamSha256": String(repeating: "0", count: 64)])
        policyBytes = 9 + begin.count + size + 9 + final.count
        try BackupArchive.validateExportCapacity(policyBytes)
        expectedPlaintextBytes = policyBytes + raw
        expectedCiphertextBytes = 70 + expectedPlaintextBytes + 33 * ((expectedPlaintextBytes + 1_048_575) / 1_048_576)
        guard expectedCiphertextBytes <= BackupArchive.maximumEnvelopeBytes else { throw ExpenseError.vaultCapacity }
        self.plans = plans; bodyBytes = size; receiptBytes = raw
    }
    private func advance() throws -> Bool {
        pieces.removeAll(); piece = 0; offset = 0
        if index == -1 { pieces = [Self.header(1, begin.count), begin]; index = 0; return true }
        if index < plans.count {
            let plan = plans[index]; index += 1
            switch plan {
            case let .json(kind, encode): let payload = try encode(); pieces = [Self.header(kind, payload.count), payload]
            case let .blob(at): let bytes = try source.receipt(at: at); pieces = [Self.header(10, bytes.count), bytes]
            }
            return true
        }
        if !end {
            let digest = transcript.finalize().map { String(format: "%02x", $0) }.joined(); transcriptDigest = digest; end = true
            let final = try Self.object(["snapshotId": source.body.snapshotId, "counts": counts, "receiptBytes": receiptBytes,
                "nonReceiptBytes": bodyBytes, "recordCount": records, "streamSha256": digest])
            pieces = [Self.header(11, final.count), final]; return true
        }
        guard plaintextBytes == expectedPlaintextBytes else { throw ExpenseError.invalidSnapshot }
        plaintextDigest = fullHash.finalize().map { String(format: "%02x", $0) }.joined(); return false
    }
    func read(maximum: Int) throws -> Data {
        guard !closed, maximum > 0, maximum <= 65_536 else { throw LocalReceiptBlobError.closed }
        try Task.checkCancellation()
        while piece >= pieces.count { if try !advance() { return Data() } }
        let count = min(maximum, pieces[piece].count - offset)
        let result = pieces[piece].subdata(in: offset..<(offset + count)); offset += count
        if offset == pieces[piece].count { piece += 1; offset = 0 }
        if !end { transcript.update(data: result) }; fullHash.update(data: result); plaintextBytes += result.count
        return result
    }
    func matches(_ summary: PennyV4Summary) -> Bool {
        summary.vaultId == source.body.vaultId && summary.snapshotId == source.body.snapshotId && summary.createdAt == source.body.createdAt &&
            summary.counts == counts.mapValues(Int64.init) && summary.receiptBytes == receiptBytes && summary.nonReceiptBytes == bodyBytes &&
            summary.policyMetadataBytes == policyBytes && summary.recordCount == records && summary.streamSha256 == transcriptDigest
    }
    func close() throws { guard !closed else { return }; closed = true; pieces.removeAll(); try source.close() }
    deinit { try? close() }
}
