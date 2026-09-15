import Clibsodium
import CryptoKit
import Foundation
import XCTest

private let fixtureKey = "pny1-" + String(repeating: "07", count: 32)
private enum Injected: Error { case io, sink }

private final class PatternInput: V4FrameInput {
    let size: Int64
    var offset: Int64 = 0
    var maximumRead = 0
    var failAt: Int64?
    let shortReads: Int
    init(_ size: Int64, shortReads: Int = 65_536) { self.size = size; self.shortReads = shortReads }
    func read(upToCount count: Int) throws -> Data {
        maximumRead = max(maximumRead, count)
        if let failAt, offset >= failAt { throw Injected.io }
        let length = min(count, shortReads, Int(size - offset))
        let start = offset; offset += Int64(length)
        return Data((0..<length).map { UInt8((start + Int64($0)) % 251) })
    }
}

private final class BytesInput: V4FrameInput {
    let bytes: Data
    var offset = 0
    var maxRead = 0
    var shortReads: Int
    var failAt: Int?
    init(_ bytes: Data, shortReads: Int = 65_536) { self.bytes = bytes; self.shortReads = shortReads }
    func read(upToCount count: Int) throws -> Data {
        if let failAt, offset >= failAt { throw Injected.io }
        maxRead = max(maxRead, count)
        let end = min(bytes.count, offset + min(count, shortReads))
        defer { offset = end }
        return bytes.subdata(in: offset..<end)
    }
}

private final class MemoryCiphertext: V4CiphertextSink {
    var bytes = Data(), finished = false, discarded = false, writes = 0
    var onWrite: (() throws -> Void)?
    var onFinish: (() throws -> Void)?
    func write(_ value: Data) throws { bytes.append(value); writes += 1; try onWrite?() }
    func finish() throws { finished = true; try onFinish?() }
    func discard() { bytes.removeAll(); finished = false; discarded = true }
}

private final class HashCandidate: V4IsolatedPlaintextSink {
    var bytes: Int64 = 0, historicalAppends = 0, discarded = false
    var completed: V4FrameSummary?
    var hash = SHA256()
    var pattern = false
    var maximumChunk = 0
    var onAppend: (() throws -> Void)?
    var failFinish = false
    var onFinish: (() throws -> Void)?
    func appendAuthenticated(_ value: Data, sequence: Int64, final: Bool) throws {
        maximumChunk = max(maximumChunk, value.count)
        if pattern {
            for (index, byte) in value.enumerated() {
                guard byte == UInt8((bytes + Int64(index)) % 251) else { throw Injected.sink }
            }
        }
        bytes += Int64(value.count); historicalAppends += 1; hash.update(data: value)
        try onAppend?()
    }
    func finishFrames(_ summary: V4FrameSummary) throws {
        if failFinish { throw Injected.sink }
        XCTAssertEqual(summary.plaintextSHA256, hash.finalize().map { String(format: "%02x", $0) }.joined())
        completed = summary
        try onFinish?()
    }
    func discard() { bytes = 0; hash = SHA256(); completed = nil; discarded = true }
}

final class V4FrameTests: XCTestCase {
    private var directory: URL!
    override func setUpWithError() throws {
        directory = FileManager.default.temporaryDirectory.appendingPathComponent("penny-frame-\(UUID())", isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true, attributes: [.protectionKey: FileProtectionType.complete])
        var values = URLResourceValues(); values.isExcludedFromBackup = true
        try directory.setResourceValues(values)
    }
    override func tearDownWithError() throws { try FileManager.default.removeItem(at: directory) }
    private func seal(_ size: Int64, shortReads: Int = 65_536) throws -> Data {
        let out = MemoryCiphertext()
        _ = try V4FrameCodec.seal(input: PatternInput(size, shortReads: shortReads), output: out, recoveryKey: fixtureKey)
        XCTAssertTrue(out.finished); XCTAssertFalse(out.discarded)
        return out.bytes
    }
    private func reject(_ bytes: Data, key: String = fixtureKey, expected: V4FrameError? = nil,
                        file: StaticString = #filePath, line: UInt = #line) {
        let candidate = HashCandidate()
        XCTAssertThrowsError(try V4FrameCodec.open(input: BytesInput(bytes), candidate: candidate, recoveryKey: key), file: file, line: line) { error in
            if let expected { XCTAssertEqual(error as? V4FrameError, expected, file: file, line: line) }
        }
        XCTAssertTrue(candidate.discarded, file: file, line: line)
        XCTAssertNil(candidate.completed, file: file, line: line)
        XCTAssertEqual(candidate.bytes, 0, file: file, line: line)
    }

