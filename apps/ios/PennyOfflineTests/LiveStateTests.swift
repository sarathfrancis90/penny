import CryptoKit
import Foundation
import Synchronization
import UIKit
import XCTest
@testable import PennyOffline

@MainActor final class LiveStateTests: XCTestCase {
    private let key = SymmetricKey(data: Data(repeating: 0x0b, count: 32))
    private enum Injected: Error { case hydration, publication }
    private func file(_ name: String) throws -> Data { try Data(contentsOf: XCTUnwrap(Bundle(for: Self.self).resourceURL).appendingPathComponent("fixtures/" + name)) }
    private func fixture() throws -> VaultSnapshot { try StrictJSON.snapshot(file("v4-native-writer-v1/android-finance.snapshot.json")) }
    private func edit() throws -> Expense {
        let shape = try XCTUnwrap(JSONSerialization.jsonObject(with: file("live-state-v1/metadata-edit.json")) as? [String: Any])
        return try JSONDecoder().decode(Expense.self, from: JSONSerialization.data(withJSONObject: XCTUnwrap(shape["expenseAfter"])))
    }
    private func directory() -> URL {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        addTeardownBlock { try? FileManager.default.removeItem(at: url) }; return url
    }
    private func encode(_ value: VaultSnapshot) throws -> Data {
        let encoder = JSONEncoder(); encoder.outputFormatting = [.sortedKeys, .withoutEscapingSlashes]; return try encoder.encode(value)
    }
    private func pointer(_ dir: URL) throws -> Data { try Data(contentsOf: dir.appendingPathComponent("PennyOffline/vault-v1.pennyvault")) }
    private func ciphertext(_ dir: URL, _ refs: [LocalReceiptDescriptor]) throws -> [String: String] {
        try Dictionary(uniqueKeysWithValues: refs.map { ref in
            (ref.id, DurableVaultStorage.digest(try Data(contentsOf: dir.appendingPathComponent("PennyOffline/" + ref.generationId + "/" + ref.id + ".pennyreceipt"))))
        })
    }
    func testSharedLiveOpenEditAndExactCompatibilityRoundtrip() async throws {
        let dir = directory(), expected = try fixture(), initial = VaultStore(directory: dir, key: key)
        let archive = try XCTUnwrap(Bundle(for: Self.self).resourceURL).appendingPathComponent("fixtures/v4-native-writer-v1/android-finance.pennybackup")
        let candidate = try await initial.prepareFilesRestore(archive, recoveryKey: "pny1-" + String(repeating: "07", count: 32))
        try await candidate.replace(in: initial)
        let armed = Mutex(true), store = VaultStore(directory: dir, key: key, hydrationCheckpoint: { if armed.withLock({ $0 }) { throw Injected.hydration } })
        XCTAssertTrue(store.isReady); XCTAssertTrue(store.liveBody.attachments.isEmpty)
        var body = expected; body.attachments = []
        XCTAssertEqual(try encode(store.liveBody), try encode(body))
        XCTAssertEqual(store.expenses.count, expected.expenses.count)
        let refs = store.receiptDescriptors, before = try ciphertext(dir, refs)
        XCTAssertEqual(refs.count, expected.attachments.count)
        XCTAssertThrowsError(try store.compatibilitySnapshot())
        let image = try await store.openReceipt(refs[0].id)
        XCTAssertEqual(image.bytes, try expected.attachments[0].bytes()); try image.close(); XCTAssertNil(image.bytes)
        let changed = try edit(), original = try XCTUnwrap(expected.expenses.first { $0.id == changed.id })
        try await store.saveAsync(changed, expectedOriginal: original)
        XCTAssertTrue(store.isReady); XCTAssertEqual(store.receiptDescriptors, refs)
        XCTAssertEqual(try ciphertext(dir, refs), before)
        XCTAssertEqual(store.expenses.reduce(0) { $0 + $1.amountMinor }, 15_250)
        XCTAssertEqual(store.expenses.filter { $0.expenseDate.hasPrefix("2026-01") }.reduce(0) { $0 + $1.amountMinor }, 6_250)
        var edited = expected; edited.expenses[try XCTUnwrap(edited.expenses.firstIndex { $0.id == changed.id })] = changed
        let reopened = VaultStore(directory: dir, key: key, hydrationCheckpoint: { throw Injected.hydration })
        XCTAssertTrue(reopened.isReady); body = edited; body.attachments = []
        XCTAssertEqual(try encode(reopened.liveBody), try encode(body)); XCTAssertEqual(reopened.receiptDescriptors, refs)
        armed.withLock { $0 = false }
        XCTAssertEqual(try encode(store.compatibilitySnapshot()), try encode(edited))
        // Explicit legacy export/restore and finance mutation must retain receipts.
        let recovery = BackupArchive.newRecoveryKey()
        let legacy = try BackupArchive.export(store.compatibilitySnapshot(), recoveryKey: recovery)
        let exported = try BackupArchive.restore(legacy, recoveryKey: recovery)
        XCTAssertNotEqual(exported.snapshotId, edited.snapshotId); XCTAssertNotEqual(exported.createdAt, edited.createdAt)
        XCTAssertTrue(CivilDate.validTimestamp(exported.createdAt))
        var legacyExpected = edited; legacyExpected.snapshotId = exported.snapshotId; legacyExpected.createdAt = exported.createdAt
        XCTAssertEqual(try encode(exported), try encode(legacyExpected))
        try store.save(edited.budgets[0])
        XCTAssertEqual(try encode(store.compatibilitySnapshot()), try encode(edited))
        XCTAssertEqual(try ciphertext(dir, refs), before)
    }
    func testStaleFormSecondInstanceKeyLossAndCorruptReceiptFailClosed() async throws {
        let dir = directory(), expected = try fixture(), store = VaultStore(directory: dir, key: key)
        try store.replace(expected)
        let stale = VaultStore(directory: dir, key: key), original = expected.expenses[0]
        var newer = original; newer.note = "Externally refreshed field"; try await store.saveAsync(newer)
        let bytes = try pointer(dir)
        do { try await stale.saveAsync(original); XCTFail("stale source") } catch {}
        XCTAssertEqual(try pointer(dir), bytes)
        stale.load(); XCTAssertTrue(stale.isReady)
        do { try await stale.saveAsync(original, expectedOriginal: original); XCTFail("stale form") } catch {}
        XCTAssertTrue(stale.isReady); XCTAssertEqual(try pointer(dir), bytes)
        let available = Mutex(true), knownKey = key
        let changing = VaultStore(directory: dir, deviceKeyReader: { create in
            XCTAssertFalse(create); guard available.withLock({ $0 }) else { throw ExpenseError.missingKey }; return knownKey
        })
        available.withLock { $0 = false }
        do { _ = try await changing.openReceipt(changing.receiptDescriptors[0].id); XCTFail("missing key") } catch {}
        XCTAssertFalse(changing.isReady); XCTAssertThrowsError(try changing.compatibilitySnapshot()); XCTAssertEqual(try pointer(dir), bytes)
        let receipt = try XCTUnwrap(store.receiptDescriptors.first)
        let path = dir.appendingPathComponent("PennyOffline/" + receipt.generationId + "/" + receipt.id + ".pennyreceipt")
        var wire = try Data(contentsOf: path); wire[wire.count - 1] ^= 1; try wire.write(to: path)
        let broken = VaultStore(directory: dir, key: key, hydrationCheckpoint: { throw Injected.hydration })
        XCTAssertFalse(broken.isReady); XCTAssertThrowsError(try broken.compatibilitySnapshot()); XCTAssertEqual(try pointer(dir), bytes)
    }
    func testCancelledAndFailedMetadataPublicationPreservePredecessor() async throws {
        for mode in 0..<3 {
            let dir = directory(), expected = try fixture(); try VaultStore(directory: dir, key: key).replace(expected)
            let before = try pointer(dir), store = VaultStore(directory: dir, key: key, commitCheckpoint: { stage in
                if mode == 1 && stage == .staged { throw Injected.publication }
                if mode == 2 && stage == .committed { withUnsafeCurrentTask { $0?.cancel() } }
            }, hydrationCheckpoint: { throw Injected.hydration })
            let changed = try edit(), operation = Task { try await store.saveAsync(changed) }
            if mode == 0 { operation.cancel() }
            do { try await operation.value; XCTFail("failure accepted") } catch {}
            XCTAssertEqual(try pointer(dir), before)
            let reopened = VaultStore(directory: dir, key: key)
            XCTAssertTrue(reopened.isReady); XCTAssertEqual(try encode(reopened.compatibilitySnapshot()), try encode(expected))
        }
    }
    func testOwnedReceiptPinSurvivesRemovalAndGarbageCollection() async throws {
        let dir = directory(), expected = try fixture(), store = VaultStore(directory: dir, key: key); try store.replace(expected)
        let ref = try XCTUnwrap(store.receiptDescriptors.first), image = try await store.openReceipt(ref.id)
        let group = dir.appendingPathComponent("PennyOffline/" + ref.generationId)
        try await store.saveAsync(expected.expenses[0], attachments: [])
        try await store.saveAsync(expected.expenses[0])
        XCTAssertEqual(try store.collectReceiptGarbage(), 0); XCTAssertTrue(FileManager.default.fileExists(atPath: group.path))
        XCTAssertEqual(image.bytes, try expected.attachments[0].bytes()); try image.close(); try image.close(); XCTAssertNil(image.bytes)
        XCTAssertEqual(try store.collectReceiptGarbage(), 1); XCTAssertFalse(FileManager.default.fileExists(atPath: group.path))
        let restored = VaultStore(directory: dir, key: key); try restored.replace(expected)
        let cancelled = Task { try await restored.openReceipt(ref.id) }; cancelled.cancel()
        do { let result = try await cancelled.value; try result.close(); XCTFail("cancelled view") } catch {}
    }
    func testInvalidAndFullCapacityMetadataEditsKeepVaultUsable() async throws {
        let dir = directory(), store = VaultStore(directory: dir, key: key)
        var snapshot = VaultSnapshot(), first = try Expense(merchant: "Capacity", amountMinor: 1, expenseDate: "2026-01-01", category: Categories.other)
        snapshot.expenses = (0..<10_000).map { index in var expense = first; expense.id = String(format: "00000000-0000-4000-8000-%012d", index); return expense }
        try store.replace(snapshot); let before = try pointer(dir), revision = store.revision
        first.merchant = ""
        do { try await store.saveAsync(first); XCTFail("invalid expense") } catch {}
        first.merchant = "One too many"
        do { try await store.saveAsync(first); XCTFail("capacity") } catch {}
        XCTAssertTrue(store.isReady); XCTAssertEqual(store.revision, revision); XCTAssertEqual(try pointer(dir), before)
        XCTAssertEqual(try store.compatibilitySnapshot().expenses.count, 10_000)
        try await store.deleteAsync(snapshot.expenses.last!.id); XCTAssertTrue(store.isReady)
        XCTAssertEqual(store.expenses.count, 9_999)
    }
    private func resourceInput() throws -> URL {
        let dir = directory()
        try autoreleasepool {
            var snapshot = try fixture()
            let image = UIGraphicsImageRenderer(size: CGSize(width: 4, height: 4)).image { context in
                UIColor.white.setFill(); context.fill(CGRect(x: 0, y: 0, width: 4, height: 4))
            }
            var bytes = try XCTUnwrap(image.jpegData(compressionQuality: 0.8)); bytes.removeLast(2)
            while ReceiptAttachment.maximumBytes - bytes.count - 2 >= 4 {
                let payload = min(65_533, ReceiptAttachment.maximumBytes - bytes.count - 6), length = payload + 2
                bytes.append(contentsOf: [0xff, 0xfe, UInt8(length >> 8), UInt8(length & 255)]); bytes.append(Data(repeating: 65, count: payload))
            }
            bytes.append(contentsOf: [0xff, 0xd9])
            snapshot.attachments = try (0..<3).map { index in
                let receipt = try ReceiptAttachment(data: bytes, expenseId: snapshot.expenses[0].id)
                var object = try XCTUnwrap(JSONSerialization.jsonObject(with: JSONEncoder().encode(receipt)) as? [String: Any])
                object["id"] = String(format: "40000000-0000-4000-8000-%012d", index)
                return try JSONDecoder().decode(ReceiptAttachment.self, from: JSONSerialization.data(withJSONObject: object))
            }
            let attachment = XCTAttachment(string: "receiptBytes=\(bytes.count * 3); snapshotSHA256=\(DurableVaultStorage.digest(try encode(snapshot)))")
            attachment.name = "Live state resource workload"; attachment.lifetime = .keepAlways; add(attachment)
            try VaultStore(directory: dir, key: key).replace(snapshot)
        }
        return dir
    }
    func testResourceCompatibilityRead() throws { try resourceMeasure(hydrated: true) }
    func testResourceLiveRead() throws { try resourceMeasure(hydrated: false) }
    private func resourceMeasure(hydrated: Bool) throws {
        let dir = try resourceInput(), storage = try DurableVaultStorage(dir.appendingPathComponent("PennyOffline"))
        let options = XCTMeasureOptions(); options.iterationCount = 3
        measure(metrics: [XCTClockMetric(), XCTMemoryMetric()], options: options) {
            do { try autoreleasepool { try storage.leased {
                if hydrated { XCTAssertEqual(try storage.load(key: key)?.snapshot.attachments.count, 3) }
                else {
                    let loaded = try storage.loadLive(key: key, initial: LocalVaultMetadata(writerId: UUID().uuidString.lowercased(), revision: 0, restoreEpoch: UUID().uuidString.lowercased()), storeId: UUID().uuidString.lowercased())
                    XCTAssertEqual(loaded?.receipts.count, 3); XCTAssertTrue(loaded?.body.attachments.isEmpty == true)
                }
            } } } catch { XCTFail("\(error)") }
        }
    }
}
