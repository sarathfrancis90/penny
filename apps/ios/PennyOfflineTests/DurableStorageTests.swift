import CryptoKit
import Foundation
import XCTest
@testable import PennyOffline

@MainActor final class DurableStorageTests: XCTestCase {
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
    func testSharedLegacyMigrationPrepareCancelAndReceiptReuse() async throws {
        let dir = try directory(), previous = try input("previous"), replacement = try input("replacement")
        let old = dir.appendingPathComponent("PennyOffline/vault-v1.pennyvault")
        try FileManager.default.createDirectory(at: old.deletingLastPathComponent(), withIntermediateDirectories: true)
        try VaultCipher.seal(JSONEncoder().encode(previous), key: key).write(to: old)
        let legacyBytes = try Data(contentsOf: old), store = VaultStore(directory: dir, key: key)
        try equal(store.snapshot, previous)
        let prepared = try await store.prepareWrite(replacement, restoring: true)
        XCTAssertEqual(try Data(contentsOf: old), legacyBytes)
        let cancelled = Task { try await store.replaceAsync(replacement) }; cancelled.cancel()
        do { try await cancelled.value; XCTFail("Cancelled preparation") } catch {}
        XCTAssertEqual(try Data(contentsOf: old), legacyBytes)
        try store.replace(previous)
        XCTAssertNotEqual(try Data(contentsOf: old), legacyBytes)
        try equal(VaultStore(directory: dir, key: key).snapshot, previous)
        let groups = try files(dir).filter { UUID(uuidString: $0) != nil }
        XCTAssertEqual(groups.count, 1)
        try store.save(previous.expenses[0])
        XCTAssertEqual(try files(dir).filter { UUID(uuidString: $0) != nil }, groups)
        XCTAssertThrowsError(try store.apply(prepared))
    }
    func testSharedSecondInstanceRevisionRestoreIncarnationAndMissingActive() async throws {
        let dir = try directory(), previous = try input("previous"), replacement = try input("replacement")
        let first = VaultStore(directory: dir, key: key); try first.replace(previous)
        let stale = try await first.prepareWrite(replacement, restoring: true)
        let second = VaultStore(directory: dir, key: key); try second.restore(previous)
        XCTAssertThrowsError(try first.apply(stale))
        try equal(VaultStore(directory: dir, key: key).snapshot, previous)
        let original = try Data(contentsOf: dir.appendingPathComponent("PennyOffline/vault-v1.pennyvault"))
        let wrongKey = VaultStore(directory: dir, key: SymmetricKey(size: .bits256)); XCTAssertFalse(wrongKey.isReady)
        XCTAssertEqual(try Data(contentsOf: dir.appendingPathComponent("PennyOffline/vault-v1.pennyvault")), original)
        try FileManager.default.removeItem(at: dir.appendingPathComponent("PennyOffline/vault-v1.pennyvault"))
        let missing = VaultStore(directory: dir, key: key); XCTAssertFalse(missing.isReady)
        XCTAssertThrowsError(try missing.save(previous.expenses[0]))
        // Explicit verified recovery is permitted even when the live marker is gone.
        try missing.restore(replacement)
        try equal(VaultStore(directory: dir, key: key).snapshot, replacement)
    }
    func testSharedPendingRecoveryAndEstablishedCorruption() throws {
        for stage in [VaultStore.CommitStage.staged, .committed, .verified, .journalCleared] {
            let dir = try directory(), previous = try input("previous"), replacement = try input("replacement")
            try VaultStore(directory: dir, key: key).replace(previous)
            let interrupted = VaultStore(directory: dir, key: key, commitCheckpoint: { if $0 == stage { throw DurableCrash.interrupted } })
            XCTAssertThrowsError(try interrupted.restore(replacement))
            let reopened = VaultStore(directory: dir, key: key)
            XCTAssertTrue(reopened.isReady); try equal(reopened.snapshot, stage == .staged ? previous : replacement)
            let live = dir.appendingPathComponent("PennyOffline/vault-v1.pennyvault")
            var bytes = try Data(contentsOf: live); bytes[bytes.count - 1] ^= 1; try bytes.write(to: live)
            XCTAssertFalse(VaultStore(directory: dir, key: key).isReady)
        }
    }
    func testTamperedCandidateAndPendingInvalidReceiptPreservePrevious() throws {
        for stage in [VaultStore.CommitStage.staged, .committed, .verified] {
            let dir = try directory(), previous = try input("previous"), replacement = try input("replacement")
            try VaultStore(directory: dir, key: key).replace(previous)
            let existing = try files(dir)
            let failed = VaultStore(directory: dir, key: key, commitCheckpoint: { point in
                guard point == stage else { return }
                let folder = dir.appendingPathComponent("PennyOffline")
                let additions = try FileManager.default.contentsOfDirectory(atPath: folder.path).filter { !existing.contains($0) && UUID(uuidString: $0) != nil }
                guard let group = additions.first else { throw LocalReceiptBlobError.file }
                let receipt = folder.appendingPathComponent(group).appendingPathComponent(replacement.attachments[0].id + ".pennyreceipt")
                var wire = try Data(contentsOf: receipt); wire[wire.count - 1] ^= 1; try wire.write(to: receipt)
                if stage == .committed { throw DurableCrash.interrupted }
            })
            XCTAssertThrowsError(try failed.restore(replacement))
            let recovered = VaultStore(directory: dir, key: key); XCTAssertTrue(recovered.isReady)
            try equal(recovered.snapshot, previous)
        }
    }
    func testPinnedPreviousAndForeignGarbageEntries() throws {
        let dir = try directory(), previous = try input("previous"), replacement = try input("replacement")
        let store = VaultStore(directory: dir, key: key); try store.replace(previous)
        let lease = try store.leaseSnapshot()
        let group = try XCTUnwrap(files(dir).first { UUID(uuidString: $0) != nil })
        let old = dir.appendingPathComponent("PennyOffline").appendingPathComponent(group)
        try store.restore(replacement); try store.replace(replacement) // old is beyond immediate predecessor
        let unknown = dir.appendingPathComponent("PennyOffline/foreign")
        try Data([7]).write(to: unknown)
        XCTAssertEqual(try store.collectReceiptGarbage(), 0); XCTAssertTrue(FileManager.default.fileExists(atPath: old.path))
        try equal(lease.snapshot, previous); try lease.close(); try lease.close()
        XCTAssertEqual(try store.collectReceiptGarbage(), 1); XCTAssertFalse(FileManager.default.fileExists(atPath: old.path))
        XCTAssertEqual(try Data(contentsOf: unknown), Data([7])); try equal(VaultStore(directory: dir, key: key).snapshot, replacement)
    }
    func testCancelledPublishedTaskRollsBackAndVerifiedRestoreRepairsReceipt() async throws {
        for stage in [VaultStore.CommitStage.committed, .verified] {
            let dir = try directory(), previous = try input("previous"), replacement = try input("replacement")
            try VaultStore(directory: dir, key: key).replace(previous)
            let store = VaultStore(directory: dir, key: key, commitCheckpoint: { if $0 == stage { withUnsafeCurrentTask { $0?.cancel() } } })
            let operation = Task { try await store.restoreAsync(replacement) }
            do { try await operation.value; XCTFail("Cancelled published task") } catch is CancellationError {} catch { XCTFail("Expected cancellation, got \(error)") }
            try equal(store.snapshot, previous); try equal(VaultStore(directory: dir, key: key).snapshot, previous)
        }
        let dir = try directory(), previous = try input("previous")
        let store = VaultStore(directory: dir, key: key); try store.replace(previous)
        let group = try XCTUnwrap(files(dir).first { UUID(uuidString: $0) != nil })
        let receipt = dir.appendingPathComponent("PennyOffline").appendingPathComponent(group).appendingPathComponent(previous.attachments[0].id + ".pennyreceipt")
        var bytes = try Data(contentsOf: receipt); bytes[bytes.count - 1] ^= 1; try bytes.write(to: receipt)
        XCTAssertFalse(VaultStore(directory: dir, key: key).isReady)
        try await store.restoreAsync(previous)
        try equal(VaultStore(directory: dir, key: key).snapshot, previous)
    }

    func testMissingKeyRecoveryAndRepeatedRevisionIncarnation() async throws {
        let dir = try directory(), previous = try input("previous"), replacement = try input("replacement")
        try VaultStore(directory: dir, key: key).replace(previous)
        let publicTestKey = key
        let missing = VaultStore(directory: dir, deviceKeyReader: { create in
            guard create else { throw ExpenseError.missingKey }; return publicTestKey
        })
        XCTAssertFalse(missing.isReady)
        XCTAssertThrowsError(try missing.replace(replacement))
        try missing.restore(replacement); try equal(VaultStore(directory: dir, key: key).snapshot, replacement)
        let recreated = try directory(), initial = VaultStore(directory: recreated, key: key)
        let stale = try await initial.prepareWrite(previous)
        try FileManager.default.removeItem(at: recreated)
        let fresh = VaultStore(directory: recreated, key: key)
        XCTAssertEqual(fresh.revision, stale.sourceRevision)
        XCTAssertThrowsError(try fresh.apply(stale)); XCTAssertTrue(fresh.snapshot.expenses.isEmpty)
    }

}
