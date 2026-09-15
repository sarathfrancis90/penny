import CryptoKit
import Foundation
import Synchronization
import XCTest
@testable import PennyOffline

@MainActor final class FilesRestoreTests: XCTestCase {
    private let key = SymmetricKey(data: Data(repeating: 0x0b, count: 32))
    private let recovery = "pny1-" + String(repeating: "07", count: 32)
    private func directory() throws -> URL {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
        addTeardownBlock { try? FileManager.default.removeItem(at: url) }; return url
    }
    private func fixture(_ path: String) throws -> Data {
        try Data(contentsOf: XCTUnwrap(Bundle(for: Self.self).resourceURL).appendingPathComponent("fixtures/" + path))
    }
    private func original() throws -> VaultSnapshot { try StrictJSON.snapshot(fixture("local-generation-v1/previous.json")) }
    private func encoded(_ snapshot: VaultSnapshot) throws -> Data {
        let encoder = JSONEncoder(); encoder.outputFormatting = [.sortedKeys, .withoutEscapingSlashes]
        return try encoder.encode(snapshot)
    }
    private func file(_ bytes: Data) throws -> URL {
        let url = try directory().appendingPathComponent("incoming.pennybackup"); try bytes.write(to: url); return url
    }
    private func disk(_ directory: URL) throws -> [String: Data] {
        let enumerator = try XCTUnwrap(FileManager.default.enumerator(at: directory, includingPropertiesForKeys: [.isRegularFileKey]))
        var result: [String: Data] = [:]
        for case let url as URL in enumerator where try url.resourceValues(forKeys: [.isRegularFileKey]).isRegularFile == true {
            result[url.path] = try Data(contentsOf: url)
        }
        return result
    }
    func testV4FilesPreviewRequiresExplicitReplacementAndReopens() async throws {
        let directory = try directory(), store = VaultStore(directory: directory, key: key)
        try store.replace(original()); let before = try encoded((try store.compatibilitySnapshot()))
        let input = try file(fixture("v4-frames/one-receipt.pennyframe"))
        let preview = try await store.prepareFilesRestore(input, recoveryKey: recovery) {
            // Provider contents may change after its one coordinated acquisition.
            try Data("replaced external input".utf8).write(to: input)
        }
        XCTAssertEqual(try encoded((try store.compatibilitySnapshot())), before)
        XCTAssertEqual(try encoded((try VaultStore(directory: directory, key: key).compatibilitySnapshot())), before)
        XCTAssertEqual(preview.recordCount, 1); XCTAssertEqual(preview.receiptCount, 1)
        try await preview.replace(in: store)
        XCTAssertEqual((try store.compatibilitySnapshot()).expenses.count, 1); XCTAssertEqual((try store.compatibilitySnapshot()).attachments.count, 1)
        XCTAssertEqual(try (try store.compatibilitySnapshot()).attachments[0].bytes(), try fixture("receipt.png"))
        XCTAssertEqual(try encoded((try VaultStore(directory: directory, key: key).compatibilitySnapshot())), try encoded((try store.compatibilitySnapshot())))
        do { try await preview.replace(in: store); XCTFail("reused confirmation") } catch {}
    }
    func testCancelledPreviewCleansCandidateAndCannotReplace() async throws {
        let directory = try directory(), store = VaultStore(directory: directory, key: key)
        try store.replace(original()); let before = try disk(directory)
        let preview = try await store.prepareFilesRestore(file(fixture("v4-frames/one-receipt.pennyframe")), recoveryKey: recovery)
        try preview.close(); try preview.close()
        XCTAssertEqual(try disk(directory), before)
        do { try await preview.replace(in: store); XCTFail("cancelled candidate installed") } catch {}
        XCTAssertEqual(try disk(directory), before)
    }
    func testWrongKeyDamagedV4AndAcquisitionCancellationPreserveVault() async throws {
        let directory = try directory(), store = VaultStore(directory: directory, key: key)
        try store.replace(original()); let before = try disk(directory), valid = try fixture("v4-frames/one-receipt.pennyframe")
        for (data, recoveryKey) in [(valid, "pny1-" + String(repeating: "08", count: 32)), (Data(valid.dropLast()), recovery), (Data("PNYBKP4\n".utf8), recovery)] {
            do { _ = try await store.prepareFilesRestore(file(data), recoveryKey: recoveryKey); XCTFail("invalid file accepted") } catch {}
            XCTAssertEqual(try disk(directory), before)
        }
        do {
            _ = try await store.prepareFilesRestore(file(valid), recoveryKey: recovery, afterAcquisition: { throw CancellationError() })
            XCTFail("cancelled acquisition accepted")
        } catch {}
        XCTAssertEqual(try disk(directory), before)
    }
    func testInterveningEditsBeforePreviewAndBeforeConfirmationReject() async throws {
        for editDuringAcquisition in [false, true] {
            let directory = try directory(), store = VaultStore(directory: directory, key: key)
            try store.replace(original()); var changed = try original(); changed.expenses[0].note = "New local edit"
            let edit = changed, input = try file(fixture("v4-frames/one-receipt.pennyframe"))
            do {
                let preview = try await store.prepareFilesRestore(input, recoveryKey: recovery) {
                    if editDuringAcquisition { try store.replace(edit) }
                }
                defer { try? preview.close() }
                if !editDuringAcquisition { try store.replace(edit) }
                try await preview.replace(in: store); XCTFail("stale restore installed")
            } catch {}
            XCTAssertEqual(try encoded((try VaultStore(directory: directory, key: key).compatibilitySnapshot())), try encoded(edit))
        }
    }
    func testLegacyFileUsesExistingDecoderAndConfirmation() async throws {
        let directory = try directory(), store = VaultStore(directory: directory, key: key)
        try store.replace(original()); let before = try encoded((try store.compatibilitySnapshot()))
        let bytes = try fixture("raw-savings-v1/positive.pennybackup")
        let expected = try BackupArchive.restore(bytes, recoveryKey: recovery)
        let preview = try await store.prepareFilesRestore(file(bytes), recoveryKey: recovery)
        XCTAssertEqual(preview.recordCount, expected.recordCount); XCTAssertEqual(try encoded((try store.compatibilitySnapshot())), before)
        try await preview.replace(in: store)
        XCTAssertEqual(try encoded((try VaultStore(directory: directory, key: key).compatibilitySnapshot())), try encoded(expected))
    }
    func testLegacyPreviewSurvivesUnavailableCurrentDeviceKey() async throws {
        let directory = try directory(), missing = Mutex(false), provided = key
        let store = VaultStore(directory: directory, deviceKeyReader: { _ in
            if missing.withLock({ $0 }) { throw ExpenseError.missingKey }; return provided
        })
        try store.replace(original()); let before = try disk(directory)
        missing.withLock { $0 = true }
        let bytes = try fixture("raw-savings-v1/positive.pennybackup")
        let expected = try BackupArchive.restore(bytes, recoveryKey: recovery)
        let preview = try await store.prepareFilesRestore(file(bytes), recoveryKey: recovery)
        XCTAssertEqual(preview.recordCount, expected.recordCount)
        try preview.close(); XCTAssertEqual(try disk(directory), before)
    }
}
