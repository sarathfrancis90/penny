import CryptoKit
import UIKit
import XCTest
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
