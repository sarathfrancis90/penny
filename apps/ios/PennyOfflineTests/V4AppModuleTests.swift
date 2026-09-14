import CryptoKit
import Foundation
import XCTest
@testable import PennyOffline
@testable import PennyV4

final class V4AppModuleTests: XCTestCase {
    private let recovery = "pny1-" + String(repeating: "07", count: 32)
    private func file(_ name: String) throws -> Data {
        try Data(contentsOf: XCTUnwrap(Bundle(for: Self.self).resourceURL).appendingPathComponent(name))
    }
    private func sha(_ data: Data) -> String { SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined() }
    private func object(_ name: String) throws -> [String: Any] {
        try XCTUnwrap(JSONSerialization.jsonObject(with: file(name)) as? [String: Any])
    }
    private func read(_ data: Data, key: String? = nil) throws -> PennyV4Summary {
        let source = Input(data)
        defer { XCTAssertEqual(source.closes, 1); XCTAssertLessThanOrEqual(source.maximumRequested, 65_536) }
        return try V4ReadOnlyAdapter.validate(source: source, recoveryKey: key ?? recovery)
    }
    private func seal(_ data: Data) throws -> Data {
        let output = Output()
        _ = try V4FrameCodec.seal(input: Input(data), output: output, recoveryKey: recovery)
        return output.data
    }
    func testActualEncryptedGoldensAndBundledLicense() throws {
        let manifest = try object("fixtures/v4-frames/fixture-manifest.json")
        for row in try XCTUnwrap(manifest["positives"] as? [[String: Any]]) {
            let name = try XCTUnwrap(row["name"] as? String)
            let data = try file("fixtures/v4-frames/" + XCTUnwrap(row["file"] as? String))
            XCTAssertEqual(sha(data), row["ciphertextSha256"] as? String)
            if name == "empty-ledger" || name == "one-receipt" {
                let summary = try read(data)
                XCTAssertEqual(summary.snapshotId, "22222222-2222-4222-8222-222222222222")
                XCTAssertEqual(summary.vaultId, "33333333-3333-4333-8333-333333333333")
                XCTAssertEqual(summary.counts["attachments"], name == "empty-ledger" ? 0 : 1)
                XCTAssertEqual(summary.receiptBytes, name == "empty-ledger" ? 0 : 70)
            } else { XCTAssertThrowsError(try read(data), "pattern is not a ledger: " + name) }
        }
        let license = try Data(contentsOf: XCTUnwrap(Bundle.main.url(forResource: "LICENSE", withExtension: "libsodium")))
        XCTAssertEqual(sha(license), "508a76d186356c0dd807a670ef510964f8724557024796a2c426c6c0e19ab683")
    }
    func testSharedEncryptedRejections() throws {
        let directory = "V4TestAssets/v4-frame-negatives/"
        let manifest = try object(directory + "negative-manifest.json")
        let cases = try XCTUnwrap(manifest["cases"] as? [[String: Any]])
        XCTAssertEqual(cases.count, 28)
        for row in cases {
            let data = try file(directory + XCTUnwrap(row["file"] as? String))
            XCTAssertEqual(sha(data), row["ciphertextSha256"] as? String)
            XCTAssertThrowsError(try read(data, key: XCTUnwrap(row["recoveryKey"] as? String)), row["name"] as? String ?? "")
        }
    }
    func testSharedLogicalCorpusThroughRealFramesAndCurrentCaps() throws {
        let directory = "V4TestAssets/v4-logical-materialized/"
        let manifest = try object(directory + "fixture-manifest.json")
        let positives = try XCTUnwrap(manifest["positives"] as? [[String: Any]])
        let negatives = try XCTUnwrap(manifest["negatives"] as? [[String: Any]])
        XCTAssertEqual(positives.count, 10); XCTAssertEqual(negatives.count, 60)
        for row in positives + negatives {
            var data = try file(directory + XCTUnwrap(row["file"] as? String))
            XCTAssertEqual(sha(data), row["plaintextSha256"] as? String)
            let name = try XCTUnwrap(row["name"] as? String)
            // Force the specified first full frame to be MESSAGE; seal supplies a
            // later FINAL. END in that earlier MESSAGE must still fail closed.
            if row["finalFrame"] as? Bool == false { XCTAssertEqual(data.count, 1_048_576); data.append(0) }
            let encrypted = try seal(data)
            if row["expected"] as? String == "accept" && name != "beyond-legacy-count" {
                let summary = try read(encrypted)
                let expected = try XCTUnwrap(row["summary"] as? [String: Any])
                XCTAssertEqual(summary.receiptBytes, (expected["receiptBytes"] as? NSNumber)?.int64Value, name)
            } else { XCTAssertThrowsError(try read(encrypted), name) }
        }
    }
    func testSourceCloseFailureCancellationAndBoundsReject() throws {
        let data = try file("fixtures/v4-frames/one-receipt.pennyframe")
        for mode in 0..<5 {
            let source = Input(data); var cancelled = false
            if mode == 0 { source.onClose = { throw Failure.injected } }
            if mode == 1 { source.onClose = { cancelled = true } }
            if mode == 2 { source.onRead = { cancelled = true } }
            if mode == 3 { source.overread = true }
            if mode == 4 { source.onRead = { throw Failure.injected } }
            XCTAssertThrowsError(try V4ReadOnlyAdapter.validate(source: source, recoveryKey: recovery, cancellation: {
                if cancelled { throw CancellationError() }
            }))
            XCTAssertEqual(source.closes, 1)
        }
    }
    func testAuthenticatedInvalidNativeImageCannotReturnSummary() throws {
        let corpus = try object("fixtures/png-integrity-corpus.json")
        let row = try XCTUnwrap((corpus["cases"] as? [[String: Any]])?.first { $0["id"] as? String == "rgba9-plain-invalid_filter" })
        let image = try XCTUnwrap(Data(base64Encoded: XCTUnwrap(row["dataBase64"] as? String)))
        XCTAssertEqual(sha(image), row["sha256"] as? String)
        let original = try file("fixtures/v4-logical/one-receipt.pennylogical")
        var records: [(UInt8, Data)] = [], offset = 0
        while offset < original.count {
            let count = original[(offset + 1)..<(offset + 9)].reduce(0) { ($0 << 8) | Int($1) }
            records.append((original[offset], original.subdata(in: (offset + 9)..<(offset + 9 + count))))
            offset += 9 + count
        }
        func json(_ data: Data) throws -> [String: Any] { try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any]) }
        func encode(_ object: [String: Any]) throws -> Data { try JSONSerialization.data(withJSONObject: object, options: [.sortedKeys, .withoutEscapingSlashes]) }
        func record(_ kind: UInt8, _ payload: Data) -> Data {
            var size = UInt64(payload.count).bigEndian
            return Data([kind]) + withUnsafeBytes(of: &size) { Data($0) } + payload
        }
        var descriptor = try json(records[2].1)
        descriptor["sha256"] = sha(image); descriptor["byteCount"] = image.count
        records[2].1 = try encode(descriptor); records[3].1 = image
        let body = records[1...3].reduce(0) { $0 + 9 + ($1.0 == 10 ? 0 : $1.1.count) }
        var begin = try json(records[0].1), end = try json(records[4].1)
        begin["receiptBytes"] = image.count; begin["nonReceiptBytes"] = body
        end["receiptBytes"] = image.count; end["nonReceiptBytes"] = body
        records[0].1 = try encode(begin)
        let prefix = records[0...3].reduce(Data()) { $0 + record($1.0, $1.1) }
        end["streamSha256"] = sha(prefix)
        let encrypted = try seal(prefix + record(11, encode(end)))
        XCTAssertThrowsError(try read(encrypted)) { error in
            XCTAssertTrue(error is PennyV4.ReceiptAttachment.ReceiptError, "must reach native image validation: \(error)")
        }
    }
    @MainActor func testValidationNeverMutatesExistingStoreOrReadsItsKey() throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: directory) }
        let key = SymmetricKey(data: Data(repeating: 0x0b, count: 32))
        let store = VaultStore(directory: directory, key: key)
        try store.replace(StrictJSON.snapshot(file("fixtures/local-generation-v1/previous.json")))
        func contents() throws -> [String: String] {
            let enumerator = try XCTUnwrap(FileManager.default.enumerator(at: directory, includingPropertiesForKeys: [.isRegularFileKey]))
            var result: [String: String] = [:]
            for case let url as URL in enumerator where try url.resourceValues(forKeys: [.isRegularFileKey]).isRegularFile == true {
                result[url.path] = try sha(Data(contentsOf: url))
            }
            return result
        }
        let encoder = JSONEncoder(); encoder.outputFormatting = [.sortedKeys, .withoutEscapingSlashes]
        let before = try contents(), snapshot = try encoder.encode(store.snapshot)
        _ = try read(file("fixtures/v4-frames/one-receipt.pennyframe"))
        XCTAssertThrowsError(try read(file("fixtures/v4-frames/one-receipt.pennyframe"), key: "pny1-" + String(repeating: "08", count: 32)))
        XCTAssertEqual(try contents(), before)
        XCTAssertEqual(try encoder.encode(store.snapshot), snapshot)
        XCTAssertEqual(try encoder.encode(VaultStore(directory: directory, key: key).snapshot), snapshot)
    }
    func testMetadataCapRejectsDeclaredBodyAndFinalOverheadThroughAppDecode() throws {
        let cap = BackupArchive.maximumExportablePlaintextBytes
        for bodyBytes in [cap + 1, cap - 128] {
            let encrypted = try seal(metadataStream(bodyBytes: bodyBytes))
            let core = try PennyV4Reader.validate(source: Input(encrypted), recoveryKey: recovery, admit: { _ in })
            XCTAssertEqual(core.counts["expenses"], 4_000)
            XCTAssertEqual(core.nonReceiptBytes, Int64(bodyBytes))
            XCTAssertGreaterThan(core.policyMetadataBytes, Int64(cap))
            XCTAssertThrowsError(try read(encrypted)) { error in
                guard case PennyOffline.ExpenseError.vaultCapacity = error else {
                    return XCTFail("Expected app metadata cap, got \(error)")
                }
            }
        }
    }
    /// Valid receipt-free corpus with exact requested body size, <=10k expenses
    /// and each note <=4000 scalars. No giant declarations or malformed trailer.
    private func metadataStream(bodyBytes: Int) throws -> Data {
        func encode(_ object: [String: Any]) throws -> Data {
            try JSONSerialization.data(withJSONObject: object, options: [.sortedKeys, .withoutEscapingSlashes])
        }
        func record(_ kind: UInt8, _ payload: Data) -> Data {
            var count = UInt64(payload.count).bigEndian
            return Data([kind]) + withUnsafeBytes(of: &count) { Data($0) } + payload
        }
        let original = try file("fixtures/v4-logical/empty.pennylogical")
        let length = original[1..<9].reduce(0) { ($0 << 8) | Int($1) }
        var begin = try XCTUnwrap(JSONSerialization.jsonObject(with: original.subdata(in: 9..<(9 + length))) as? [String: Any])
        var counts = try XCTUnwrap(begin["counts"] as? [String: Int]); counts["expenses"] = 4_000
        begin["counts"] = counts; begin["nonReceiptBytes"] = bodyBytes
        var expense = try object("fixtures/expense-valid.json")
        expense["description"] = ""; expense["recurringTemplateId"] = NSNull(); expense["recurringOccurrenceDate"] = NSNull()
        var body = Data()
        for i in 0..<4_000 {
            expense["id"] = String(format: "%08x-0000-4000-8000-000000000000", i + 1)
            expense["note"] = ""
            let desired = (bodyBytes - body.count) / (4_000 - i)
            let noteCount = desired - 9 - (try encode(expense)).count
            XCTAssertTrue((0...4_000).contains(noteCount))
            expense["note"] = String(repeating: "a", count: noteCount)
            body.append(record(8, try encode(expense)))
        }
        XCTAssertEqual(body.count, bodyBytes)
        var stream = record(1, try encode(begin)); stream.append(body)
        let end: [String: Any] = ["snapshotId": try XCTUnwrap(begin["snapshotId"]), "counts": counts,
            "receiptBytes": 0, "nonReceiptBytes": bodyBytes, "recordCount": 4_001, "streamSha256": sha(stream)]
        stream.append(record(11, try encode(end)))
        return stream
    }
    private enum Failure: Error { case injected }
    private final class Input: PennyV4Input, V4FrameInput {
        var data: Data, offset = 0, closes = 0, maximumRequested = 0, overread = false
        var onClose: (() throws -> Void)?, onRead: (() throws -> Void)?
        init(_ data: Data) { self.data = data }
        func read(maximum: Int) throws -> Data {
            maximumRequested = max(maximumRequested, maximum); try onRead?()
            if overread { return Data(repeating: 0, count: maximum + 1) }
            let end = min(data.count, offset + min(maximum, 211)); defer { offset = end }
            return data.subdata(in: offset..<end)
        }
        func read(upToCount count: Int) throws -> Data { try read(maximum: count) }
        func close() throws { closes += 1; try onClose?() }
    }
    private final class Output: V4CiphertextSink {
        var data = Data()
        func write(_ bytes: Data) throws { data.append(bytes) }
        func finish() throws {}
        func discard() { data.removeAll() }
    }
}
