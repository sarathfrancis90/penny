import CryptoKit
import Foundation
import XCTest

/// Compiled only when the runner receives independently produced native files.
final class V4NativeInterchangeTests: XCTestCase {
    private final class Candidate: V4IsolatedPlaintextSink {
        var count: Int64 = 0
        var completed: V4FrameSummary?
        var discarded = false
        func appendAuthenticated(_ bytes: Data, sequence: Int64, final: Bool) throws {
            XCTAssertLessThanOrEqual(bytes.count, 1_048_576)
            for (offset, byte) in bytes.enumerated() {
                guard byte == UInt8((count + Int64(offset)) % 251) else {
                    XCTFail("Opposite-platform plaintext pattern differs at offset \(count + Int64(offset))")
                    throw V4FrameError.sourceViolation
                }
            }
            count += Int64(bytes.count)
        }
        func finishFrames(_ summary: V4FrameSummary) throws { completed = summary }
        func discard() { discarded = true; completed = nil; count = 0 }
    }

    func testAndroidProducedFullFinalAndMultiFrameFiles() throws {
        let resources = try XCTUnwrap(Bundle(for: Self.self).resourceURL?.appendingPathComponent("Fixtures/Native"))
        let data = try Data(contentsOf: resources.appendingPathComponent("native-manifest.json"))
        let manifest = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
        let entries = try XCTUnwrap(manifest["positives"] as? [[String: Any]])
        XCTAssertEqual(entries.count, 2)
        var sizes = Set<Int64>()
        for entry in entries {
            let path = resources.appendingPathComponent(try XCTUnwrap(entry["file"] as? String))
            let source = try V4FileInput(url: path, maximumBytes: V4FrameCodec.maximumFile)
            defer { try? source.close() }
            let candidate = Candidate()
            let summary = try V4FrameCodec.open(input: source, candidate: candidate,
                recoveryKey: XCTUnwrap(entry["recoveryKey"] as? String))
            XCTAssertFalse(candidate.discarded); XCTAssertEqual(candidate.completed, summary)
            XCTAssertEqual(summary.plaintextBytes, (entry["plaintextBytes"] as? NSNumber)?.int64Value)
            XCTAssertEqual(summary.ciphertextBytes, (entry["ciphertextBytes"] as? NSNumber)?.int64Value)
            XCTAssertEqual(summary.plaintextSHA256, entry["plaintextSha256"] as? String)
            XCTAssertEqual(summary.frameCount, entry["frames"] as? Int)
            sizes.insert(summary.plaintextBytes)
        }
        XCTAssertEqual(sizes, [1_048_576, 2_097_189])
    }
}
