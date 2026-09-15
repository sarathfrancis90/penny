import Foundation
import CryptoKit
import XCTest

final class V4LogicalTests: XCTestCase {
    let key = "pny1-" + String(repeating: "07", count: 32)
    private var directory: URL!
    private final class TailInput: V4FrameInput {
        let source: any V4FrameInput; var tail: Bool
        init(_ source: any V4FrameInput, extra: Bool = false) { self.source = source; tail = extra }
        func read(upToCount count: Int) throws -> Data {
            let result = try source.read(upToCount: count)
            if result.isEmpty && tail { tail = false; return Data([0]) }; return result
        }
    }
    private final class MemoryInput: V4FrameInput {
        let bytes: Data; var offset = 0
        init(_ bytes: Data) { self.bytes = bytes }
        func read(upToCount count: Int) throws -> Data {
            let n = min(count, 7, bytes.count - offset); defer { offset += n }
            return bytes.subdata(in: offset..<offset + n)
        }
    }
    override func setUpWithError() throws {
        directory = FileManager.default.temporaryDirectory.appendingPathComponent("logical-\(UUID())")
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true, attributes: [.protectionKey: FileProtectionType.complete])
        var flags = URLResourceValues(); flags.isExcludedFromBackup = true; try directory.setResourceValues(flags)
    }
    override func tearDownWithError() throws { try FileManager.default.removeItem(at: directory) }
    private func resources() throws -> URL { try XCTUnwrap(Bundle(for: Self.self).resourceURL?.appendingPathComponent("Fixtures/Logical")) }
    private func encode(_ source: any V4FrameInput) throws -> URL {
        let file = directory.appendingPathComponent("\(UUID()).pennyframe")
        _ = try V4FrameCodec.seal(input: source, output: V4NewCiphertextFile(url: file), recoveryKey: key); return file
    }
    private func open(_ file: URL, sink: V4NativeValidationSink, cancel: @escaping () throws -> Void = {}) throws -> V4LogicalSummary {
        let input = try V4FileInput(url: file, maximumBytes: V4FrameCodec.maximumFile); defer { try? input.close() }
        return try V4LogicalGate.read(input: input, sink: sink, recoveryKey: key, cancellation: cancel)
    }
    private func entries(_ name: String) throws -> [[String: Any]] {
        let data = try Data(contentsOf: resources().appendingPathComponent("fixture-manifest.json"))
        let manifest = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
        return try XCTUnwrap(manifest[name] as? [[String: Any]])
    }
    func testSharedPositiveCorpusThroughAuthenticatedFramesAndNativeSemantics() throws {
        let corpus = try entries("positives"); XCTAssertEqual(corpus.count, 10)
        for entry in corpus {
            let name = try XCTUnwrap(entry["file"] as? String)
            let input = try V4FileInput(url: resources().appendingPathComponent(name), maximumBytes: V4FrameCodec.maximumPlaintext)
            defer { try? input.close() }
            let file = try encode(input), sink = V4NativeValidationSink()
            do {
                let summary = try open(file, sink: sink)
                XCTAssertTrue(sink.completed, name); XCTAssertFalse(sink.discarded, name)
                XCTAssertEqual(summary.snapshotId, sink.metadata?.snapshotId, name)
                XCTAssertEqual(summary.vaultId, sink.metadata?.vaultId, name)
                XCTAssertEqual(summary.createdAt, sink.metadata?.createdAt, name)
                XCTAssertEqual(Int64(sink.receiptCount), summary.counts["attachments"], name)
            } catch { XCTFail("\(name): \(error)") }
        }
    }
    func testSharedNegativeCorpusDiscardsCandidate() throws {
        let corpus = try entries("negatives"); XCTAssertEqual(corpus.count, 60)
        for entry in corpus {
            let name = try XCTUnwrap(entry["file"] as? String)
            let input = try V4FileInput(url: resources().appendingPathComponent(name), maximumBytes: V4FrameCodec.maximumPlaintext)
            defer { try? input.close() }
            let file = try encode(TailInput(input, extra: entry["finalFrame"] as? Bool == false))
            let sink = V4NativeValidationSink()
            XCTAssertThrowsError(try open(file, sink: sink), name)
            XCTAssertTrue(sink.discarded, name); XCTAssertFalse(sink.completed, name); XCTAssertNil(sink.metadata, name)
        }
    }
    func testExactNumericSpellingsWithoutFloatingPointRounding() throws {
        for text in ["0", "-0", "-0.00e1000000", "1.0", "1e0", "10e-1", "100.00e-2", "999999999999999"] { XCTAssertNoThrow(try V4ExactNumbers.integer(text), text) }
        for text in ["1.0000000000000001", "-1", "1e999999", "1e-999999", "1000000000000000", "01", "+1", "1.", ".1", "1e"] { XCTAssertThrowsError(try V4ExactNumbers.integer(text), text) }
    }
    func testBothBooleanCountsRejectedBeforeBeginCallback() throws {
        let entry = try XCTUnwrap(try entries("positives").first)
        let original = try Data(contentsOf: resources().appendingPathComponent(try XCTUnwrap(entry["file"] as? String)))
        XCTAssertEqual(original[0], 1)
        let length = original[1..<9].reduce(0) { ($0 << 8) | Int($1) }
        for flag in [false, true] {
            var begin = try XCTUnwrap(JSONSerialization.jsonObject(with: original.subdata(in: 9..<9 + length)) as? [String: Any])
            var counts = try XCTUnwrap(begin["counts"] as? [String: Any]); counts["expenses"] = flag; begin["counts"] = counts
            let payload = try JSONSerialization.data(withJSONObject: begin, options: [.sortedKeys])
            let bytes = Data([1]) + V4FrameCodec.encoded(UInt64(payload.count)) + payload + original.suffix(from: 9 + length)
            let file = try encode(MemoryInput(bytes)), candidate = V4NativeValidationSink()
            var began = false; candidate.onBegin = { began = true }
            XCTAssertThrowsError(try open(file, sink: candidate))
            XCTAssertFalse(began); XCTAssertTrue(candidate.discarded); XCTAssertFalse(candidate.completed)
        }
    }
    private func removingDomain(_ kind: UInt8, named name: String, from data: Data) throws -> Data {
        var records: [(UInt8, Data)] = [], offset = 0
        while offset < data.count {
            let tag = data[offset], size = data[offset + 1..<offset + 9].reduce(0) { ($0 << 8) | Int($1) }
            records.append((tag, data.subdata(in: offset + 9..<offset + 9 + size))); offset += 9 + size
        }
        let body = records.dropFirst().dropLast().filter { $0.0 != kind }
        var begin = try XCTUnwrap(JSONSerialization.jsonObject(with: records[0].1) as? [String: Any])
        var counts = try XCTUnwrap(begin["counts"] as? [String: Any]); counts[name] = 0; begin["counts"] = counts
        let nonReceipt = body.reduce(0) { $0 + 9 + ($1.0 == 10 ? 0 : $1.1.count) }; begin["nonReceiptBytes"] = nonReceipt
        func framed(_ kind: UInt8, _ payload: Data) -> Data { Data([kind]) + V4FrameCodec.encoded(UInt64(payload.count)) + payload }
        var result = framed(1, try JSONSerialization.data(withJSONObject: begin, options: [.sortedKeys]))
        for record in body { result += framed(record.0, record.1) }
        var end = try XCTUnwrap(JSONSerialization.jsonObject(with: records.last!.1) as? [String: Any])
        end["counts"] = counts; end["nonReceiptBytes"] = nonReceipt; end["recordCount"] = body.count + 1
        end["streamSha256"] = SHA256.hash(data: result).map { String(format: "%02x", $0) }.joined()
        return result + framed(11, try JSONSerialization.data(withJSONObject: end, options: [.sortedKeys]))
    }
    func testSinkCannotReuseSuccessfulOrDiscardedIndexes() throws {
        for (fixture, kind, domain): (String, UInt8, String) in [("one-receipt.pennylogical", 8, "expenses"), ("finance.pennylogical", 3, "incomeSources")] {
            let valid = try Data(contentsOf: resources().appendingPathComponent(fixture))
            let first = try encode(MemoryInput(valid))
            let orphan = try encode(MemoryInput(removingDomain(kind, named: domain, from: valid)))
            let sink = V4NativeValidationSink(); _ = try open(first, sink: sink); XCTAssertTrue(sink.completed)
            var beganAgain = false; sink.onBegin = { beganAgain = true }
            XCTAssertThrowsError(try open(orphan, sink: sink))
            XCTAssertFalse(beganAgain); XCTAssertFalse(sink.completed); XCTAssertTrue(sink.discarded)
            XCTAssertThrowsError(try open(first, sink: sink)); XCTAssertFalse(beganAgain)
            let fresh = V4NativeValidationSink(); XCTAssertThrowsError(try open(orphan, sink: fresh)); XCTAssertTrue(fresh.discarded)
            let failed = V4NativeValidationSink(); failed.onBegin = { throw V4LogicalError.identity }
            XCTAssertThrowsError(try open(first, sink: failed)); failed.onBegin = nil
            XCTAssertThrowsError(try open(first, sink: failed)); XCTAssertFalse(failed.completed)
        }
    }
    func testFinalAuthenticationFailureAndFinishCancellationDiscardValidatedBegin() throws {
        let entry = try XCTUnwrap(try entries("positives").first)
        let bytes = try Data(contentsOf: resources().appendingPathComponent(try XCTUnwrap(entry["file"] as? String)))
        let file = try encode(MemoryInput(bytes)), sink = V4NativeValidationSink()
        var cancel = false; sink.onFinish = { cancel = true }
        XCTAssertThrowsError(try open(file, sink: sink, cancel: { if cancel { throw CancellationError() } })) { XCTAssertTrue($0 is CancellationError) }
        XCTAssertTrue(sink.discarded); XCTAssertNil(sink.metadata); XCTAssertFalse(sink.completed)
        let rejected = V4NativeValidationSink(); rejected.onBegin = { throw V4LogicalError.identity }
        XCTAssertThrowsError(try open(file, sink: rejected)); XCTAssertTrue(rejected.discarded); XCTAssertNil(rejected.metadata)
        // Find a positive split-header stream so a validated BEGIN exists before
        // the last frame's authentication is rejected.
        let large = try XCTUnwrap(try entries("positives").first { ($0["plaintextBytes"] as? Int ?? 0) > 1_048_576 })
        let source = try V4FileInput(url: resources().appendingPathComponent(try XCTUnwrap(large["file"] as? String)), maximumBytes: V4FrameCodec.maximumPlaintext)
        defer { try? source.close() }
        let corrupted = try encode(source)
        let handle = try FileHandle(forUpdating: corrupted); let end = try handle.seekToEnd(); try handle.seek(toOffset: end - 1)
        let original = try XCTUnwrap(try handle.read(upToCount: 1)); try handle.seek(toOffset: end - 1); try handle.write(contentsOf: Data([original[0] ^ 1])); try handle.close()
        let candidate = V4NativeValidationSink(); var began = false; candidate.onBegin = { began = true }
        XCTAssertThrowsError(try open(corrupted, sink: candidate))
        XCTAssertTrue(began); XCTAssertTrue(candidate.discarded); XCTAssertFalse(candidate.completed); XCTAssertNil(candidate.metadata)
    }
}
