import CryptoKit
import XCTest
@testable import PennyOffline

@MainActor final class ArchiveWorkerTests: XCTestCase {
    func testWorkerArchiveRoundtripCancellationAndExclusiveDestination() async throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: directory) }
        let worker = ArchiveWorker(), key = BackupArchive.newRecoveryKey()
        let snapshot = VaultSnapshot(), stage = directory.appendingPathComponent("staging"), destination = directory.appendingPathComponent("destination")
        try FileManager.default.createDirectory(at: destination, withIntermediateDirectories: true)
        let archive = try await worker.prepare(snapshot, key: key, directory: stage)
        XCTAssertEqual(archive.snapshot.vaultId, snapshot.vaultId)
        try await worker.export(archive, to: destination)
        let output = destination.appendingPathComponent(archive.url.lastPathComponent)
        XCTAssertEqual(try Data(contentsOf: output), archive.bytes)
        let restored = try await worker.read(output, key: key)
        XCTAssertEqual(restored.vaultId, snapshot.vaultId)
        do { try await worker.export(archive, to: destination); XCTFail("Existing backup must never be overwritten") } catch {}
        XCTAssertEqual(try Data(contentsOf: output), archive.bytes)
        await worker.cancel(archive)
        XCTAssertFalse(FileManager.default.fileExists(atPath: archive.url.path))
        do { try await worker.export(archive, to: destination); XCTFail("Cancelled handle must remain invalid") } catch {}
        let cancelled = Task { try await worker.prepare(snapshot, key: key, directory: stage) }
        cancelled.cancel()
        do { _ = try await cancelled.value; XCTFail("Cancelled preparation must not escape as a valid handle") } catch is CancellationError {} catch { XCTFail("\(error)") }
        XCTAssertTrue(try FileManager.default.contentsOfDirectory(atPath: stage.path).isEmpty)
        XCTAssertEqual(try Data(contentsOf: output), archive.bytes)
        do { _ = try await worker.decode(archive.bytes, key: BackupArchive.newRecoveryKey()); XCTFail("Wrong key") } catch {}
    }
    func testAsyncPreparedWritesRejectStaleCancelledAndRestoreEpochChanges() async throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: directory) }
        let key = SymmetricKey(size: .bits256), vault = VaultStore(directory: directory, key: key)
        var snapshot = VaultSnapshot()
        snapshot.expenses = [try Expense(merchant: "Worker kept", amountMinor: 250, expenseDate: "2026-01-01", category: Categories.other)]
        try await vault.replaceAsync(snapshot)
        let first = try await vault.prepareWrite(snapshot), second = try await vault.prepareWrite(snapshot)
        try vault.apply(first)
        XCTAssertThrowsError(try vault.apply(second))
        let before = vault.revision
        let cancelled = Task { try await vault.replaceAsync(snapshot) }; cancelled.cancel()
        do { try await cancelled.value; XCTFail("Cancelled mutation must not commit") } catch {}
        XCTAssertEqual(vault.revision, before)
        let staleRestore = try await vault.prepareWrite(snapshot, restoring: true)
        try await vault.restoreAsync(snapshot)
        XCTAssertThrowsError(try vault.apply(staleRestore))
        XCTAssertEqual((try VaultStore(directory: directory, key: key).compatibilitySnapshot()).expenses, snapshot.expenses)
        let failing = VaultStore(directory: directory, key: key, commitCheckpoint: { stage in if stage == .committed { throw VerifiedBackupExport.Failure.verification } })
        var changed = snapshot; changed.expenses[0].merchant = "Must roll back"
        do { try await failing.replaceAsync(changed); XCTFail("Injected write failure") } catch {}
        XCTAssertEqual((try VaultStore(directory: directory, key: key).compatibilitySnapshot()).expenses, snapshot.expenses)
        var recurring = RecurringExpense(); recurring.merchant = "Once"; recurring.amountMinor = 100
        recurring.schedule.startDate = "2026-01-01"
        try await vault.saveAsync(recurring)
        try await vault.postRecurringAsync(recurring.id, occurrence: "2026-01-01", asOf: "2026-01-01")
        try await vault.postRecurringAsync(recurring.id, occurrence: "2026-01-01", asOf: "2026-01-01")
        XCTAssertEqual((try vault.compatibilitySnapshot()).expenses.filter { $0.recurringTemplateId == recurring.id }.count, 1)
    }
    func testCancelledRestoreCompletionCannotClearNewArchiveAction() {
        var state = VaultActionState()
        let restore = state.begin(); state.cancel()
        let export = state.begin()
        XCTAssertFalse(state.finish(restore)); XCTAssertTrue(state.working); XCTAssertEqual(state.id, export)
        XCTAssertFalse(state.resume(restore)); XCTAssertTrue(state.working)
        XCTAssertTrue(state.finish(export)); XCTAssertFalse(state.working)
        XCTAssertTrue(state.resume(export)); state.cancel()
        XCTAssertFalse(state.finish(export)); XCTAssertNil(state.id)
    }
    func testSpecificRecordCapacityErrorPreservesSavedGeneration() throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: directory) }
        let key = SymmetricKey(size: .bits256), vault = VaultStore(directory: directory, key: key)
        let item = try Expense(merchant: "Kept", amountMinor: 100, expenseDate: "2026-01-01", category: Categories.other)
        try vault.save(item)
        let revision = vault.revision, bytes = vault.snapshotBytes
        var tooMany = (try vault.compatibilitySnapshot()); tooMany.expenses = Array(repeating: item, count: 10_001)
        XCTAssertThrowsError(try vault.replace(tooMany)) { error in
            guard case ExpenseError.recordCapacity("expenses", 10_000) = error else { return XCTFail("Expected specific expense capacity error") }
        }
        let reopened = VaultStore(directory: directory, key: key)
        XCTAssertEqual((try reopened.compatibilitySnapshot()).expenses, [item]); XCTAssertEqual(reopened.revision, revision)
        XCTAssertEqual(reopened.snapshotBytes, bytes)
    }
}
