import CryptoKit
import Foundation
import XCTest
@testable import PennyOffline

@MainActor final class DurableProcessTests: XCTestCase {
    private let key = SymmetricKey(data: Data(repeating: 0x0b, count: 32))
    private func input(_ name: String) throws -> VaultSnapshot {
        let file = try XCTUnwrap(Bundle(for: Self.self).resourceURL).appendingPathComponent("fixtures/local-generation-v1/" + name + ".json")
        return try StrictJSON.snapshot(Data(contentsOf: file))
    }
    private func equal(_ actual: VaultSnapshot, _ expected: VaultSnapshot, file: StaticString = #filePath, line: UInt = #line) throws {
        let e = JSONEncoder(); e.outputFormatting = [.sortedKeys, .withoutEscapingSlashes]
        XCTAssertEqual(try e.encode(actual), try e.encode(expected), file: file, line: line)
    }
    private func directory() throws -> URL {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        addTeardownBlock { try? FileManager.default.removeItem(at: url) }; return url
    }
    private func files(_ directory: URL) throws -> Set<String> { Set(try FileManager.default.contentsOfDirectory(atPath: directory.appendingPathComponent("PennyOffline").path)) }
    // Run these two methods in separate xcodebuild test invocations for actual
    // process separation. They intentionally do not use test-only rollback cleanup.
    func testFreshProcessWritePending() throws {
        let parent = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("DurableProcessProof")
        XCTAssertFalse(FileManager.default.fileExists(atPath: parent.path))
        try FileManager.default.createDirectory(at: parent, withIntermediateDirectories: true)
        try Data(String(ProcessInfo.processInfo.processIdentifier).utf8).write(to: parent.appendingPathComponent("writer.pid"), options: .withoutOverwriting)
        print("DURABLE_WRITER_PID=\(ProcessInfo.processInfo.processIdentifier)")
        let previous = try input("previous"), replacement = try input("replacement")
        for invalid in [false, true] {
            let dir = parent.appendingPathComponent(invalid ? "invalid" : "valid")
            try VaultStore(directory: dir, key: key).replace(previous)
            let existing = try files(dir)
            let writer = VaultStore(directory: dir, key: key, commitCheckpoint: { stage in
                guard stage == .committed else { return }
                if invalid {
                    let root = dir.appendingPathComponent("PennyOffline")
                    let group = try XCTUnwrap(FileManager.default.contentsOfDirectory(atPath: root.path).first { !existing.contains($0) && UUID(uuidString: $0) != nil })
                    let receipt = root.appendingPathComponent(group).appendingPathComponent(replacement.attachments[0].id + ".pennyreceipt")
                    var data = try Data(contentsOf: receipt); data[data.count - 1] ^= 1; try data.write(to: receipt)
                }
                throw DurableCrash.interrupted
            })
            XCTAssertThrowsError(try writer.restore(replacement))
        }
    }
    func testFreshProcessReadPending() throws {
        let parent = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("DurableProcessProof")
        XCTAssertTrue(FileManager.default.fileExists(atPath: parent.path))
        defer { try? FileManager.default.removeItem(at: parent) }
        let writerPID = try String(contentsOf: parent.appendingPathComponent("writer.pid"), encoding: .utf8)
        XCTAssertNotEqual(writerPID, String(ProcessInfo.processInfo.processIdentifier))
        print("DURABLE_READER_PID=\(ProcessInfo.processInfo.processIdentifier); WRITER_PID=\(writerPID)")
        for invalid in [false, true] {
            let reopened = VaultStore(directory: parent.appendingPathComponent(invalid ? "invalid" : "valid"), key: key)
            XCTAssertTrue(reopened.isReady); try equal(reopened.snapshot, input(invalid ? "previous" : "replacement"))
        }
    }
}
