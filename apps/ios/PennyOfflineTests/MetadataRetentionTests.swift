import CryptoKit
import Darwin
import Foundation
import XCTest
@testable import PennyOffline

@MainActor final class MetadataRetentionTests: XCTestCase {
    private let key = SymmetricKey(data: Data(repeating: 0x0b, count: 32))
    private func file(_ name: String) throws -> URL { try XCTUnwrap(Bundle(for: Self.self).resourceURL).appendingPathComponent("fixtures/" + name) }
    private func fixture() throws -> VaultSnapshot { try StrictJSON.snapshot(Data(contentsOf: file("v4-native-writer-v1/android-finance.snapshot.json"))) }
    private func directory() -> URL {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        addTeardownBlock { try? FileManager.default.removeItem(at: url) }; return url
    }
    private func encode(_ snapshot: VaultSnapshot) throws -> Data {
        let encoder = JSONEncoder(); encoder.outputFormatting = [.sortedKeys, .withoutEscapingSlashes]; return try encoder.encode(snapshot)
    }
    private func sample(_ dir: URL, edit: Int) throws -> [String: Int] {
        var result = ["edit": edit, "recordFiles": 0, "recordBytes": 0, "pointerFiles": 0, "pointerBytes": 0]
        for path in try FileManager.default.contentsOfDirectory(at: dir.appendingPathComponent("PennyOffline"), includingPropertiesForKeys: nil) where path.pathExtension == "pennygen" {
            let bytes = try Data(contentsOf: path), kind = bytes.starts(with: Data("PENNY-DURABLE:RECORD:1\n".utf8)) ? "record" : "pointer"
            result[kind + "Files", default: 0] += 1; result[kind + "Bytes", default: 0] += bytes.count
        }
        return result
    }
    func testFiftyEditsPreserveExactDataAndRecordDiskSample() async throws {
        let dir = directory(), store = VaultStore(directory: dir, key: key)
        let preview = try await store.prepareFilesRestore(file("v4-native-writer-v1/android-finance.pennybackup"), recoveryKey: "pny1-" + String(repeating: "07", count: 32))
        try await preview.replace(in: store)
        let shape = try XCTUnwrap(JSONSerialization.jsonObject(with: Data(contentsOf: file("live-state-v1/metadata-edit.json"))) as? [String: Any])
        let changed = try JSONDecoder().decode(Expense.self, from: JSONSerialization.data(withJSONObject: XCTUnwrap(shape["expenseAfter"])))
        let plan = try XCTUnwrap(JSONSerialization.jsonObject(with: Data(contentsOf: file("live-state-v1/retention.json"))) as? [String: Any])
        let count = try XCTUnwrap(plan["mutationCount"] as? Int), prefix = try XCTUnwrap(plan["intermediateNotePrefix"] as? String)
        let ref = try XCTUnwrap(store.receiptDescriptors.first), receipt = dir.appendingPathComponent("PennyOffline/" + ref.generationId + "/" + ref.id + ".pennyreceipt")
        let originalCiphertext = try Data(contentsOf: receipt)
        var samples = [try sample(dir, edit: 0)]
        for index in 1...count {
            var next = changed; if index < count { next.note = prefix + String(index) }
            try await store.saveAsync(next)
            if [1, 10, 25, count].contains(index) { samples.append(try sample(dir, edit: index)) }
        }
        let attachment = XCTAttachment(data: try JSONSerialization.data(withJSONObject: samples, options: [.prettyPrinted, .sortedKeys]), uniformTypeIdentifier: "public.json")
        attachment.name = "metadata-retention-disk-samples"; attachment.lifetime = .keepAlways; add(attachment)
        var expected = try fixture(); expected.expenses[try XCTUnwrap(expected.expenses.firstIndex { $0.id == changed.id })] = changed
        let reopened = VaultStore(directory: dir, key: key)
        XCTAssertTrue(reopened.isReady); XCTAssertEqual(try encode(reopened.compatibilitySnapshot()), try encode(expected))
        XCTAssertEqual(try Data(contentsOf: receipt), originalCiphertext)
        let maximum = try XCTUnwrap(plan["settledMaximumMetadataGenerations"] as? Int)
        for item in samples {
            XCTAssertLessThanOrEqual(try XCTUnwrap(item["recordFiles"]), maximum)
            XCTAssertLessThanOrEqual(try XCTUnwrap(item["pointerFiles"]), 1)
            XCTAssertLessThanOrEqual(try XCTUnwrap(item["recordBytes"]), 2 * 6_100)
        }
    }
    func testReceiptFreeCandidateIsPinnedAcrossOrdinaryPublication() async throws {
        let dir = directory(), store = VaultStore(directory: dir, key: key), initial = try fixture()
        try store.replace(initial)
        var body = initial; body.attachments = []
        let preparation = try store.beginLocalReceiptReplacement(body, receipts: [])
        let candidate = try preparation.finish()
        for index in 1...3 { var expense = initial.expenses[0]; expense.note = "Owned candidate edit \(index)"; try await store.saveAsync(expense) }
        XCTAssertEqual(try candidate.verifiedSummary().counts["attachments"], 0)
        XCTAssertEqual(try sample(dir, edit: 0)["recordFiles"], 3)
        try candidate.close(); _ = try store.collectReceiptGarbage()
        XCTAssertEqual(try sample(dir, edit: 0)["recordFiles"], 2)
        XCTAssertEqual(try store.compatibilitySnapshot().attachments.map { try $0.bytes() }, try initial.attachments.map { try $0.bytes() })
    }
    func testOverlappingPinnedRecordsRetainCompleteReceiptProvenance() async throws {
        let dir = directory(), store = VaultStore(directory: dir, key: key)
        var initial = try fixture()
        let a = initial.attachments[0], b = try ReceiptAttachment(data: a.bytes(), expenseId: a.expenseId)
        let c = try ReceiptAttachment(data: a.bytes(), expenseId: a.expenseId)
        initial.attachments = [a, b]; try store.replace(initial)
        let pinB = try await store.openReceipt(b.id)
        var next = initial; next.attachments = [a, c]; try store.replace(next)
        try await store.saveAsync(next.expenses[0])
        let descriptors = store.receiptDescriptors, pinC = try await store.openReceipt(c.id)
        try await store.saveAsync(next.expenses[0], attachments: [])
        try await store.saveAsync(next.expenses[0])
        try pinB.close()
        XCTAssertEqual(try store.collectReceiptGarbage(), 1)
        for descriptor in descriptors {
            XCTAssertEqual(try LocalReceiptGeneration.readCommitted(parent: dir.appendingPathComponent("PennyOffline"), descriptor: descriptor, root: key), try a.bytes())
        }
        try pinC.close()
        XCTAssertEqual(try store.collectReceiptGarbage(), 2)
        XCTAssertEqual(try sample(dir, edit: 0)["recordFiles"], 2)
        XCTAssertTrue(VaultStore(directory: dir, key: key).isReady)
    }
    func testCleanupFailureCancellationAndSubstitutionCannotFailCommittedSave() async throws {
        enum Fault: Error { case injected }
        for mode in 0..<3 {
            let dir = directory(), store = VaultStore(directory: dir, key: key), initial = try fixture()
            try store.replace(initial); try await store.saveAsync(initial.expenses[0])
            var changed = initial; changed.expenses[0].note = "Committed despite cleanup \(mode)"
            let prepared = try await store.prepareWrite(changed), root = dir.appendingPathComponent("PennyOffline")
            var replacement: URL?
            let storage = try DurableVaultStorage(root, collectionCheckpoint: { name in
                if mode == 0 { throw Fault.injected }
                if mode == 1 { withUnsafeCurrentTask { $0?.cancel() }; return }
                let path = root.appendingPathComponent(name)
                try FileManager.default.removeItem(at: path); try Data("foreign replacement".utf8).write(to: path)
                replacement = path
            })
            let operation = Task { try storage.leased {
                try storage.commit(prepared, sourceDigest: prepared.sourceDigest, storeId: prepared.sourceStoreId,
                                   receipts: store.receiptDescriptors, checkpoint: nil)
            } }
            let loaded = try await operation.value
            XCTAssertEqual(try encode(loaded.snapshot), try encode(changed)); XCTAssertTrue(storage.collectionReport.failed)
            XCTAssertEqual(try encode(VaultStore(directory: dir, key: key).compatibilitySnapshot()), try encode(changed))
            if mode == 2 { XCTAssertEqual(try Data(contentsOf: XCTUnwrap(replacement)), Data("foreign replacement".utf8)) }
        }
    }
    func testUnknownUnreadableAndSymlinkMetadataRemainQuarantined() async throws {
        let dir = directory(), store = VaultStore(directory: dir, key: key), initial = try fixture()
        try store.replace(initial)
        let root = dir.appendingPathComponent("PennyOffline")
        let unknown = root.appendingPathComponent(UUID().uuidString.lowercased() + ".pennygen")
        let foreign = dir.appendingPathComponent("foreign"), link = root.appendingPathComponent(UUID().uuidString.lowercased() + ".pennygen")
        let fifo = root.appendingPathComponent(UUID().uuidString.lowercased() + ".pennygen")
        XCTAssertEqual(mkfifo(fifo.path, 0o600), 0)
        try Data([7, 8, 9]).write(to: unknown); try FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: unknown.path)
        try Data([1, 2, 3]).write(to: foreign); try FileManager.default.createSymbolicLink(at: link, withDestinationURL: foreign)
        // Retain an authenticated old record while its receipt becomes missing.
        let image = try await store.openReceipt(initial.attachments[0].id)
        try await store.saveAsync(initial.expenses[0], attachments: [])
        try await store.saveAsync(initial.expenses[0]); try image.close()
        let recordNames = try FileManager.default.contentsOfDirectory(atPath: root.path).filter { $0.hasSuffix(".pennygen") }
        let before = try Dictionary(uniqueKeysWithValues: recordNames.filter { $0 != link.lastPathComponent && $0 != fifo.lastPathComponent }.map { ($0, try Data(contentsOf: root.appendingPathComponent($0))) })
        let oldReceipt = try XCTUnwrap(FileManager.default.enumerator(at: root, includingPropertiesForKeys: nil)?.compactMap { $0 as? URL }.first { $0.pathExtension == "pennyreceipt" })
        try FileManager.default.removeItem(at: oldReceipt)
        let storage = try DurableVaultStorage(root); _ = try storage.leased { try storage.collectGarbage(key: key) }
        XCTAssertGreaterThanOrEqual(storage.collectionReport.quarantined, 4)
        for (name, bytes) in before { XCTAssertEqual(try Data(contentsOf: root.appendingPathComponent(name)), bytes) }
        XCTAssertEqual(try FileManager.default.destinationOfSymbolicLink(atPath: link.path), foreign.path)
        XCTAssertEqual(try Data(contentsOf: foreign), Data([1, 2, 3]))
        var fifoInfo = stat(); XCTAssertEqual(lstat(fifo.path, &fifoInfo), 0); XCTAssertEqual(fifoInfo.st_mode & S_IFMT, S_IFIFO)
        XCTAssertTrue(VaultStore(directory: dir, key: key).isReady)
        // A special-file substitution inside old receipt provenance must also
        // fail before reading, including the two native image-validation opens.
        XCTAssertEqual(mkfifo(oldReceipt.path, 0o600), 0)
        try await store.saveAsync(initial.expenses[0])
        XCTAssertTrue(store.isReady)
        XCTAssertEqual(lstat(oldReceipt.path, &fifoInfo), 0); XCTAssertEqual(fifoInfo.st_mode & S_IFMT, S_IFIFO)
        XCTAssertEqual(try Data(contentsOf: unknown), Data([7, 8, 9]))
    }
}
