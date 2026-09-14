import CryptoKit
import Foundation
import Synchronization
import UIKit
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
        try equal((try store.compatibilitySnapshot()), previous)
        let migratedBytes = try Data(contentsOf: old)
        XCTAssertNotEqual(migratedBytes, legacyBytes)
        let prepared = try await store.prepareWrite(replacement, restoring: true)
        XCTAssertEqual(try Data(contentsOf: old), migratedBytes)
        let cancelled = Task { try await store.replaceAsync(replacement) }; cancelled.cancel()
        do { try await cancelled.value; XCTFail("Cancelled preparation") } catch {}
        XCTAssertEqual(try Data(contentsOf: old), migratedBytes)
        try store.replace(previous)
        XCTAssertNotEqual(try Data(contentsOf: old), legacyBytes)
        try equal((try VaultStore(directory: dir, key: key).compatibilitySnapshot()), previous)
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
        try equal((try VaultStore(directory: dir, key: key).compatibilitySnapshot()), previous)
        let original = try Data(contentsOf: dir.appendingPathComponent("PennyOffline/vault-v1.pennyvault"))
        let wrongKey = VaultStore(directory: dir, key: SymmetricKey(size: .bits256)); XCTAssertFalse(wrongKey.isReady)
        XCTAssertEqual(try Data(contentsOf: dir.appendingPathComponent("PennyOffline/vault-v1.pennyvault")), original)
        try FileManager.default.removeItem(at: dir.appendingPathComponent("PennyOffline/vault-v1.pennyvault"))
        let missing = VaultStore(directory: dir, key: key); XCTAssertFalse(missing.isReady)
        XCTAssertThrowsError(try missing.save(previous.expenses[0]))
        // Explicit verified recovery is permitted even when the live marker is gone.
        try missing.restore(replacement)
        try equal((try VaultStore(directory: dir, key: key).compatibilitySnapshot()), replacement)
    }
    func testSharedPendingRecoveryAndEstablishedCorruption() throws {
        for stage in [VaultStore.CommitStage.staged, .committed, .verified, .journalCleared] {
            let dir = try directory(), previous = try input("previous"), replacement = try input("replacement")
            try VaultStore(directory: dir, key: key).replace(previous)
            let interrupted = VaultStore(directory: dir, key: key, commitCheckpoint: { if $0 == stage { throw DurableCrash.interrupted } })
            XCTAssertThrowsError(try interrupted.restore(replacement))
            let reopened = VaultStore(directory: dir, key: key)
            XCTAssertTrue(reopened.isReady); try equal((try reopened.compatibilitySnapshot()), stage == .staged ? previous : replacement)
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
        XCTAssertEqual(try Data(contentsOf: unknown), Data([7])); try equal((try VaultStore(directory: dir, key: key).compatibilitySnapshot()), replacement)
    }
    func testCancelledPublishedTaskRollsBackAndVerifiedRestoreRepairsReceipt() async throws {
        for stage in [VaultStore.CommitStage.committed, .verified] {
            let dir = try directory(), previous = try input("previous"), replacement = try input("replacement")
            try VaultStore(directory: dir, key: key).replace(previous)
            let store = VaultStore(directory: dir, key: key, commitCheckpoint: { if $0 == stage { withUnsafeCurrentTask { $0?.cancel() } } })
            let operation = Task { try await store.restoreAsync(replacement) }
            do { try await operation.value; XCTFail("Cancelled published task") } catch is CancellationError {} catch { XCTFail("Expected cancellation, got \(error)") }
            XCTAssertThrowsError(try store.compatibilitySnapshot()); XCTAssertEqual(store.liveBody.expenses, previous.expenses); try equal((try VaultStore(directory: dir, key: key).compatibilitySnapshot()), previous)
        }
        let dir = try directory(), previous = try input("previous")
        let store = VaultStore(directory: dir, key: key); try store.replace(previous)
        let group = try XCTUnwrap(files(dir).first { UUID(uuidString: $0) != nil })
        let receipt = dir.appendingPathComponent("PennyOffline").appendingPathComponent(group).appendingPathComponent(previous.attachments[0].id + ".pennyreceipt")
        var bytes = try Data(contentsOf: receipt); bytes[bytes.count - 1] ^= 1; try bytes.write(to: receipt)
        XCTAssertFalse(VaultStore(directory: dir, key: key).isReady)
        try await store.restoreAsync(previous)
        try equal((try VaultStore(directory: dir, key: key).compatibilitySnapshot()), previous)
    }

    func testCorruptUnchangedReceiptFailsBeforeStagingAndPreservesPointer() async throws {
        let dir = try directory(), previous = try input("previous")
        try VaultStore(directory: dir, key: key).replace(previous)
        let writing = VaultStore(directory: dir, key: key, commitCheckpoint: { stage in
            if stage == .staged {
                XCTFail("Corrupt unchanged receipt reached staged")
                throw LocalReceiptBlobError.bytes
            }
        })
        XCTAssertTrue(writing.isReady)
        let live = dir.appendingPathComponent("PennyOffline/vault-v1.pennyvault")
        let pointer = try Data(contentsOf: live)
        let group = try XCTUnwrap(files(dir).first { UUID(uuidString: $0) != nil })
        let receipt = dir.appendingPathComponent("PennyOffline").appendingPathComponent(group)
            .appendingPathComponent(previous.attachments[0].id + ".pennyreceipt")
        var bytes = try Data(contentsOf: receipt); bytes[bytes.count - 1] ^= 1; try bytes.write(to: receipt)
        var edit = previous.expenses[0]; edit.merchant = "Unchanged receipt edit"
        do { try await writing.saveAsync(edit); XCTFail("Corrupt reused receipt accepted") } catch {}
        XCTAssertEqual(try Data(contentsOf: live), pointer)
        XCTAssertThrowsError(try writing.compatibilitySnapshot())
        XCTAssertEqual(writing.liveBody.expenses, previous.expenses)
        // The externally damaged predecessor remains locked; no replacement was published.
        XCTAssertFalse(VaultStore(directory: dir, key: key).isReady)
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
        try missing.restore(replacement); try equal((try VaultStore(directory: dir, key: key).compatibilitySnapshot()), replacement)
        let recreated = try directory(), initial = VaultStore(directory: recreated, key: key)
        let stale = try await initial.prepareWrite(previous)
        try FileManager.default.removeItem(at: recreated)
        let fresh = VaultStore(directory: recreated, key: key)
        XCTAssertEqual(fresh.revision, stale.sourceRevision)
        XCTAssertThrowsError(try fresh.apply(stale)); XCTAssertTrue((try fresh.compatibilitySnapshot()).expenses.isEmpty)
    }

    private func metadataStorage(_ directory: URL) throws -> DurableVaultStorage {
        try DurableVaultStorage(directory.appendingPathComponent("PennyOffline"), hydrationCheckpoint: { throw LocalReceiptBlobError.closed })
    }
    private func assertSummary(_ summary: DurableVerifiedMetadata, _ snapshot: VaultSnapshot) throws {
        let encoder = JSONEncoder(); encoder.outputFormatting = [.withoutEscapingSlashes]
        XCTAssertEqual(summary.vaultId, snapshot.vaultId); XCTAssertEqual(summary.snapshotId, snapshot.snapshotId)
        XCTAssertEqual(summary.createdAt, snapshot.createdAt)
        XCTAssertEqual(summary.counts, ["expenses": snapshot.expenses.count, "attachments": snapshot.attachments.count,
            "budgets": snapshot.budgets.count, "incomeSources": snapshot.incomeSources.count,
            "incomeEntries": snapshot.incomeEntries.count, "savingsGoals": snapshot.savingsGoals.count,
            "savingsEntries": snapshot.savingsEntries.count, "recurringExpenses": snapshot.recurringExpenses.count])
        XCTAssertEqual(summary.expenseTotalMinor, try FinanceValidation.total(snapshot.expenses.map(\.amountMinor)))
        XCTAssertEqual(summary.receiptBytes, snapshot.attachments.reduce(0) { $0 + $1.byteCount })
        XCTAssertEqual(summary.snapshotBytes, try encoder.encode(snapshot).count)
        XCTAssertEqual(summary.digest.count, 64)
    }
    private func largeReceipt(owner: String) throws -> ReceiptAttachment {
        let image = UIGraphicsImageRenderer(size: CGSize(width: 4, height: 4)).image { context in
            UIColor.white.setFill(); context.fill(CGRect(x: 0, y: 0, width: 4, height: 4))
        }
        var bytes = try XCTUnwrap(image.jpegData(compressionQuality: 0.8)); bytes.removeLast(2)
        // Valid JPEG COM segments exercise near-capacity bytes without a large pixel allocation.
        while ReceiptAttachment.maximumBytes - bytes.count - 2 >= 4 {
            let payload = min(65_533, ReceiptAttachment.maximumBytes - bytes.count - 6), length = payload + 2
            bytes.append(contentsOf: [0xff, 0xfe, UInt8(length >> 8), UInt8(length & 255)])
            bytes.append(Data(repeating: 65, count: payload))
        }
        bytes.append(contentsOf: [0xff, 0xd9])
        return try ReceiptAttachment(data: bytes, expenseId: owner)
    }
    func testVerifiedMetadataSizeParityAndSingleFinalHydration() throws {
        var escaped = try input("previous")
        escaped.expenses[0].merchant = "Café/東京 \"quote\" \\ path"
        escaped.expenses[0].note = "Line\nTab\t/slash/🎯"
        var large = try input("previous")
        large.attachments = [try largeReceipt(owner: large.expenses[0].id), large.attachments[0]]
        for snapshot in [VaultSnapshot(), try input("previous"), try input("replacement"), escaped, large] {
            let dir = try directory(), events = Mutex<[String]>([])
            let storage = try DurableVaultStorage(dir.appendingPathComponent("PennyOffline"), hydrationCheckpoint: { events.withLock { $0.append("hydrate") } })
            let prepared = try PreparedVaultWrite.prepare(snapshot, key: key, revision: 0, writerId: UUID().uuidString.lowercased(), restoreEpoch: UUID().uuidString.lowercased(), restoring: true)
            let loaded = try storage.leased {
                try storage.commit(prepared, sourceDigest: nil, storeId: prepared.sourceStoreId, receipts: [], checkpoint: { stage in
                    if stage == .verified { events.withLock { $0.append("verified") } }
                    if stage == .journalCleared { events.withLock { $0.append("journalCleared") } }
                })
            }
            XCTAssertEqual(events.withLock { $0 }, ["verified", "hydrate", "journalCleared"])
            try equal(loaded.snapshot, snapshot)
            let validation = try metadataStorage(dir), summary = try validation.verifiedMetadata(key: key)
            try assertSummary(summary, snapshot); XCTAssertEqual(summary.snapshotBytes, loaded.snapshotBytes)
            let root = dir.appendingPathComponent("PennyOffline")
            let record = try XCTUnwrap(FileManager.default.contentsOfDirectory(atPath: root.path).first { $0.hasSuffix(".pennygen") })
            XCTAssertEqual(summary.digest, DurableVaultStorage.digest(try Data(contentsOf: root.appendingPathComponent(record))))
            XCTAssertThrowsError(try validation.leased { try validation.load(key: key) })
            XCTAssertThrowsError(try validation.verifiedMetadata(key: SymmetricKey(size: .bits256)))
        }
    }
    func testMetadataPendingRecoveryAndGarbageCollectionDoNotHydrate() throws {
        for invalidCurrent in [false, true] {
            let dir = try directory(), previous = try input("previous"), replacement = try input("replacement")
            try VaultStore(directory: dir, key: key).replace(previous)
            let groups = try files(dir)
            let interrupted = VaultStore(directory: dir, key: key, commitCheckpoint: { if $0 == .committed { throw DurableCrash.interrupted } })
            XCTAssertThrowsError(try interrupted.restore(replacement))
            if invalidCurrent {
                let group = try XCTUnwrap(files(dir).first { UUID(uuidString: $0) != nil && !groups.contains($0) })
                let file = dir.appendingPathComponent("PennyOffline/" + group + "/" + replacement.attachments[0].id + ".pennyreceipt")
                var bytes = try Data(contentsOf: file); bytes[bytes.count - 1] ^= 1; try bytes.write(to: file)
            }
            let storage = try metadataStorage(dir)
            try assertSummary(storage.verifiedMetadata(key: key), invalidCurrent ? previous : replacement)
            XCTAssertNoThrow(try storage.leased { try storage.collectGarbage(key: key) })
            try equal((try VaultStore(directory: dir, key: key).compatibilitySnapshot()), invalidCurrent ? previous : replacement)
        }
    }
    /// Re-authenticate deliberately invalid local metadata using a public test key.
    /// This bypasses writers so rejection must come from reader semantics, not AEAD alone.
    private func rewriteRecord(_ dir: URL, mutation: (inout [String: Any], URL) throws -> Void) throws {
        let root = dir.appendingPathComponent("PennyOffline"), live = root.appendingPathComponent("vault-v1.pennyvault")
        let pointerMagic = Data("PENNY-DURABLE:POINTER:1\n".utf8), recordMagic = Data("PENNY-DURABLE:RECORD:1\n".utf8)
        func open(_ bytes: Data, _ aad: String) throws -> Data { try AES.GCM.open(AES.GCM.SealedBox(combined: bytes), using: key, authenticating: Data(aad.utf8)) }
        func seal(_ bytes: Data, _ aad: String) throws -> Data { try XCTUnwrap(AES.GCM.seal(bytes, using: key, authenticating: Data(aad.utf8)).combined) }
        var pointer = try XCTUnwrap(JSONSerialization.jsonObject(with: open(Data(contentsOf: live).dropFirst(pointerMagic.count), "PENNY-LOCAL-POINTER:1")) as? [String: Any])
        var current = try XCTUnwrap(pointer["current"] as? [String: Any])
        let id = try XCTUnwrap(current["id"] as? String), storeId = try XCTUnwrap(pointer["storeId"] as? String)
        let file = root.appendingPathComponent(id + ".pennygen"), aad = "PENNY-LOCAL-GENERATION:1\0" + storeId + "\0" + id
        var record = try XCTUnwrap(JSONSerialization.jsonObject(with: open(Data(contentsOf: file).dropFirst(recordMagic.count), aad)) as? [String: Any])
        try mutation(&record, root)
        let wire = try recordMagic + seal(JSONSerialization.data(withJSONObject: record), aad)
        try wire.write(to: file); current["sha256"] = DurableVaultStorage.digest(wire); pointer["current"] = current
        try (pointerMagic + seal(JSONSerialization.data(withJSONObject: pointer), "PENNY-LOCAL-POINTER:1")).write(to: live)
    }
    func testAuthenticatedInvalidMetadataFailsBothValidationAndFacade() throws {
        for variant in ["orphanReceipt", "missingIncomeSource", "duplicateBudget", "unknownDescriptorField"] {
            let dir = try directory(); try VaultStore(directory: dir, key: key).replace(input("previous"))
            try rewriteRecord(dir) { record, _ in
                if variant == "orphanReceipt" || variant == "unknownDescriptorField" {
                    var receipts = try XCTUnwrap(record["receipts"] as? [[String: Any]])
                    receipts[0][variant == "orphanReceipt" ? "expenseId" : "unknown"] = UUID().uuidString.lowercased()
                    record["receipts"] = receipts
                } else {
                    let encoded = try XCTUnwrap(record["body"] as? String)
                    var body = try XCTUnwrap(JSONSerialization.jsonObject(with: XCTUnwrap(Data(base64Encoded: encoded))) as? [String: Any])
                    if variant == "missingIncomeSource" { body["incomeSources"] = [] as [Any] }
                    else {
                        var budgets = try XCTUnwrap(body["budgets"] as? [[String: Any]])
                        var duplicate = budgets[0]; duplicate["id"] = UUID().uuidString.lowercased(); budgets.append(duplicate); body["budgets"] = budgets
                    }
                    let wire = try JSONSerialization.data(withJSONObject: body)
                    XCTAssertThrowsError(try StrictJSON.snapshot(wire)); record["body"] = wire.base64EncodedString()
                }
            }
            let live = dir.appendingPathComponent("PennyOffline/vault-v1.pennyvault"), before = try Data(contentsOf: live)
            XCTAssertThrowsError(try metadataStorage(dir).verifiedMetadata(key: key), variant)
            XCTAssertFalse(VaultStore(directory: dir, key: key).isReady, variant)
            XCTAssertEqual(try Data(contentsOf: live), before)
        }
    }
    func testAuthenticatedReceiptStillRequiresFullNativeDecode() throws {
        let dir = try directory(); try VaultStore(directory: dir, key: key).replace(input("previous"))
        let corpus = try XCTUnwrap(Bundle(for: Self.self).resourceURL).appendingPathComponent("fixtures/png-integrity-corpus.json")
        let object = try XCTUnwrap(JSONSerialization.jsonObject(with: Data(contentsOf: corpus)) as? [String: Any])
        let cases = try XCTUnwrap(object["cases"] as? [[String: Any]])
        let bad = try XCTUnwrap(cases.first { $0["id"] as? String == "rgba9-plain-invalid_filter" })
        let bytes = try XCTUnwrap(Data(base64Encoded: XCTUnwrap(bad["dataBase64"] as? String)))
        XCTAssertThrowsError(try ReceiptAttachment(data: bytes, expenseId: input("previous").expenses[0].id))
        try rewriteRecord(dir) { record, root in
            var receipts = try XCTUnwrap(record["receipts"] as? [[String: Any]])
            receipts[0]["byteCount"] = bytes.count; receipts[0]["sha256"] = DurableVaultStorage.digest(bytes)
            let descriptor = try JSONDecoder().decode(LocalReceiptDescriptor.self, from: JSONSerialization.data(withJSONObject: receipts[0]))
            let sealed = try XCTUnwrap(AES.GCM.seal(bytes, using: LocalReceiptBlob.derivedKey(root: key, descriptor: descriptor), authenticating: LocalReceiptBlob.aad(descriptor)).combined)
            try (LocalReceiptBlob.magic + sealed).write(to: root.appendingPathComponent(descriptor.generationId + "/" + descriptor.id + ".pennyreceipt"))
            record["receipts"] = receipts
        }
        let live = dir.appendingPathComponent("PennyOffline/vault-v1.pennyvault"), before = try Data(contentsOf: live)
        XCTAssertThrowsError(try metadataStorage(dir).verifiedMetadata(key: key))
        XCTAssertFalse(VaultStore(directory: dir, key: key).isReady)
        XCTAssertEqual(try Data(contentsOf: live), before)
    }
}
