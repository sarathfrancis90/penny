import CryptoKit
import UIKit
import XCTest
import zlib
@testable import PennyOffline

@MainActor final class NativePerformanceTests: XCTestCase {
    private func timed<T>(_ operation: () throws -> T) rethrows -> (T, Double) {
        let start = ContinuousClock.now; let result = try operation(); let elapsed = start.duration(to: .now).components
        return (result, Double(elapsed.seconds) * 1_000 + Double(elapsed.attoseconds) / 1e15)
    }
    private func largeJPEG() throws -> Data {
        let format = UIGraphicsImageRendererFormat(); format.scale = 1; format.opaque = true
        let image = UIGraphicsImageRenderer(size: CGSize(width: 4000, height: 4000), format: format).image { context in
            UIColor.white.setFill(); context.fill(CGRect(x: 0, y: 0, width: 4000, height: 4000))
        }
        var data = try XCTUnwrap(image.jpegData(compressionQuality: 0.8)); data.removeLast(2)
        while ReceiptAttachment.maximumBytes - data.count - 2 >= 4 {
            let payload = min(65_533, ReceiptAttachment.maximumBytes - data.count - 6)
            let length = payload + 2
            data.append(contentsOf: [0xff, 0xfe, UInt8(length >> 8), UInt8(length & 255)])
            data.append(Data(repeating: 65, count: payload))
        }
        data.append(contentsOf: [0xff, 0xd9]); return data
    }
    private func responsive<T: Sendable>(_ operation: () async throws -> T) async rethrows -> (T, Double, Int, Double) {
        var ticks = 0, maximumGap = 0.0
        let heartbeat = Task { @MainActor in
            var last = ContinuousClock.now
            while !Task.isCancelled {
                try? await Task.sleep(for: .milliseconds(2))
                let now = ContinuousClock.now, elapsed = last.duration(to: now).components
                maximumGap = max(maximumGap, Double(elapsed.seconds) * 1000 + Double(elapsed.attoseconds) / 1e15)
                last = now; ticks += 1
            }
        }
        defer { heartbeat.cancel() }
        await Task.yield()
        let start = ContinuousClock.now
        let result = try await operation(), elapsed = start.duration(to: .now).components
        heartbeat.cancel()
        await heartbeat.value
        return (result, Double(elapsed.seconds) * 1000 + Double(elapsed.attoseconds) / 1e15, ticks, maximumGap)
    }
    private func encoded(_ snapshot: VaultSnapshot) throws -> Data {
        let encoder = JSONEncoder(); encoder.outputFormatting = [.sortedKeys, .withoutEscapingSlashes]
        return try encoder.encode(snapshot)
    }
    private func assertExact(_ actual: VaultSnapshot, _ expected: VaultSnapshot) throws {
        // Complete Snapshot equality includes all eight arrays, all fields and IDs.
        XCTAssertEqual(try encoded(actual), try encoded(expected))
        XCTAssertEqual(try actual.attachments.map { try $0.bytes() }, try expected.attachments.map { try $0.bytes() })
    }
    /// Opt-in through the separate performance scheme/explicit method selection.
    func testCombinedCurrentCapStreamedRoundtrip() async throws {
        let fixtures = try XCTUnwrap(Bundle(for: Self.self).resourceURL).appendingPathComponent("fixtures")
        let manifestBytes = try Data(contentsOf: fixtures.appendingPathComponent("current-cap-v1/workload.json"))
        XCTAssertEqual(DurableVaultStorage.digest(manifestBytes), "35bdfaee6e8236504ed50c8e06e0eeb0f4b27c1f6716ad87fac3eab4b1b7afa9")
        let plan = try XCTUnwrap(JSONSerialization.jsonObject(with: manifestBytes) as? [String: Any])
        let source = try Data(contentsOf: fixtures.appendingPathComponent("current-cap-v1/" + XCTUnwrap(plan["sourceSnapshot"] as? String)))
        XCTAssertEqual(DurableVaultStorage.digest(source), plan["sourceSnapshotSha256"] as? String)
        var snapshot = try StrictJSON.snapshot(source)
        let png = try snapshot.attachments[0].bytes()
        XCTAssertEqual(DurableVaultStorage.digest(png), plan["sourceReceiptSha256"] as? String)
        let template = try XCTUnwrap(plan["expenseTemplate"] as? [String: Any])
        let count = try XCTUnwrap(plan["expenseCount"] as? Int)
        for index in 0..<(count - snapshot.expenses.count) {
            var record = template
            record["id"] = try XCTUnwrap(plan["expenseIdPrefix"] as? String) + String(format: "%012d", index)
            record["merchant"] = try XCTUnwrap(plan["merchantPrefix"] as? String) + String(index)
            snapshot.expenses.append(try JSONDecoder().decode(Expense.self, from: JSONSerialization.data(withJSONObject: record)))
        }
        func bigEndian(_ value: Int) -> Data { Data((0..<4).reversed().map { UInt8(truncatingIfNeeded: value >> ($0 * 8)) }) }
        let lengths = try XCTUnwrap(plan["receiptLengths"] as? [Int]), hashes = try XCTUnwrap(plan["receiptSha256ByLength"] as? [String: String])
        snapshot.attachments = try lengths.enumerated().map { index, length in
            var payload = Data("npAD".utf8); payload.append(Data(repeating: 0, count: length - png.count - 12))
            let crc = payload.withUnsafeBytes { crc32(0, $0.bindMemory(to: UInt8.self).baseAddress!, uInt(payload.count)) }
            let bytes = png.dropLast(12) + bigEndian(payload.count - 4) + payload + bigEndian(Int(crc)) + png.suffix(12)
            XCTAssertEqual(bytes.count, length); XCTAssertEqual(DurableVaultStorage.digest(bytes), hashes[String(length)])
            let record: [String: Any] = ["id": try XCTUnwrap(plan["receiptIdPrefix"] as? String) + String(format: "%012d", index),
                "expenseId": snapshot.expenses[index].id, "mediaType": "image/png", "byteCount": length,
                "sha256": DurableVaultStorage.digest(bytes), "dataBase64": bytes.base64EncodedString()]
            return try JSONDecoder().decode(ReceiptAttachment.self, from: JSONSerialization.data(withJSONObject: record))
        }
        XCTAssertEqual(snapshot.expenses.count, 10_000); XCTAssertEqual(snapshot.attachments.count, 100)
        XCTAssertEqual(snapshot.attachments.reduce(0) { $0 + $1.byteCount }, 8_388_608)
        XCTAssertEqual(snapshot.attachments.map(\.byteCount).max(), 2_097_152)
        let shape = try XCTUnwrap(JSONSerialization.jsonObject(with: encoded(snapshot)) as? [String: Any])
        for name in try XCTUnwrap(plan["preservedFinanceDomains"] as? [String]) { XCTAssertFalse(try XCTUnwrap(shape[name] as? [Any]).isEmpty) }
        XCTAssertEqual(snapshot.expenses.reduce(0) { $0 + $1.amountMinor }, Int64(try XCTUnwrap(plan["expectedExpenseTotalMinor"] as? Int)))
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString), receiverDir = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: dir); try? FileManager.default.removeItem(at: receiverDir) }
        let key = SymmetricKey(size: .bits256), store = VaultStore(directory: dir, key: key)
        var results: [String: Any] = ["expenses": count, "receipts": lengths.count, "receiptBytes": lengths.reduce(0, +), "imagePixels": 1]
        func metric(_ name: String, _ value: (Void, Double, Int, Double)) { results[name] = ["milliseconds": value.1, "heartbeatTicks": value.2, "maximumHeartbeatGapMs": value.3] }
        defer {
            if let data = try? JSONSerialization.data(withJSONObject: results, options: [.sortedKeys, .prettyPrinted]) {
                let attachment = XCTAttachment(data: data, uniformTypeIdentifier: "public.json"); attachment.name = "combined-current-cap.json"; attachment.lifetime = .keepAlways; add(attachment)
            }
        }
        metric("create", try await responsive { try await store.replaceAsync(snapshot) })
        try assertExact(store.compatibilitySnapshot(), snapshot)
        let edit = try XCTUnwrap(plan["edit"] as? [String: Any]), index = try XCTUnwrap(snapshot.expenses.firstIndex { $0.id == edit["expenseId"] as? String })
        snapshot.expenses[index].amountMinor = Int64(try XCTUnwrap(edit["amountMinor"] as? Int)); snapshot.expenses[index].note = try XCTUnwrap(edit["note"] as? String)
        let originalDescriptors = store.receiptDescriptors
        metric("metadataSave", try await responsive { try await store.saveAsync(snapshot.expenses[index]) })
        XCTAssertTrue(store.liveBody.attachments.isEmpty); XCTAssertEqual(store.receiptDescriptors, originalDescriptors)
        try assertExact(store.compatibilitySnapshot(), snapshot)
        XCTAssertEqual(snapshot.expenses.reduce(0) { $0 + $1.amountMinor }, 12_351_548)
        let recovery = "pny1-" + String(repeating: "07", count: 32)
        let (export, exportMs, exportTicks, exportGap) = try await responsive { try await store.prepareV4Export(recoveryKey: recovery) }
        results["v4Export"] = ["milliseconds": exportMs, "heartbeatTicks": exportTicks, "maximumHeartbeatGapMs": exportGap]
        results["v4CiphertextBytes"] = await export.ciphertextBytes
        let summary = await export.summary
        XCTAssertNotEqual(summary.snapshotId, snapshot.snapshotId); snapshot.snapshotId = summary.snapshotId; snapshot.createdAt = summary.createdAt
        // V4 writes every domain in canonical ID order; preserve every field/byte.
        snapshot.expenses.sort { $0.id < $1.id }; snapshot.attachments.sort { $0.id < $1.id }; snapshot.budgets.sort { $0.id < $1.id }
        snapshot.incomeSources.sort { $0.id < $1.id }; snapshot.incomeEntries.sort { $0.id < $1.id }; snapshot.savingsGoals.sort { $0.id < $1.id }
        snapshot.savingsEntries.sort { $0.id < $1.id }; snapshot.recurringExpenses.sort { $0.id < $1.id }
        let receiver = VaultStore(directory: receiverDir, key: key)
        metric("v4ReadInstall", try await responsive {
            let candidate = try await receiver.prepareV4Replacement(source: export.ownedInput().take(), recoveryKey: recovery)
            try receiver.installLocalReceiptReplacement(candidate)
        })
        try assertExact(receiver.compatibilitySnapshot(), snapshot)
        let (reopened, reopenMs) = timed { VaultStore(directory: receiverDir, key: key) }; results["reopenMs"] = reopenMs
        XCTAssertTrue(reopened.isReady); try assertExact(reopened.compatibilitySnapshot(), snapshot); try await export.close()
        // Existing current-cap admission already requires exact schema3 exportability.
        metric("compatibilityExportDecode", try await responsive {
            let staged = try await ArchiveWorker.shared.prepare(reopened.compatibilitySnapshot(), key: recovery)
            results["legacyCiphertextBytes"] = staged.bytes.count
            let decoded = try await ArchiveWorker.shared.decode(staged.bytes, key: recovery)
            var expected = snapshot; expected.snapshotId = decoded.snapshotId; expected.createdAt = decoded.createdAt
            try assertExact(decoded, expected); await ArchiveWorker.shared.cancel(staged)
        })
        results["exactOraclePassed"] = true
    }
    func testNativeStorageOperationTimings() async throws {
        var results: [[String: Any]] = []
        for count in [1_000, 10_000, 100] {
            let dir = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
            defer { try? FileManager.default.removeItem(at: dir) }
            var snapshot = VaultSnapshot()
            let seed = try Expense(merchant: "Benchmark", amountMinor: 1250, expenseDate: "2026-09-01", category: Categories.other)
            snapshot.expenses = (0..<count).map { index in var item = seed; item.id = UUID().uuidString.lowercased(); item.merchant = "Benchmark \(index)"; return item }
            if count == 100 {
                let bytes = try largeJPEG()
                snapshot.attachments = try (0..<4).map { try ReceiptAttachment(data: bytes, expenseId: snapshot.expenses[$0].id) }
            }
            let key = SymmetricKey(size: .bits256), vault = VaultStore(directory: dir, key: key)
            let (_, create, _, _) = try await responsive { try await vault.replaceAsync(snapshot) }
            let (opened, cold) = timed { VaultStore(directory: dir, key: key) }; XCTAssertTrue(opened.isReady)
            XCTAssertTrue(opened.liveBody.attachments.isEmpty)
            var edit = opened.liveBody.expenses[0]; edit.merchant = "Edited benchmark"
            let (_, save, saveTicks, saveGap) = try await responsive { try await opened.saveAsync(edit) }
            var expected = snapshot; expected.expenses[0] = edit
            var expectedBody = expected; expectedBody.attachments = []
            XCTAssertEqual(try encoded(opened.liveBody), try encoded(expectedBody))
            let (_, report) = timed { FinanceEngine.report(opened.liveBody, month: "2026-09") }
            let recoveryKey = BackupArchive.newRecoveryKey()
            // Deliberate legacy compatibility operation; hydration is included in
            // this timing. It does not measure the current streamed v4 Files writer.
            let (staged, export, exportTicks, exportGap) = try await responsive { try await ArchiveWorker.shared.prepare(opened.compatibilitySnapshot(), key: recoveryKey) }
            let archive = staged.bytes
            let (decoded, decode, restoreTicks, restoreGap) = try await responsive { try await ArchiveWorker.shared.decode(archive, key: recoveryKey) }
            XCTAssertNotEqual(decoded.snapshotId, expected.snapshotId)
            XCTAssertTrue(CivilDate.validTimestamp(decoded.createdAt))
            expected.snapshotId = decoded.snapshotId; expected.createdAt = decoded.createdAt
            try assertExact(decoded, expected)
            let (_, commit, commitTicks, commitGap) = try await responsive { try await opened.restoreAsync(decoded) }
            await ArchiveWorker.shared.cancel(staged)
            XCTAssertGreaterThan(exportTicks, 1); XCTAssertGreaterThan(restoreTicks, 1)
            try assertExact(opened.compatibilitySnapshot(), expected)
            let reopened = VaultStore(directory: dir, key: key); XCTAssertTrue(reopened.isReady)
            try assertExact(reopened.compatibilitySnapshot(), expected)
            results.append(["case": count == 100 ? "receipt-byte-and-pixel-bound" : "expenses-\(count)", "expenses": count,
                "receipts": snapshot.attachments.count, "receiptBytes": snapshot.attachments.reduce(0) { $0 + $1.byteCount }, "archiveBytes": archive.count,
                "createMs": create, "coldOpenMs": cold, "saveMs": save, "reportMs": report, "protectedExportMs": export, "restoreMs": decode + commit, "restoreDecodeMs": decode, "restoreCommitMs": commit, "saveMainActorHeartbeatTicks": saveTicks, "saveMaximumHeartbeatGapMs": saveGap,
                "commitMainActorHeartbeatTicks": commitTicks, "commitMaximumHeartbeatGapMs": commitGap,
                "exportMainActorHeartbeatTicks": exportTicks, "exportMaximumHeartbeatGapMs": exportGap,
                "restoreMainActorHeartbeatTicks": restoreTicks, "restoreMaximumHeartbeatGapMs": restoreGap])
        }
        let output: [String: Any] = ["runtime": "Native iOS simulator XCTest; Release optimized; serial worker preparation/publication; 2ms MainActor heartbeat; export measures legacy compatibility hydration/archive, not v4 Files writer", "oracle": "Exact edited snapshot/all eight arrays and receipt bytes after decode, restore and fresh store reopen; six finance arrays are empty in these preserved workloads", "device": UIDevice.current.name, "systemVersion": UIDevice.current.systemVersion, "results": results]
        let artifact = XCTAttachment(data: try JSONSerialization.data(withJSONObject: output, options: [.prettyPrinted, .sortedKeys]), uniformTypeIdentifier: "public.json")
        artifact.name = "native-performance.json"; artifact.lifetime = .keepAlways; add(artifact)
    }
}
