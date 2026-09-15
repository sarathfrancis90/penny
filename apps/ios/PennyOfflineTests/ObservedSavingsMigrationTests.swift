import CryptoKit
import XCTest
@testable import PennyOffline

final class ObservedSavingsMigrationTests: XCTestCase {
    @MainActor func testObservedSavingsFixtureDecryptsRestoresAndReopensExactly() throws {
        let root = try XCTUnwrap(Bundle(for: Self.self).resourceURL).appendingPathComponent("fixtures/raw-savings-v1")
        func file(_ name: String) throws -> Data { try Data(contentsOf: root.appendingPathComponent(name)) }
        func sha(_ data: Data) -> String { SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined() }
        XCTAssertEqual(try sha(file("fixture-manifest.json")), "8f28d8990ebff9adb19972448789bd3ce36df223e0dfbfa5eb978e72744327e4")
        XCTAssertEqual(try sha(file("positive.pennybackup")), "929a4d8134ee264f8b17797174f6d8d1a1bc379b6722f367dcd08a5e72e96e80")
        let expected = try StrictJSON.snapshot(file("positive.snapshot.json"))
        let imported = try BackupArchive.restore(file("positive.pennybackup"), recoveryKey: "pny1-" + String(repeating: "07", count: 32))
        let encoder = JSONEncoder(); encoder.outputFormatting = [.sortedKeys, .withoutEscapingSlashes]
        XCTAssertEqual(try encoder.encode(imported), try encoder.encode(expected))
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: directory) }
        let key = SymmetricKey(size: .bits256), store = VaultStore(directory: directory, key: key)
        try store.restore(imported)
        let reopened = VaultStore(directory: directory, key: key)
        XCTAssertTrue(reopened.isReady)
        XCTAssertEqual(try encoder.encode((try reopened.compatibilitySnapshot())), try encoder.encode(expected))
        XCTAssertEqual((try reopened.compatibilitySnapshot()).savingsGoals.count, 3)
        XCTAssertEqual((try reopened.compatibilitySnapshot()).savingsGoals.map(\.openingMinor).sorted(), [0, 1_234, 12_500])
        XCTAssertEqual((try reopened.compatibilitySnapshot()).savingsGoals.reduce(0) { $0 + $1.openingMinor }, 13_734)
        XCTAssertTrue((try reopened.compatibilitySnapshot()).incomeEntries.isEmpty)
        XCTAssertTrue((try reopened.compatibilitySnapshot()).savingsEntries.isEmpty)
        XCTAssertEqual(FinanceEngine.report((try reopened.compatibilitySnapshot()), month: "2026-09").received, 0)
        XCTAssertEqual((try reopened.compatibilitySnapshot()).attachments.count, expected.attachments.count)
        for (actual, source) in zip((try reopened.compatibilitySnapshot()).attachments, expected.attachments) { XCTAssertEqual(try actual.bytes(), try source.bytes()) }
    }
}
