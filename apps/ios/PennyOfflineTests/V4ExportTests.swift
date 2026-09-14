import CryptoKit
import Synchronization
import XCTest
@testable import PennyOffline
import PennyV4

@MainActor final class V4ExportTests: XCTestCase {
    private let key = SymmetricKey(data: Data(repeating: 0x0b, count: 32))
    private let recovery = "pny1-" + String(repeating: "07", count: 32)
    private func directory() -> URL { let url = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString); addTeardownBlock { try? FileManager.default.removeItem(at: url) }; return url }
    private func snapshot() throws -> VaultSnapshot {
        let url = try XCTUnwrap(Bundle(for: Self.self).resourceURL).appendingPathComponent("fixtures/local-generation-v1/replacement.json")
        return try StrictJSON.snapshot(Data(contentsOf: url))
    }
    private func encode(_ snapshot: VaultSnapshot) throws -> Data { let encoder = JSONEncoder(); encoder.outputFormatting = [.sortedKeys, .withoutEscapingSlashes]; return try encoder.encode(snapshot) }
    private func bytes(_ export: V4VerifiedExport) async throws -> Data {
        let input = try await export.ownedInput().take(); var data = Data()
        while true { let part = try input.read(maximum: 65_536); if part.isEmpty { break }; data.append(part) }
        try input.close(); return data
    }
    private func stagedNames() throws -> [String] { try FileManager.default.contentsOfDirectory(atPath: FileManager.default.temporaryDirectory.path).filter { $0.hasSuffix(".pennyv4export") }.sorted() }
    func testFinanceReceiptEscapingExportReadbackInstallAndArtifact() async throws {
        let store = VaultStore(directory: directory(), key: key)
        var expected = try snapshot(); expected.expenses[0].note = "Quoted \"note\", café ☕ / slash\\ and\nnewline"
        try store.replace(expected)
        let export = try await store.prepareV4Export(recoveryKey: recovery), data = try await bytes(export)
        let summary = await export.summary
        XCTAssertNotEqual(summary.snapshotId, expected.snapshotId)
        expected.snapshotId = summary.snapshotId; expected.createdAt = summary.createdAt
        let ciphertextBytes = await export.ciphertextBytes, ciphertextHash = await export.ciphertextSHA256
        XCTAssertEqual(data.count, ciphertextBytes)
        XCTAssertEqual(SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined(), ciphertextHash)
        let receiver = VaultStore(directory: directory(), key: key)
        let candidate = try await receiver.prepareV4Replacement(source: export.ownedInput().take(), recoveryKey: recovery)
        try receiver.installLocalReceiptReplacement(candidate)
        XCTAssertEqual(try encode(receiver.snapshot), try encode(expected))
        let archive = XCTAttachment(data: data, uniformTypeIdentifier: "public.data"); archive.name = "ios-v4-finance.pennybackup"; archive.lifetime = .keepAlways; add(archive)
        let snapshot = XCTAttachment(data: try encode(expected), uniformTypeIdentifier: "public.json"); snapshot.name = "ios-v4-finance.snapshot.json"; snapshot.lifetime = .keepAlways; add(snapshot)
        let manifest: [String: Any] = ["publicFixtureOnly": true, "recoveryKey": recovery, "file": "ios-v4-finance.pennybackup", "snapshotFile": "ios-v4-finance.snapshot.json", "ciphertextBytes": data.count, "ciphertextSha256": ciphertextHash]
        let attachment = XCTAttachment(data: try JSONSerialization.data(withJSONObject: manifest, options: [.sortedKeys]), uniformTypeIdentifier: "public.json")
        attachment.name = "ios-v4-finance.manifest.json"; attachment.lifetime = .keepAlways; add(attachment)
        try await export.close()
        do { _ = try await export.ownedInput(); XCTFail("closed export") } catch {}
        let emptyStore = VaultStore(directory: directory(), key: key)
        try await emptyStore.ensurePublicationIdentityAsync()
        let empty = try await emptyStore.prepareV4Export(recoveryKey: recovery)
        let emptySummary = await empty.summary
        XCTAssertTrue(emptySummary.counts.values.allSatisfy { $0 == 0 })
        XCTAssertEqual(emptySummary.receiptBytes, 0)
        let emptyBytes = try await bytes(empty)
        XCTAssertFalse(emptyBytes.isEmpty)
        try await empty.close()
    }
    func testAndroidNativeWriterInstallsAndReopensExactSnapshot() async throws {
        let base = try XCTUnwrap(Bundle(for: Self.self).resourceURL).appendingPathComponent("fixtures/v4-native-writer-v1")
        let archive = base.appendingPathComponent("android-finance.pennybackup")
        let data = try Data(contentsOf: archive), expectedData = try Data(contentsOf: base.appendingPathComponent("android-finance.snapshot.json"))
        XCTAssertEqual(data.count, 4_904)
        XCTAssertEqual(SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined(), "a236fb4665082ec036454ea7af19fd7a8d6b0fd734f9f0ff1b04969c519952cd")
        XCTAssertEqual(SHA256.hash(data: expectedData).map { String(format: "%02x", $0) }.joined(), "c3e8b0aa3902f2738a22eb30fcb175d4b9c385e3604e8162a57bcfdfa73db3b3")
        let expected = try StrictJSON.snapshot(expectedData), dir = directory()
        let receiver = VaultStore(directory: dir, key: key)
        let candidate = try await receiver.prepareV4Replacement(source: FileInput(archive), recoveryKey: recovery)
        try receiver.installLocalReceiptReplacement(candidate)
        XCTAssertEqual(try encode(receiver.snapshot), try encode(expected))
        let reopened = VaultStore(directory: dir, key: key)
        XCTAssertEqual(try encode(reopened.snapshot), try encode(expected))
        XCTAssertEqual(try reopened.snapshot.attachments.map { try $0.bytes() }, try expected.attachments.map { try $0.bytes() })
    }
    func testCapturedReceiptPinsSurviveOrdinaryEditsAndGC() async throws {
        let dir = directory(), store = VaultStore(directory: dir, key: key), original = try snapshot(); try store.replace(original)
        let export = try await store.prepareV4Export(recoveryKey: recovery, checkpoint: { phase in
            let storage = try DurableVaultStorage(dir.appendingPathComponent("PennyOffline"))
            if phase == .sourcePinned {
                var changed = original; changed.attachments = []; changed.expenses[0].note = "first edit"; try store.replace(changed)
                changed.expenses[0].note = "second edit"; try store.replace(changed)
                XCTAssertEqual(try storage.leased { try storage.collectGarbage(key: self.key) }, 0)
            }
            if phase == .sealed { XCTAssertGreaterThan(try storage.leased { try storage.collectGarbage(key: self.key) }, 0) }
        })
        let receiver = VaultStore(directory: directory(), key: key)
        let candidate = try await receiver.prepareV4Replacement(source: export.ownedInput().take(), recoveryKey: recovery)
        try receiver.installLocalReceiptReplacement(candidate)
        var expected = original; expected.snapshotId = await export.summary.snapshotId; expected.createdAt = await export.summary.createdAt
        XCTAssertEqual(try encode(receiver.snapshot), try encode(expected))
        try await export.close()
    }
    func testPartialWriteSyncCloseAndCancellationCleanOnlyOwnedOutput() async throws {
        let store = VaultStore(directory: directory(), key: key); try store.replace(snapshot())
        let before = try stagedNames()
        for fault in [VaultStore.V4OutputPhase.wroteChunk, .synced, .closed] {
            do { _ = try await store.prepareV4Export(recoveryKey: recovery, outputFault: { phase in if phase == fault { throw Failure.injected } }); XCTFail("fault accepted") } catch {}
            XCTAssertEqual(try stagedNames(), before)
        }
        for phase in [VaultStore.V4ExportPhase.sourcePinned, .sealed, .verified] {
            do { _ = try await store.prepareV4Export(recoveryKey: recovery, checkpoint: { if $0 == phase { throw CancellationError() } }); XCTFail("cancel") } catch {}
            XCTAssertEqual(try stagedNames(), before)
        }
        let export = try await store.prepareV4Export(recoveryKey: recovery)
        let created = try XCTUnwrap(Set(stagedNames()).subtracting(before).first)
        let writer = try FileHandle(forWritingTo: FileManager.default.temporaryDirectory.appendingPathComponent(created))
        try writer.seek(toOffset: 80); try writer.write(contentsOf: Data([0xff])); try writer.close()
        let input = try await export.ownedInput().take()
        do { while try !input.read(maximum: 65_536).isEmpty {} ; XCTFail("modified same inode") } catch {}
        XCTAssertThrowsError(try input.close()); try await export.close()
        XCTAssertEqual(try stagedNames(), before)
    }
    func testMissingKeyAndCorruptReceiptCannotProduceExport() async throws {
        let missing = Mutex(false), supplied = key, dir = directory()
        let store = VaultStore(directory: dir, deviceKeyReader: { create in
            if missing.withLock({ $0 }) { XCTAssertFalse(create); throw ExpenseError.missingKey }; return supplied
        }); try store.replace(snapshot()); let before = try stagedNames(); missing.withLock { $0 = true }
        do { _ = try await store.prepareV4Export(recoveryKey: recovery); XCTFail("key") } catch {}
        XCTAssertEqual(try stagedNames(), before); missing.withLock { $0 = false }; store.load()
        let items = try XCTUnwrap(FileManager.default.enumerator(at: dir, includingPropertiesForKeys: nil))
        let receipt = try XCTUnwrap(items.allObjects.compactMap { $0 as? URL }.first { $0.pathExtension == "pennyreceipt" })
        var changed = try Data(contentsOf: receipt); changed[changed.count - 1] ^= 1; try changed.write(to: receipt)
        do { _ = try await store.prepareV4Export(recoveryKey: recovery); XCTFail("tamper") } catch {}
        XCTAssertEqual(try stagedNames(), before); XCTAssertEqual(try Data(contentsOf: receipt), changed)
    }
    func testCurrentMetadataCapacityRejectsBeforeOpeningOutput() async throws {
        var body = VaultSnapshot()
        for index in 0..<4_000 { var row = try Expense(merchant: "A", amountMinor: 1, expenseDate: "2026-09-13", category: Categories.all[0]); row.id = String(format: "%08x-0000-4000-8000-000000000000", index + 1); body.expenses.append(row) }
        let missing = BackupArchive.maximumExportablePlaintextBytes - 1_024 - (try encode(body)).count
        for index in body.expenses.indices { body.expenses[index].note = String(repeating: "a", count: missing / 4_000 + (index < missing % 4_000 ? 1 : 0)) }
        let store = VaultStore(directory: directory(), key: key); try store.replace(body)
        let before = try stagedNames()
        do { _ = try await store.prepareV4Export(recoveryKey: recovery); XCTFail("metadata overhead exceeds cap") } catch {}
        XCTAssertEqual(try stagedNames(), before)
    }
    private enum Failure: Error { case injected }
    private final class FileInput: PennyV4Input {
        let handle: FileHandle
        init(_ url: URL) throws { handle = try FileHandle(forReadingFrom: url) }
        func read(maximum: Int) throws -> Data { try handle.read(upToCount: maximum) ?? Data() }
        func close() throws { try handle.close() }
    }
}