    func testSmallShortReadsAndFullFinalBoundaries() throws {
        for size in [1, 17, 65_536, V4FrameCodec.chunkBytes - 1, V4FrameCodec.chunkBytes, V4FrameCodec.chunkBytes + 1] {
            let source = PatternInput(Int64(size), shortReads: 8191), out = MemoryCiphertext()
            let encoded = try V4FrameCodec.seal(input: source, output: out, recoveryKey: fixtureKey)
            let candidate = HashCandidate(); candidate.pattern = true
            let input = BytesInput(out.bytes, shortReads: 4093)
            let decoded = try V4FrameCodec.open(input: input, candidate: candidate, recoveryKey: fixtureKey)
            XCTAssertEqual(decoded, encoded)
            XCTAssertEqual(decoded.frameCount, (size + V4FrameCodec.chunkBytes - 1) / V4FrameCodec.chunkBytes)
            XCTAssertLessThanOrEqual(source.maximumRead, 65_536)
            XCTAssertLessThanOrEqual(input.maxRead, 65_536)
            XCTAssertLessThanOrEqual(candidate.maximumChunk, V4FrameCodec.chunkBytes)
        }
    }

    func testRandomHeaderAndRecoveryKeyParsing() throws {
        let first = try seal(37), second = try seal(37)
        XCTAssertEqual(first.prefix(14), Data([0x50,0x4e,0x59,0x42,0x4b,0x50,0x34,0x0a,0,4,0,0x10,0,0]))
        XCTAssertNotEqual(first.subdata(in: 14..<46), second.subdata(in: 14..<46))
        XCTAssertNotEqual(first.subdata(in: 46..<70), second.subdata(in: 46..<70))
        XCTAssertNotEqual(first, second)
        _ = try V4FrameCodec.open(input: BytesInput(first), candidate: HashCandidate(), recoveryKey: "\u{FEFF}\n" + fixtureKey + "\u{00a0}")
        for key in [fixtureKey.uppercased(), String(fixtureKey.dropLast()), fixtureKey + "0", "pny1-" + String(repeating: "gg", count: 32), fixtureKey + "\u{200b}"] {
            reject(first, key: key, expected: .invalidRecoveryKey)
        }
        reject(first, key: "pny1-" + String(repeating: "08", count: 32), expected: .authentication)
    }

    func testEveryHeaderAndFrameHeaderByteMutationFails() throws {
        let valid = try seal(37)
        for index in 0..<86 {
            var changed = valid; changed[index] ^= 1
            reject(changed)
        }
        for index in 86..<valid.count {
            var changed = valid; changed[index] ^= 1
            reject(changed, expected: .authentication)
        }
    }

    func testTruncationAtEverySmallFileOffsetAndTrailingByte() throws {
        let valid = try seal(37)
        for size in 0..<valid.count { reject(Data(valid.prefix(size))) }
        reject(valid + Data([0]), expected: .trailingBytes)
    }

    func testLengthAndSequenceRejectBeforeReadingBody() throws {
        let header = Data(try seal(1).prefix(70))
        for length: UInt64 in [0, 17, 1_048_594, UInt64(Int64.max), UInt64.max] {
            let input = BytesInput(header + V4FrameCodec.encoded(0) + V4FrameCodec.encoded(length))
            XCTAssertThrowsError(try V4FrameCodec.open(input: input, candidate: HashCandidate(), recoveryKey: fixtureKey))
            XCTAssertEqual(input.offset, 86)
        }
        for sequence: UInt64 in [1, 639, 640, UInt64.max] {
            reject(header + V4FrameCodec.encoded(sequence) + V4FrameCodec.encoded(18))
        }
    }

