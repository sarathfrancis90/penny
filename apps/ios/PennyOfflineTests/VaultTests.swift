import CryptoKit
import XCTest
import UIKit
@testable import PennyOffline

final class VaultTests: XCTestCase {
    func testSharedPNGIntegrityAdmissionPreservesOnlyValidOriginalBytes() throws {
        struct Corpus: Decodable {
            struct Item: Decodable {
                let id: String, valid: Bool, byteCount: Int, sha256: String, dataBase64: String
            }
            let version: Int, cases: [Item]
        }
        let source = try XCTUnwrap(Bundle(for: Self.self).resourceURL).appendingPathComponent("fixtures/png-integrity-corpus.json")
        let corpus = try JSONDecoder().decode(Corpus.self, from: Data(contentsOf: source))
        XCTAssertEqual(corpus.version, 1)
        XCTAssertGreaterThanOrEqual(corpus.cases.count, 10)
        let owner = UUID().uuidString.lowercased()
        for item in corpus.cases {
            let bytes = try XCTUnwrap(Data(base64Encoded: item.dataBase64), item.id)
            XCTAssertEqual(bytes.count, item.byteCount, item.id)
            if item.valid {
                do {
                    let attachment = try ReceiptAttachment(data: bytes, expenseId: owner)
                    XCTAssertEqual(try attachment.bytes(), bytes, item.id)
                    XCTAssertEqual(attachment.dataBase64, item.dataBase64, item.id)
                    XCTAssertEqual(attachment.sha256, item.sha256, item.id)
                    let prepared = try ReceiptPreparation.prepare(bytes)
                    XCTAssertEqual(prepared.data, bytes, item.id)
                    XCTAssertFalse(prepared.optimized, item.id)
                } catch { XCTFail("Valid PNG rejected: \(item.id): \(error)") }
            } else {
                XCTAssertThrowsError(try ReceiptAttachment(data: bytes, expenseId: owner), "Malformed PNG admitted: \(item.id)")
                XCTAssertThrowsError(try ReceiptPreparation.prepare(bytes), "Malformed PNG converted: \(item.id)")
            }
        }
    }
    func fixture() throws -> Expense {
        try Expense(merchant: "Local Coffee", amountMinor: 1_025, expenseDate: "2026-09-13", category: "Meals and entertainment")
    }
    func testExactMoneyAndCivilDates() throws {
        XCTAssertEqual(try Money.parse("0.29"), 29)
        XCTAssertEqual(try Money.parse("12,34"), 1_234)
        XCTAssertEqual(try Money.parse("999999999.99"), Money.maximumMinor)
        for bad in ["0", "-1", "1.005", "1,234.50", "NaN", "1e6", "1000000000"] { XCTAssertThrowsError(try Money.parse(bad), bad) }
        XCTAssertNotNil(CivilDate.date("2024-02-29"))
        XCTAssertNil(CivilDate.date("2026-02-29"))
        XCTAssertNil(CivilDate.date("2026-02-30"))
        XCTAssertFalse(CivilDate.validTimestamp("2026-02-30T00:00:00.000Z"))
    }
    func testLocalVaultCapacityAlwaysFitsBackupEnvelope() throws {
        let limit = BackupArchive.maximumExportablePlaintextBytes
        XCTAssertNoThrow(try BackupArchive.validateExportCapacity(limit))
        XCTAssertThrowsError(try BackupArchive.validateExportCapacity(limit + 1))
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.withoutEscapingSlashes]
        // All-slash base64 catches accidental JSON slash escaping near the cap.
        let envelope = BackupEnvelope(formatVersion: 1, algorithm: "AES-256-GCM",
            nonce: Data(repeating: 255, count: 12).base64EncodedString(),
            ciphertext: Data(repeating: 255, count: limit).base64EncodedString(),
            tag: Data(repeating: 255, count: 16).base64EncodedString())
        XCTAssertLessThanOrEqual(try encoder.encode(envelope).count, BackupArchive.maximumEnvelopeBytes)
    }
    func testCipherAuthenticationAndNoPlaintext() throws {
        let key = SymmetricKey(size: .bits256)
        let clear = Data("private merchant 1025".utf8)
        let cipher = try VaultCipher.seal(clear, key: key)
        XCTAssertNil(cipher.range(of: clear))
        XCTAssertEqual(try VaultCipher.open(cipher, key: key), clear)
        XCTAssertThrowsError(try VaultCipher.open(cipher, key: SymmetricKey(size: .bits256)))
        var tampered = cipher; tampered[tampered.count - 1] ^= 1
        XCTAssertThrowsError(try VaultCipher.open(tampered, key: key))
    }
    @MainActor func testPersistenceEditDeleteAndFailedOpenPreservesFile() throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: directory) }
        let key = SymmetricKey(size: .bits256)
        let first = VaultStore(directory: directory, key: key)
        let expense = try fixture()
        try first.save(expense)
        let reopened = VaultStore(directory: directory, key: key)
        XCTAssertEqual(reopened.expenses, [expense])
        var edited = expense; edited.amountMinor = 1_200
        try reopened.save(edited)
        XCTAssertEqual(VaultStore(directory: directory, key: key).expenses.first?.amountMinor, 1_200)
        let file = directory.appendingPathComponent("PennyOffline/vault-v1.pennyvault")
        let before = try Data(contentsOf: file)
        let blocked = VaultStore(directory: directory, key: SymmetricKey(size: .bits256))
        XCTAssertFalse(blocked.isReady)
        XCTAssertThrowsError(try blocked.save(expense))
        XCTAssertEqual(before, try Data(contentsOf: file))
        try reopened.delete(expense.id)
        XCTAssertTrue(VaultStore(directory: directory, key: key).expenses.isEmpty)
    }
    func testBackupRoundtripWrongKeyAndInvalidSnapshot() throws {
        var snapshot = VaultSnapshot(); snapshot.expenses = [try fixture()]
        let key = BackupArchive.newRecoveryKey()
        let backup = try BackupArchive.export(snapshot, recoveryKey: key)
        XCTAssertEqual(try BackupArchive.restore(backup, recoveryKey: key).expenses, snapshot.expenses)
        XCTAssertThrowsError(try BackupArchive.restore(backup, recoveryKey: BackupArchive.newRecoveryKey()))
        snapshot.expenses.append(snapshot.expenses[0])
        XCTAssertThrowsError(try BackupArchive.export(snapshot, recoveryKey: key))
    }
    func testSharedGoldenBackup() throws {
        let source = try XCTUnwrap(Bundle(for: Self.self).resourceURL).appendingPathComponent("fixtures")
        let vector = try XCTUnwrap(try JSONSerialization.jsonObject(with: Data(contentsOf: source.appendingPathComponent("golden-vector.json"))) as? [String: Any])
        let key = try XCTUnwrap(vector["recoveryKey"] as? String)
        let result = try BackupArchive.restore(Data(contentsOf: source.appendingPathComponent("backup-v1.pennybackup")), recoveryKey: key)
        XCTAssertEqual(result.expenses.count, 1)
        XCTAssertEqual(result.expenses.first?.amountMinor, 1_234)
        let export = try BackupArchive.export(result, recoveryKey: key)
        let attachment = XCTAttachment(data: export, uniformTypeIdentifier: "public.data")
        attachment.name = "native-ios-reexport.pennybackup"
        attachment.lifetime = .keepAlways
        add(attachment)
    }
    func testStrictFastPathUnicodeDepthAndClosedSchedule() throws {
        let raw = Data("{\"note\":\"\u{FEFF}value\",\"\u{FEFF}note\":\"distinct\"}".utf8)
        let values = try StrictJSON.object(raw, keys: ["note", "\u{FEFF}note"])
        XCTAssertEqual(values["note"] as? String, "\u{FEFF}value")
        XCTAssertEqual(values["\u{FEFF}note"] as? String, "distinct")
        for invalid: [UInt8] in [[0xc0, 0xaf], [0xed, 0xa0, 0x80], [0xf0, 0x9f, 0x92], [0xff], [0], [0x1f], [0x0a]] {
            let bytes = Data("{\"note\":\"".utf8) + Data(invalid) + Data("\"}".utf8)
            XCTAssertThrowsError(try StrictJSON.object(bytes, keys: ["note"]))
        }
        XCTAssertThrowsError(try StrictJSON.object(Data(#"{"note":1,"\u006eote":2}"#.utf8), keys: ["note"]))
        let deep = "{\"note\":" + String(repeating: "[", count: 33) + "0" + String(repeating: "]", count: 33) + "}"
        XCTAssertThrowsError(try StrictJSON.object(Data(deep.utf8), keys: ["note"]))
        var snapshot = try XCTUnwrap(try JSONSerialization.jsonObject(with: sharedFile("snapshot-v3.json")) as? [String: Any])
        var sources = try XCTUnwrap(snapshot["incomeSources"] as? [[String: Any]])
        var schedule = try XCTUnwrap(sources[0]["schedule"] as? [String: Any]); schedule["future"] = 1
        sources[0]["schedule"] = schedule; snapshot["incomeSources"] = sources
        XCTAssertThrowsError(try StrictJSON.snapshot(JSONSerialization.data(withJSONObject: snapshot)))
        let original = try sharedFile("snapshot-v3.json")
        let text = try XCTUnwrap(String(validating: original, as: UTF8.self))
        let alias = text.replacingOccurrences(of: "\"schemaVersion\": 3", with: "\"schemaVersion\": 3, \"\\u0073chemaVersion\": 3")
        XCTAssertNotEqual(alias, text)
        XCTAssertThrowsError(try StrictJSON.snapshot(Data(alias.utf8)))
    }
    func testStrictJSONRejectsUnknownAndDuplicateMembers() throws {
        let snapshot = try JSONEncoder().encode(VaultSnapshot())
        var object = try XCTUnwrap(try JSONSerialization.jsonObject(with: snapshot) as? [String: Any])
        object["futureIncome"] = ["would": "be lost"]
        XCTAssertThrowsError(try StrictJSON.snapshot(JSONSerialization.data(withJSONObject: object)))
        XCTAssertThrowsError(try StrictJSON.object(Data(#"{"a":1,"a":2}"#.utf8), keys: ["a"]))
        XCTAssertThrowsError(try StrictJSON.object(Data(#"{"a":1,"\u0061":2}"#.utf8), keys: ["a"]))
        XCTAssertThrowsError(try StrictJSON.object(Data(#"{"a":1} garbage"#.utf8), keys: ["a"]))
        XCTAssertNoThrow(try StrictJSON.snapshot(snapshot))
    }
    @MainActor func testVerifiedRestoreRecoversUnreadableVault() throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: directory) }
        let old = VaultStore(directory: directory, key: SymmetricKey(size: .bits256))
        try old.save(fixture())
        let newKey = SymmetricKey(size: .bits256)
        let recovery = VaultStore(directory: directory, key: newKey)
        XCTAssertFalse(recovery.isReady)
        var snapshot = VaultSnapshot(); snapshot.expenses = [try fixture()]
        let backupKey = BackupArchive.newRecoveryKey()
        let verified = try BackupArchive.restore(BackupArchive.export(snapshot, recoveryKey: backupKey), recoveryKey: backupKey)
        try recovery.restore(verified)
        XCTAssertTrue(recovery.isReady)
        XCTAssertEqual(VaultStore(directory: directory, key: newKey).expenses, snapshot.expenses)
    }
    @MainActor func testVisionReadsReceiptTextOnDevice() async throws {
        let image = UIGraphicsImageRenderer(size: CGSize(width: 1_000, height: 500)).image { context in
            UIColor.white.setFill(); context.fill(CGRect(x: 0, y: 0, width: 1_000, height: 500))
            ("PENNY CAFE\nTOTAL CAD 12.34" as NSString).draw(at: CGPoint(x: 60, y: 80), withAttributes: [.font: UIFont.systemFont(ofSize: 60), .foregroundColor: UIColor.black])
        }
        let result = try await LocalAssistant.recognize(XCTUnwrap(image.pngData()))
        XCTAssertTrue(result.contains("PENNY CAFE"), result)
        XCTAssertTrue(result.contains("12.34"), result)
    }
    private func sharedFile(_ name: String) throws -> Data {
        let source = try XCTUnwrap(Bundle(for: Self.self).resourceURL).appendingPathComponent("fixtures")
        return try Data(contentsOf: source.appendingPathComponent(name))
    }
    func testReceiptGoldenV2AndSharedRejections() throws {
        let vector = try XCTUnwrap(try JSONSerialization.jsonObject(with: sharedFile("golden-vector-v2.json")) as? [String: Any])
        let key = try XCTUnwrap(vector["recoveryKey"] as? String)
        let restored = try BackupArchive.restore(sharedFile("backup-v2.pennybackup"), recoveryKey: key)
        XCTAssertEqual(restored.schemaVersion, 3)
        XCTAssertEqual(restored.attachments.count, 1)
        XCTAssertEqual(try restored.attachments[0].bytes(), try sharedFile("receipt.png"))
        let export = try BackupArchive.export(restored, recoveryKey: key)
        let attachment = XCTAttachment(data: export, uniformTypeIdentifier: "public.data")
        attachment.name = "native-ios-v2-reexport.pennybackup"; attachment.lifetime = .keepAlways; add(attachment)
        let conformance = try XCTUnwrap(try JSONSerialization.jsonObject(with: sharedFile("conformance-v2.json")) as? [String: Any])
        let mutations = try XCTUnwrap(conformance["attachmentMutations"] as? [[String: Any]])
        let strictFailures = try XCTUnwrap(conformance["strictJsonFailures"] as? [String])
        for invalid in strictFailures { XCTAssertThrowsError(try StrictJSON.object(Data(invalid.utf8), keys: ["note"])) }
        XCTAssertNoThrow(try StrictJSON.object(Data(#"{"note":"\ud83d\ude00"}"#.utf8), keys: ["note"]))
        let original = try XCTUnwrap(try JSONSerialization.jsonObject(with: sharedFile("snapshot-v2.json")) as? [String: Any])
        for mutation in mutations {
            var candidate = original
            var receipts = try XCTUnwrap(candidate["attachments"] as? [[String: Any]])
            receipts[0][try XCTUnwrap(mutation["field"] as? String)] = mutation["value"]
            candidate["attachments"] = receipts
            XCTAssertThrowsError(try StrictJSON.snapshot(JSONSerialization.data(withJSONObject: candidate)), mutation["name"] as? String ?? "")
        }
        var duplicate = restored; duplicate.attachments += restored.attachments
        XCTAssertThrowsError(try duplicate.validate())
        var future = restored; future.schemaVersion = 4
        XCTAssertThrowsError(try future.validate())
        var tooMany = restored; tooMany.attachments = Array(repeating: restored.attachments[0], count: 101)
        XCTAssertThrowsError(try tooMany.validate())
        for imageFailure in try XCTUnwrap(conformance["imageFailures"] as? [[String: Any]]) {
            var candidate = original
            candidate["attachments"] = [try XCTUnwrap(imageFailure["attachment"])]
            XCTAssertThrowsError(try StrictJSON.snapshot(JSONSerialization.data(withJSONObject: candidate)))
        }
        let old = try StrictJSON.snapshot(sharedFile("snapshot-v1.json"))
        XCTAssertEqual(old.schemaVersion, 3); XCTAssertTrue(old.attachments.isEmpty)
        XCTAssertEqual(old.expenses, restored.expenses)
    }
    @MainActor func testOriginalReceiptPersistenceBackupRestoreAndDeletion() throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: directory) }
        let key = SymmetricKey(size: .bits256)
        let store = VaultStore(directory: directory, key: key)
        let expense = try fixture()
        let bytes = try sharedFile("receipt.png")
        let receipt = try ReceiptAttachment(data: bytes, expenseId: expense.id)
        try store.save(expense, attachments: [receipt])
        let file = directory.appendingPathComponent("PennyOffline/vault-v1.pennyvault")
        let encrypted = try Data(contentsOf: file)
        XCTAssertNil(encrypted.range(of: bytes))
        XCTAssertNil(encrypted.range(of: Data(receipt.dataBase64.utf8)))
        let reopened = VaultStore(directory: directory, key: key)
        XCTAssertEqual(reopened.receipts(for: expense.id), [receipt])
        let backupKey = BackupArchive.newRecoveryKey()
        let backup = try BackupArchive.export(reopened.snapshot, recoveryKey: backupKey)
        let verified = try BackupArchive.restore(backup, recoveryKey: backupKey)
        XCTAssertEqual(verified.attachments, [receipt])
        let before = try Data(contentsOf: file)
        XCTAssertThrowsError(try BackupArchive.restore(backup, recoveryKey: BackupArchive.newRecoveryKey()))
        XCTAssertEqual(try Data(contentsOf: file), before)
        try reopened.save(expense, attachments: [])
        XCTAssertTrue(VaultStore(directory: directory, key: key).snapshot.attachments.isEmpty)
        try reopened.restore(verified)
        XCTAssertEqual(try VaultStore(directory: directory, key: key).snapshot.attachments[0].bytes(), bytes)
        try reopened.delete(expense.id)
        let deleted = VaultStore(directory: directory, key: key)
        XCTAssertTrue(deleted.expenses.isEmpty); XCTAssertTrue(deleted.snapshot.attachments.isEmpty)
    }
    @MainActor func testReceiptDecoderAndCapacityRefusal() throws {
        let owner = UUID().uuidString.lowercased()
        XCTAssertThrowsError(try ReceiptAttachment(data: Data(repeating: 0, count: ReceiptAttachment.maximumBytes + 1), expenseId: owner))
        XCTAssertThrowsError(try ReceiptAttachment(data: Data([0xff, 0xd8, 0xff, 0xd9]), expenseId: owner))
        let format = UIGraphicsImageRendererFormat(); format.scale = 1
        let oversized = UIGraphicsImageRenderer(size: CGSize(width: 4_097, height: 1), format: format).image { _ in }
        XCTAssertThrowsError(try ReceiptAttachment(data: XCTUnwrap(oversized.pngData()), expenseId: owner))
        let jpeg = UIGraphicsImageRenderer(size: CGSize(width: 32, height: 32), format: format).image { _ in }.jpegData(compressionQuality: 1)
        XCTAssertNoThrow(try ReceiptAttachment(data: XCTUnwrap(jpeg), expenseId: owner))
    }
    @MainActor func testFailedCommitPreservesCompletePreviousGeneration() throws {
        enum SimulatedFailure: Error { case diskFull }
        for failureStage in [VaultStore.CommitStage.staged, .rollbackSaved, .committed] {
            let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
            defer { try? FileManager.default.removeItem(at: directory) }
            let key = SymmetricKey(size: .bits256)
            let store = VaultStore(directory: directory, key: key)
            let expense = try fixture()
            let receipt = try ReceiptAttachment(data: sharedFile("receipt.png"), expenseId: expense.id)
            try store.save(expense, attachments: [receipt])
            let original = store.snapshot
            let blocked = VaultStore(directory: directory, key: key, commitCheckpoint: { stage in
                if stage == failureStage { throw SimulatedFailure.diskFull }
            })
            XCTAssertThrowsError(try blocked.restore(VaultSnapshot()))
            XCTAssertEqual(blocked.snapshot.attachments, original.attachments)
            let reopened = VaultStore(directory: directory, key: key)
            XCTAssertEqual(reopened.expenses, original.expenses)
            XCTAssertEqual(reopened.snapshot.attachments, original.attachments)
        }
    }

    func testCivilDatesAcrossTimezonesAndGregorianCutover() throws {
        let original = NSTimeZone.default
        defer { NSTimeZone.default = original }
        for zone in ["Pacific/Apia", "America/Toronto", "Asia/Kolkata"] {
            NSTimeZone.default = try XCTUnwrap(TimeZone(identifier: zone))
            for civil in ["0001-01-01", "9999-12-31", "1582-10-10", "2011-12-30", "2000-02-29"] {
                XCTAssertTrue(CivilDate.validDate(civil))
                var expense = try fixture(); expense.expenseDate = civil
                XCTAssertNoThrow(try expense.validate())
            }
            XCTAssertNotNil(CivilDate.date("2011-12-30"))
            XCTAssertFalse(CivilDate.validDate("1500-02-29"))
            XCTAssertFalse(CivilDate.validTimestamp("1500-02-29T00:00:00.000Z"))
            XCTAssertFalse(CivilDate.validTimestamp("2026-01-01T24:00:00.000Z"))
            XCTAssertTrue(CivilDate.validTimestamp("1582-10-10T00:00:00.000Z"))
            XCTAssertFalse(CivilDate.validDate("0000-01-01"))
        }
    }
    @MainActor func testStaleRestorePreviewCannotOverwriteNewExpense() throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: directory) }
        let store = VaultStore(directory: directory, key: SymmetricKey(size: .bits256))
        let revision = store.revision
        let expense = try fixture(); try store.save(expense)
        XCTAssertThrowsError(try store.restore(VaultSnapshot(), expectedRevision: revision))
        XCTAssertEqual(store.expenses, [expense])
    }
    func testAndroidProducedReceiptBackup() throws {
        let vector = try XCTUnwrap(try JSONSerialization.jsonObject(with: sharedFile("golden-vector-v2.json")) as? [String: Any])
        let key = try XCTUnwrap(vector["recoveryKey"] as? String)
        let android = try BackupArchive.restore(sharedFile("native-exports/android-v2.pennybackup"), recoveryKey: key)
        let golden = try StrictJSON.snapshot(sharedFile("snapshot-v2.json"))
        XCTAssertEqual(android.expenses, golden.expenses)
        XCTAssertEqual(android.attachments, golden.attachments)
    }

}
