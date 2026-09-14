import CryptoKit
import XCTest
@testable import PennyOffline

final class FinanceTests: XCTestCase {
    private func file(_ name: String) throws -> Data {
        try Data(contentsOf: XCTUnwrap(Bundle(for: Self.self).resourceURL).appendingPathComponent("fixtures/" + name))
    }
    private func golden() throws -> VaultSnapshot { try StrictJSON.snapshot(file("snapshot-v3.json")) }
    func testCompleteFinanceGoldenAndCSV() throws {
        let snapshot = try golden()
        let report = FinanceEngine.report(snapshot, month: "2026-02")
        XCTAssertEqual(report.expenses, 9_000); XCTAssertEqual(report.received, 78_000)
        XCTAssertEqual(report.net, 69_000); XCTAssertEqual(report.contributions, 2_000)
        XCTAssertEqual(report.categories.map(\.category), Categories.all)
        XCTAssertEqual(report.incomeCategories.first(where: { $0.category == "freelance" })?.amount, 78_000)
        let budget = try XCTUnwrap(FinanceEngine.budgets(snapshot, month: "2026-02").first)
        XCTAssertEqual(budget.carry, 4_000); XCTAssertEqual(budget.available, 14_000); XCTAssertEqual(budget.remaining, 7_000); XCTAssertTrue(budget.thresholdReached)
        let savings = FinanceEngine.savings(snapshot, goal: snapshot.savingsGoals[0])
        XCTAssertEqual(savings.current, 12_000); XCTAssertEqual(savings.remaining, 88_000); XCTAssertEqual(savings.progressBps, 1_200)
        XCTAssertEqual(FinanceEngine.csv(snapshot.expenses), try file("expenses-v3.csv"))
        let expected = try XCTUnwrap(try JSONSerialization.jsonObject(with: file("finance-golden.json")) as? [String: Any])
        for test in try XCTUnwrap(expected["recurrence"] as? [[String: Any]]) {
            let schedule = try JSONDecoder().decode(FinanceSchedule.self, from: JSONSerialization.data(withJSONObject: XCTUnwrap(test["schedule"])))
            XCTAssertEqual(try schedule.occurrences(from: XCTUnwrap(test["from"] as? String), to: XCTUnwrap(test["to"] as? String), enabled: XCTUnwrap(test["recurring"] as? Bool)), test["expected"] as? [String])
        }
        XCTAssertEqual(GregorianDay.moveMonth("0001-01", by: -1), nil)
        XCTAssertEqual(GregorianDay.moveMonth("9999-12", by: 1), nil)
        XCTAssertEqual(GregorianDay.civil(GregorianDay.ordinal("1582-10-10")), "1582-10-10")
        XCTAssertThrowsError(try snapshot.recurringExpenses[0].schedule.occurrences(from: "2026-01-01", to: "2027-01-03"))
    }
    func testSharedFinanceNegativeFixturesAndRequiredMembers() throws {
        let original = try XCTUnwrap(try JSONSerialization.jsonObject(with: file("snapshot-v3.json")) as? [String: Any])
        let conformance = try XCTUnwrap(try JSONSerialization.jsonObject(with: file("conformance-v3.json")) as? [String: Any])
        struct CSVCase: Decodable { let input: String; let expected: String }
        struct CSVCorpus: Decodable { let csvCases: [CSVCase] }
        for test in try JSONDecoder().decode(CSVCorpus.self, from: file("conformance-v3.json")).csvCases {
            XCTAssertEqual(FinanceEngine.csvCell(test.input), test.expected)
        }
        for mutation in try XCTUnwrap(conformance["mutations"] as? [[String: Any]]) {
            var snapshot = original
            let domain = try XCTUnwrap(mutation["domain"] as? String)
            var records = try XCTUnwrap(snapshot[domain] as? [[String: Any]])
            records[try XCTUnwrap(mutation["index"] as? Int)][try XCTUnwrap(mutation["field"] as? String)] = mutation["value"]
            snapshot[domain] = records
            XCTAssertThrowsError(try StrictJSON.snapshot(JSONSerialization.data(withJSONObject: snapshot)), "\(domain).\(mutation["field"] ?? "")")
        }
        for domain in ["budgets", "incomeSources", "incomeEntries", "savingsGoals", "savingsEntries", "recurringExpenses", "expenses"] {
            var candidate = original; candidate.removeValue(forKey: domain)
            XCTAssertThrowsError(try StrictJSON.snapshot(JSONSerialization.data(withJSONObject: candidate)))
            let records = try XCTUnwrap(original[domain] as? [[String: Any]])
            for key in records[0].keys {
                var missing = records; missing[0].removeValue(forKey: key); candidate = original; candidate[domain] = missing
                XCTAssertThrowsError(try StrictJSON.snapshot(JSONSerialization.data(withJSONObject: candidate)), "missing \(domain).\(key)")
            }
        }
        var candidate = try golden(); candidate.incomeSources = []
        XCTAssertThrowsError(try candidate.validate())
        candidate = try golden(); candidate.savingsGoals = []
        XCTAssertThrowsError(try candidate.validate())
        candidate = try golden(); var duplicate = candidate.budgets[0]; duplicate.id = UUID().uuidString.lowercased(); candidate.budgets.append(duplicate)
        XCTAssertThrowsError(try candidate.validate())
        candidate = try golden(); var entry = candidate.incomeEntries[0]; entry.id = UUID().uuidString.lowercased(); candidate.incomeEntries.append(entry)
        XCTAssertThrowsError(try candidate.validate())
    }
    func testLargeExactThresholdsAndRolloverBreaks() throws {
        var b = Budget(); b.alertThresholdBps = 9_999
        let large: Int64 = 999_999_999_999_999
        let threshold = large / 10_000 * 9_999 + (large % 10_000 * 9_999 + 9_999) / 10_000
        XCTAssertFalse(BudgetPosition(budget: b, carry: 0, available: large, spent: threshold - 1).thresholdReached)
        XCTAssertTrue(BudgetPosition(budget: b, carry: 0, available: large, spent: threshold).thresholdReached)
        b.alertThresholdBps = 0
        XCTAssertFalse(BudgetPosition(budget: b, carry: 0, available: 1_000, spent: 0).thresholdReached)
        XCTAssertFalse(BudgetPosition(budget: b, carry: 0, available: 0, spent: 0).thresholdReached)
        XCTAssertTrue(BudgetPosition(budget: b, carry: 0, available: 0, spent: 1).thresholdReached)
        var earliest = VaultSnapshot(); var earlyBudget = Budget(); earlyBudget.month = "0001-01"; earlyBudget.rollover = true; earliest.budgets = [earlyBudget]
        XCTAssertEqual(FinanceEngine.budgets(earliest, month: "0001-01")[0].carry, 0)
        var snapshot = try golden(); snapshot.budgets[1].month = "2026-03"
        XCTAssertEqual(FinanceEngine.budgets(snapshot, month: "2026-03")[0].carry, 0)
        snapshot = try golden(); snapshot.expenses[0].amountMinor = 20_000
        XCTAssertEqual(FinanceEngine.budgets(snapshot, month: "2026-02")[0].carry, 0)
    }
    @MainActor func testFinanceOnlyVaultPersistenceFailedRestoreAndMissingKey() throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: directory) }
        let key = SymmetricKey(size: .bits256)
        let store = VaultStore(directory: directory, key: key)
        var snapshot = try golden(); snapshot.expenses = []; snapshot.attachments = []
        try store.replace(snapshot)
        let reopened = VaultStore(directory: directory, key: key)
        XCTAssertTrue(reopened.isReady); XCTAssertEqual(reopened.snapshot.incomeEntries, snapshot.incomeEntries)
        XCTAssertEqual(reopened.snapshot.savingsGoals, snapshot.savingsGoals)
        XCTAssertFalse(VaultStore(directory: directory, key: SymmetricKey(size: .bits256)).isReady)
        enum Failure: Error { case diskFull }
        let failed = VaultStore(directory: directory, key: key, commitCheckpoint: { if $0 == .committed { throw Failure.diskFull } })
        XCTAssertThrowsError(try failed.restore(VaultSnapshot()))
        let after = VaultStore(directory: directory, key: key)
        XCTAssertEqual(after.snapshot.incomeEntries, snapshot.incomeEntries)
        XCTAssertEqual(after.snapshot.savingsEntries, snapshot.savingsEntries)
        XCTAssertEqual(after.snapshot.budgets, snapshot.budgets)
    }
    @MainActor func testReviewedOccurrencesAreAtomicAndIdempotent() throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: directory) }
        let key = SymmetricKey(size: .bits256)
        let store = VaultStore(directory: directory, key: key); try store.replace(golden())
        let template = store.snapshot.recurringExpenses[0]
        let first = try store.postRecurring(template.id, occurrence: "2026-02-28")
        XCTAssertEqual(try store.postRecurring(template.id, occurrence: "2026-02-28").id, first.id)
        XCTAssertThrowsError(try store.postRecurring(template.id, occurrence: "2026-02-27"))
        let source = store.snapshot.incomeSources[0]
        let received = try store.postIncome(source.id, occurrence: "2026-01-31", receivedDate: "2026-02-01", amountMinor: 91_000)
        XCTAssertEqual(try store.postIncome(source.id, occurrence: "2026-01-31", receivedDate: "2026-02-01", amountMinor: 1).id, received.id)
        let reopened = VaultStore(directory: directory, key: key)
        XCTAssertEqual(reopened.snapshot.incomeEntries.count, 2); XCTAssertEqual(reopened.snapshot.expenses.count, 4)
        var inactive = template; inactive.isActive = false; try reopened.save(inactive)
        XCTAssertThrowsError(try reopened.postRecurring(template.id, occurrence: "2026-03-31"))
        var missing = reopened.snapshot; missing.recurringExpenses = []
        XCTAssertThrowsError(try reopened.replace(missing))
    }
    func testV3NativeBackupAllDomainsAndPriorRuntimeCompatibility() throws {
        let vector = try XCTUnwrap(try JSONSerialization.jsonObject(with: file("golden-vector-v3.json")) as? [String: Any])
        let key = try XCTUnwrap(vector["recoveryKey"] as? String)
        let snapshot = try BackupArchive.restore(file("backup-v3.pennybackup"), recoveryKey: key)
        let produced = try BackupArchive.export(snapshot, recoveryKey: key)
        let result = try BackupArchive.restore(produced, recoveryKey: key)
        XCTAssertEqual(result.budgets, snapshot.budgets); XCTAssertEqual(result.incomeSources, snapshot.incomeSources)
        XCTAssertEqual(result.incomeEntries, snapshot.incomeEntries); XCTAssertEqual(result.savingsGoals, snapshot.savingsGoals)
        XCTAssertEqual(result.savingsEntries, snapshot.savingsEntries); XCTAssertEqual(result.recurringExpenses, snapshot.recurringExpenses)
        XCTAssertEqual(result.attachments, snapshot.attachments); XCTAssertEqual(result.expenses, snapshot.expenses)
        XCTAssertThrowsError(try BackupArchive.restore(produced, recoveryKey: BackupArchive.newRecoveryKey()))
        let attachment = XCTAttachment(data: produced, uniformTypeIdentifier: "public.data")
        attachment.name = "native-ios-v3-reexport.pennybackup"; attachment.lifetime = .keepAlways; add(attachment)
        let old = try BackupArchive.restore(file("native-exports/android-v2.pennybackup"), recoveryKey: key)
        XCTAssertEqual(old.schemaVersion, 3); XCTAssertEqual(old.attachments.count, 1); XCTAssertEqual(old.expenses.count, 1)
    }
    func testUnicodeBOMPreservedAndUnknownBOMKeysRejected() throws {
        var snapshot = try golden()
        snapshot.expenses[0].note = "\u{FEFF}original expense note"
        snapshot.incomeSources[0].description = "\u{FEFF}source description"
        let restored = try StrictJSON.snapshot(JSONEncoder().encode(snapshot))
        XCTAssertEqual(restored.expenses[0].note, snapshot.expenses[0].note)
        XCTAssertEqual(restored.incomeSources[0].description, snapshot.incomeSources[0].description)
        XCTAssertThrowsError(try StrictJSON.object(Data(#"{"note":"x","\uFEFFnote":"hidden"}"#.utf8), keys: ["note"]))
        let legacy = try XCTUnwrap(String(data: file("snapshot-v2.json"), encoding: .utf8)).replacingOccurrences(of: "Team lunch", with: "\u{FEFF}Team lunch")
        XCTAssertTrue(try StrictJSON.snapshot(Data(legacy.utf8)).expenses[0].note.hasPrefix("\u{FEFF}"))
    }
    func testAndroidRuntimeV3AllDomains() throws {
        let vector = try XCTUnwrap(try JSONSerialization.jsonObject(with: file("golden-vector-v3.json")) as? [String: Any])
        let key = try XCTUnwrap(vector["recoveryKey"] as? String)
        let result = try BackupArchive.restore(file("native-exports/android-v3.pennybackup"), recoveryKey: key)
        let expected = try golden()
        XCTAssertEqual(result.expenses.sorted { $0.id < $1.id }, expected.expenses.sorted { $0.id < $1.id })
        XCTAssertEqual(result.attachments, expected.attachments); XCTAssertEqual(result.budgets, expected.budgets)
        XCTAssertEqual(result.incomeSources, expected.incomeSources); XCTAssertEqual(result.incomeEntries, expected.incomeEntries)
        XCTAssertEqual(result.savingsGoals, expected.savingsGoals); XCTAssertEqual(result.savingsEntries, expected.savingsEntries)
        XCTAssertEqual(result.recurringExpenses, expected.recurringExpenses)
    }

    @MainActor func testRawMigrationFixtureRestoresAndReopensWithoutInventingIncome() throws {
        let manifest = try XCTUnwrap(try JSONSerialization.jsonObject(with: file("raw-migration-v1/fixture-manifest.json")) as? [String: Any])
        let recoveryKey = try XCTUnwrap(manifest["recoveryKey"] as? String)
        let expected = try StrictJSON.snapshot(file("raw-migration-v1/positive.snapshot.json"))
        let imported = try BackupArchive.restore(file("raw-migration-v1/positive.pennybackup"), recoveryKey: recoveryKey)
        XCTAssertEqual(imported.expenses, expected.expenses); XCTAssertEqual(imported.attachments, expected.attachments)
        XCTAssertEqual(imported.budgets, expected.budgets); XCTAssertEqual(imported.incomeSources, expected.incomeSources)
        XCTAssertEqual(imported.vaultId, expected.vaultId); XCTAssertEqual(imported.snapshotId, expected.snapshotId)
        XCTAssertEqual(imported.createdAt, expected.createdAt)
        XCTAssertEqual(imported.expenses.first?.amountMinor, 1234)
        XCTAssertEqual(imported.expenses.first?.expenseDate, "2026-09-12")
        XCTAssertEqual(imported.expenses.first?.description, "Public description")
        XCTAssertEqual(imported.expenses.first?.note, "Separate public note")
        XCTAssertEqual(imported.budgets.first?.alertThresholdBps, 8050)
        XCTAssertEqual(imported.incomeSources.first?.grossMinor, 100000)
        XCTAssertEqual(imported.incomeSources.first?.netMinor, 80000)
        XCTAssertTrue(imported.incomeEntries.isEmpty && imported.savingsGoals.isEmpty && imported.savingsEntries.isEmpty && imported.recurringExpenses.isEmpty)
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: directory) }
        let deviceKey = SymmetricKey(size: .bits256)
        let store = VaultStore(directory: directory, key: deviceKey)
        try store.restore(imported)
        let reopened = VaultStore(directory: directory, key: deviceKey)
        XCTAssertTrue(reopened.isReady)
        XCTAssertEqual(reopened.snapshot.expenses, expected.expenses); XCTAssertEqual(reopened.snapshot.attachments, expected.attachments)
        XCTAssertEqual(reopened.snapshot.budgets, expected.budgets); XCTAssertEqual(reopened.snapshot.incomeSources, expected.incomeSources)
        let report = FinanceEngine.report(reopened.snapshot, month: "2026-09")
        XCTAssertEqual(report.expenses, 1234); XCTAssertEqual(report.received, 0)
    }

    @MainActor func testRawMigrationAuthenticatedInvalidImageCannotReplaceVault() throws {
        let manifest = try XCTUnwrap(try JSONSerialization.jsonObject(with: file("raw-migration-v1/fixture-manifest.json")) as? [String: Any])
        let recoveryKey = try XCTUnwrap(manifest["recoveryKey"] as? String)
        let good = try BackupArchive.restore(file("raw-migration-v1/positive.pennybackup"), recoveryKey: recoveryKey)
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: directory) }
        let deviceKey = SymmetricKey(size: .bits256)
        let store = VaultStore(directory: directory, key: deviceKey); try store.restore(good)
        let revision = store.revision
        XCTAssertThrowsError(try store.restore(BackupArchive.restore(file("raw-migration-v1/invalid-image.pennybackup"), recoveryKey: recoveryKey)))
        XCTAssertEqual(store.revision, revision)
        let reopened = VaultStore(directory: directory, key: deviceKey)
        XCTAssertTrue(reopened.isReady); XCTAssertEqual(reopened.revision, revision)
        XCTAssertEqual(reopened.snapshot.expenses, good.expenses); XCTAssertEqual(reopened.snapshot.attachments, good.attachments)
        XCTAssertEqual(reopened.snapshot.budgets, good.budgets); XCTAssertEqual(reopened.snapshot.incomeSources, good.incomeSources)
    }

}