    func testLaterFailureDiscardsEarlierAuthenticatedFrame() throws {
        var encoded = try seal(Int64(V4FrameCodec.chunkBytes + 1))
        encoded[encoded.count - 1] ^= 1
        let candidate = HashCandidate()
        XCTAssertThrowsError(try V4FrameCodec.open(input: BytesInput(encoded), candidate: candidate, recoveryKey: fixtureKey))
        XCTAssertEqual(candidate.historicalAppends, 1)
        XCTAssertTrue(candidate.discarded); XCTAssertNil(candidate.completed); XCTAssertEqual(candidate.bytes, 0)
    }

    func testReorderDuplicateAndCrossArchiveSplice() throws {
        let a = try seal(Int64(V4FrameCodec.chunkBytes + 1)), b = try seal(Int64(V4FrameCodec.chunkBytes + 1))
        let split = 70 + 16 + V4FrameCodec.maximumCiphertextChunk
        let head = Data(a.prefix(70)), first = a.subdata(in: 70..<split), last = Data(a.suffix(from: split))
        reject(head + last + first)
        reject(head + first + first + last)
        reject(head + first + Data(b.suffix(from: split)), expected: .authentication)
        reject(head + first)
    }

    func testCancellationDiscardsOnEitherSideOfFinality() throws {
        for size in [1, V4FrameCodec.chunkBytes + 1] {
            let encoded = try seal(Int64(size)), candidate = HashCandidate()
            var cancelled = false
            candidate.onAppend = { cancelled = true }
            XCTAssertThrowsError(try V4FrameCodec.open(input: BytesInput(encoded), candidate: candidate, recoveryKey: fixtureKey,
                cancellation: { if cancelled { throw CancellationError() } })) { XCTAssertTrue($0 is CancellationError) }
            XCTAssertTrue(candidate.discarded); XCTAssertNil(candidate.completed)
            XCTAssertEqual(candidate.historicalAppends, 1)
        }
        let out = MemoryCiphertext(); var cancelled = false
        out.onWrite = { if out.writes == 3 { cancelled = true } }
        XCTAssertThrowsError(try V4FrameCodec.seal(input: PatternInput(2_097_153), output: out, recoveryKey: fixtureKey,
            cancellation: { if cancelled { throw CancellationError() } })) { XCTAssertTrue($0 is CancellationError) }
        out.onWrite = nil
        XCTAssertTrue(out.discarded); XCTAssertTrue(out.bytes.isEmpty)
    }

    func testSourceAndSinkErrorsAreNotEOFOrSuccessfulCompletion() throws {
        let source = PatternInput(2_097_153); source.failAt = 1_048_577
        let file = directory.appendingPathComponent("failed.pennyframe")
        XCTAssertThrowsError(try V4FrameCodec.seal(input: source, output: V4NewCiphertextFile(url: file), recoveryKey: fixtureKey))
        XCTAssertFalse(FileManager.default.fileExists(atPath: file.path))
        let valid = try seal(37)
        for finishFailure in [false, true] {
            let candidate = HashCandidate()
            candidate.failFinish = finishFailure
            if !finishFailure { candidate.onAppend = { throw Injected.sink } }
            XCTAssertThrowsError(try V4FrameCodec.open(input: BytesInput(valid), candidate: candidate, recoveryKey: fixtureKey))
            XCTAssertTrue(candidate.discarded); XCTAssertNil(candidate.completed)
        }
        let out = MemoryCiphertext(); out.onWrite = { throw Injected.io }
        XCTAssertThrowsError(try V4FrameCodec.seal(input: PatternInput(1), output: out, recoveryKey: fixtureKey))
        XCTAssertTrue(out.discarded)
        let cipherSource = BytesInput(try seal(1_048_577))
        cipherSource.failAt = 70 + 16 + V4FrameCodec.maximumCiphertextChunk
        let candidate = HashCandidate()
        XCTAssertThrowsError(try V4FrameCodec.open(input: cipherSource, candidate: candidate, recoveryKey: fixtureKey)) { XCTAssertTrue($0 is Injected) }
        XCTAssertEqual(candidate.historicalAppends, 1)
        XCTAssertTrue(candidate.discarded); XCTAssertNil(candidate.completed)
    }

    func testCancellationInsideFinishDiscardsBothSinks() throws {
        let out = MemoryCiphertext(); var cancelled = false
        out.onFinish = { cancelled = true }
        XCTAssertThrowsError(try V4FrameCodec.seal(input: PatternInput(1), output: out, recoveryKey: fixtureKey,
            cancellation: { if cancelled { throw CancellationError() } })) { XCTAssertTrue($0 is CancellationError) }
        XCTAssertTrue(out.discarded); XCTAssertFalse(out.finished); XCTAssertTrue(out.bytes.isEmpty)
        cancelled = false
        let candidate = HashCandidate(); candidate.onFinish = { cancelled = true }
        XCTAssertThrowsError(try V4FrameCodec.open(input: BytesInput(try seal(1)), candidate: candidate, recoveryKey: fixtureKey,
            cancellation: { if cancelled { throw CancellationError() } })) { XCTAssertTrue($0 is CancellationError) }
        XCTAssertTrue(candidate.discarded); XCTAssertNil(candidate.completed); XCTAssertEqual(candidate.bytes, 0)
    }

    func testEmptyInputAndBrokenSourceRefused() throws {
        let out = MemoryCiphertext()
        XCTAssertThrowsError(try V4FrameCodec.seal(input: PatternInput(0), output: out, recoveryKey: fixtureKey)) { XCTAssertEqual($0 as? V4FrameError, .emptyPlaintext) }
        XCTAssertTrue(out.discarded)
        final class Overread: V4FrameInput { func read(upToCount count: Int) throws -> Data { Data(count: count + 1) } }
        XCTAssertThrowsError(try V4FrameCodec.seal(input: Overread(), output: MemoryCiphertext(), recoveryKey: fixtureKey)) { XCTAssertEqual($0 as? V4FrameError, .sourceViolation) }
        final class UnstableEOF: V4FrameInput {
            var reads = 0
            func read(upToCount count: Int) throws -> Data { reads += 1; return reads == 2 ? Data() : Data([1]) }
        }
        XCTAssertThrowsError(try V4FrameCodec.seal(input: UnstableEOF(), output: MemoryCiphertext(), recoveryKey: fixtureKey)) { XCTAssertEqual($0 as? V4FrameError, .sourceViolation) }
    }

    func testExclusiveFileCollisionAndClosedInput() throws {
        let path = directory.appendingPathComponent("previous.pennyframe")
        let previous = Data([7,8,9]); try previous.write(to: path)
        XCTAssertThrowsError(try V4NewCiphertextFile(url: path))
        XCTAssertEqual(try Data(contentsOf: path), previous)
        let input = try V4FileInput(url: path, maximumBytes: 3)
        try input.close()
        XCTAssertThrowsError(try input.read(upToCount: 1))
        XCTAssertThrowsError(try V4FileInput(url: path, maximumBytes: 2))
        let link = directory.appendingPathComponent("link")
        try FileManager.default.createSymbolicLink(at: link, withDestinationURL: path)
        XCTAssertThrowsError(try V4FileInput(url: link, maximumBytes: 3))
        XCTAssertThrowsError(try V4NewCiphertextFile(url: link))
        XCTAssertEqual(try Data(contentsOf: path), previous)
    }

    private func resources() throws -> URL {
        try XCTUnwrap(Bundle(for: Self.self).resourceURL?.appendingPathComponent("Fixtures"))
    }
    private func manifest(_ filename: String) throws -> [String: Any] {
        let url = try resources().appendingPathComponent(filename)
        let data = try Data(contentsOf: url)
        XCTAssertLessThan(data.count, 256 * 1024)
        return try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
    }
    func testIndependentLibraryGoldens() throws {
        let entries = try XCTUnwrap(try manifest("fixture-manifest.json")["positives"] as? [[String: Any]])
        XCTAssertEqual(entries.count, 4)
        for entry in entries {
            let name = try XCTUnwrap(entry["file"] as? String), key = try XCTUnwrap(entry["recoveryKey"] as? String)
            let candidate = HashCandidate()
            candidate.pattern = (entry["plaintext"] as? [String: Any])?["kind"] as? String == "pattern-mod-251"
            let input = try V4FileInput(url: resources().appendingPathComponent(name), maximumBytes: V4FrameCodec.maximumFile)
            defer { try? input.close() }
            let result = try V4FrameCodec.open(input: input, candidate: candidate, recoveryKey: key)
            XCTAssertEqual(result.plaintextSHA256, entry["plaintextSha256"] as? String, name)
            XCTAssertEqual(result.plaintextBytes, (entry["plaintextBytes"] as? NSNumber)?.int64Value, name)
            XCTAssertEqual(result.ciphertextBytes, (entry["ciphertextBytes"] as? NSNumber)?.int64Value, name)
            XCTAssertEqual(result.frameCount, entry["frames"] as? Int, name)
            XCTAssertNotNil(candidate.completed)
        }
    }

    func testIndependentNegativeGoldens() throws {
        let entries = try XCTUnwrap(try manifest("negative-manifest.json")["cases"] as? [[String: Any]])
        XCTAssertGreaterThanOrEqual(entries.count, 28)
        for entry in entries {
            let name = try XCTUnwrap(entry["file"] as? String)
            let candidate = HashCandidate()
            let input = try V4FileInput(url: resources().appendingPathComponent(name), maximumBytes: V4FrameCodec.maximumFile)
            defer { try? input.close() }
            XCTAssertThrowsError(try V4FrameCodec.open(input: input, candidate: candidate,
                recoveryKey: entry["recoveryKey"] as? String ?? fixtureKey), name)
            XCTAssertTrue(candidate.discarded, name); XCTAssertNil(candidate.completed, name)
        }
    }

    func testNativeFileExportsForIndependentVerification() throws {
        var metadata: [[String: Any]] = []
        for (name, count, expected) in [("native-full-final", 1_048_576, "631b84027d6b9e52b539c4e8373622d23032dfadc64d60af87339c9037e4f769"),
                                         ("native-multi", 2_097_189, "d4a6a5c160293ee7f0ac94b89193501ce4f4ca3405a6ee625bace8b1f79fe873")] {
            let path = directory.appendingPathComponent(name + ".pennyframe")
            let encoded = try V4FrameCodec.seal(input: PatternInput(Int64(count)), output: V4NewCiphertextFile(url: path), recoveryKey: fixtureKey)
            let input = try V4FileInput(url: path, maximumBytes: V4FrameCodec.maximumFile)
            let candidate = HashCandidate(); candidate.pattern = true
            XCTAssertEqual(try V4FrameCodec.open(input: input, candidate: candidate, recoveryKey: fixtureKey), encoded)
            try input.close()
            XCTAssertEqual(encoded.plaintextSHA256, expected)
            let hasherInput = try V4FileInput(url: path, maximumBytes: V4FrameCodec.maximumFile)
            var cipherHash = SHA256()
            while true { let chunk = try hasherInput.read(upToCount: 65_536); if chunk.isEmpty { break }; cipherHash.update(data: chunk) }
            try hasherInput.close()
            let attachment = XCTAttachment(contentsOfFile: path)
            attachment.name = name + ".pennyframe"; attachment.lifetime = .keepAlways; add(attachment)
            metadata.append(["name": name, "file": name + ".pennyframe", "recoveryKey": fixtureKey,
                             "plaintext": ["kind": "pattern-mod-251", "bytes": count], "plaintextBytes": count,
                             "plaintextSha256": expected, "ciphertextBytes": encoded.ciphertextBytes,
                             "ciphertextSha256": cipherHash.finalize().map { String(format: "%02x", $0) }.joined(),
                             "frames": encoded.frameCount, "scope": "frame-only; not a validated ledger"])
        }
        let data = try JSONSerialization.data(withJSONObject: ["schemaVersion": 1, "producer": "Swift XCTest on iOS Simulator", "positives": metadata], options: [.prettyPrinted, .sortedKeys])
        let attachment = XCTAttachment(data: data, uniformTypeIdentifier: "public.json")
        attachment.name = "native-fixture-manifest.json"; attachment.lifetime = .keepAlways; add(attachment)
    }
}
