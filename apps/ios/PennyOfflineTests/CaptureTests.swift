import AVFoundation
import CryptoKit
import FoundationModels
import ImageIO
import Network
import Security
import Synchronization
import UIKit
import UniformTypeIdentifiers
import XCTest
@testable import PennyOffline

final class CaptureTests: XCTestCase {
    private func file(_ name: String) throws -> Data { try Data(contentsOf: XCTUnwrap(Bundle(for: Self.self).resourceURL).appendingPathComponent("fixtures/" + name)) }
    private let publicKey = "pny1-" + String(repeating: "01", count: 32)
    @MainActor func testActualModelAvailabilityPreservesDeterministicReceiptFallback() async throws {
        let monitor = NWPathMonitor(), received = XCTestExpectation(description: "First observed network path")
        let firstStatus = Mutex<String?>(nil)
        monitor.pathUpdateHandler = { path in
            let status: String
            switch path.status {
            case .satisfied: status = "satisfied"
            case .unsatisfied: status = "unsatisfied"
            case .requiresConnection: status = "requiresConnection"
            @unknown default: status = "unknown"
            }
            let first = firstStatus.withLock { value in
                guard value == nil else { return false }; value = status; return true
            }
            if first { received.fulfill() }
        }
        monitor.start(queue: DispatchQueue(label: "ca.penny.offline.tests.path-observation"))
        defer { monitor.cancel() }
        let wait = await XCTWaiter.fulfillment(of: [received], timeout: 5)
        monitor.cancel()
        let status = firstStatus.withLock { $0 } ?? "callbackTimedOut"
        let expectsOffline = ProcessInfo.processInfo.environment["PENNY_EXPECT_OFFLINE"] == "1"
        let pathAttachment = XCTAttachment(string: "pathStatus=\(status); expectsOffline=\(expectsOffline); passive observation only; no network probe")
        pathAttachment.name = "Actual network path"; pathAttachment.lifetime = .keepAlways; add(pathAttachment)
        XCTAssertEqual(wait, .completed, "No network path callback within five seconds")
        if expectsOffline { XCTAssertEqual(status, "unsatisfied", "Offline qualification requires an unsatisfied network path") }
        struct Entry: Decodable { let name: String; let locale: String; let input: String? }
        struct Corpus: Decodable { let cases: [Entry] }
        let corpus = try JSONDecoder().decode(Corpus.self, from: file("receipt-parser-corpus.json"))
        let fixture = try XCTUnwrap(corpus.cases.first { $0.name == "English explicit total" })
        let source = try XCTUnwrap(fixture.input)
        let parsed = try ReceiptParser.parse(source, locale: fixture.locale)
        XCTAssertEqual(parsed.merchant, "Café Toronto"); XCTAssertEqual(parsed.amountMinor, 1130)
        XCTAssertEqual(parsed.currencyCode, "CAD"); XCTAssertTrue(parsed.requiresReview)
        let availability = SystemLanguageModel.default.availability
        let diagnostic: String
        switch availability {
        case .available:
            diagnostic = "availability=available; inference not requested; inference quality not assessed"
        case .unavailable(let reason):
            diagnostic = "availability=unavailable; reason=\(String(describing: reason)); unavailable suggestion guard exercised"
        @unknown default:
            diagnostic = "availability=unknown; inference not requested"
        }
        let attachment = XCTAttachment(string: diagnostic)
        attachment.name = "Actual on-device model availability"; attachment.lifetime = .keepAlways; add(attachment)
        if case .unavailable = availability {
            do {
                _ = try await LocalAssistant.suggest(source, locale: fixture.locale)
                XCTFail("Unavailable model returned a suggestion")
            } catch LocalAssistant.AssistantError.unavailable {
                // The existing availability guard returns before session creation.
            } catch { XCTFail("Expected unavailable error, received \(error)") }
        }
        XCTAssertEqual(try ReceiptParser.parse(source, locale: fixture.locale), parsed)
    }
    func testAllSharedReceiptCorpusCases() throws {
        struct Repeat: Decodable { let value: String; let count: Int }
        struct Entry: Decodable {
            let name: String; let locale: String; let input: String?; let inputRepeat: Repeat?; let error: String?
            let merchant: String?; let amountMinor: Int64?; let reasons: [String]?; let merchantLineIndex: Int?; let totalLineIndex: Int?
        }
        struct Corpus: Decodable { let cases: [Entry] }
        let cases = try JSONDecoder().decode(Corpus.self, from: file("receipt-parser-corpus.json")).cases
        XCTAssertGreaterThanOrEqual(cases.count, 20)
        for entry in cases {
            let source = try entry.input ?? String(repeating: try XCTUnwrap(entry.inputRepeat).value, count: try XCTUnwrap(entry.inputRepeat).count)
            if let code = entry.error {
                XCTAssertThrowsError(try ReceiptParser.parse(source, locale: entry.locale), entry.name) { XCTAssertEqual(($0 as? ReceiptParser.Failure)?.code, code) }
                continue
            }
            let result = try ReceiptParser.parse(source, locale: entry.locale)
            XCTAssertEqual(result.sourceText, source, entry.name); XCTAssertEqual(result.parserVersion, 1); XCTAssertTrue(result.requiresReview)
            XCTAssertEqual(result.merchant, entry.merchant, entry.name); XCTAssertEqual(result.amountMinor, entry.amountMinor, entry.name)
            XCTAssertEqual(result.reasons, entry.reasons, entry.name); XCTAssertEqual(result.merchantLineIndex, entry.merchantLineIndex, entry.name)
            XCTAssertEqual(result.totalLineIndex, entry.totalLineIndex, entry.name); XCTAssertNil(result.category)
            XCTAssertEqual(result.currencyCode, entry.amountMinor == nil ? nil : "CAD")
        }
    }
    func testParserScalarLimitsOffsetsAndHostileModels() throws {
        let source = "\r\n Merchant: Cafe \r\nTOTAL CAD 20.00\r\n"
        let proposal = try ReceiptParser.parse(source, locale: "en-CA")
        _ = try StrictJSON.object(JSONEncoder().encode(proposal), keys: ["parserVersion", "locale", "sourceText", "merchant", "amountMinor", "currencyCode", "merchantLineIndex", "totalLineIndex", "category", "requiresReview", "reasons"])
        XCTAssertEqual(proposal.sourceText, source); XCTAssertEqual(proposal.merchantLineIndex, 1); XCTAssertEqual(proposal.totalLineIndex, 2)
        XCTAssertThrowsError(try ReceiptParser.parse(source, locale: "en-US"))
        XCTAssertEqual(try ReceiptParser.parse(String(repeating: "😀", count: 4000), locale: "en-CA").sourceText.unicodeScalars.count, 4000)
        XCTAssertThrowsError(try ReceiptParser.parse(String(repeating: "e\u{0301}", count: 2001), locale: "en-CA"))
        let good = ReceiptModelOutput(merchant: "Cafe", amountMinor: 2000, currencyCode: "CAD", category: "Meals and entertainment")
        XCTAssertTrue(try ReceiptParser.validateModel(source, locale: "en-CA", output: good).requiresReview)
        var wrong = good; wrong.amountMinor = 2500
        XCTAssertThrowsError(try ReceiptParser.validateModel(source, locale: "en-CA", output: wrong))
        wrong = good; wrong.merchant = "Invented"
        XCTAssertThrowsError(try ReceiptParser.validateModel(source, locale: "en-CA", output: wrong))
        wrong = good; wrong.category = "Dining"
        XCTAssertThrowsError(try ReceiptParser.validateModel(source, locale: "en-CA", output: wrong))
        XCTAssertThrowsError(try ReceiptParser.validateModel(source + "TOTAL CAD 25.00", locale: "en-CA", output: good))
        XCTAssertThrowsError(try ReceiptParser.validateModel("Cafe\nTotal USD 20.00", locale: "en-CA", output: good))
        XCTAssertThrowsError(try ReceiptParser.validateModelJSON(source, locale: "en-CA", data: Data(#"{"merchant":"Cafe","amountMinor":2000,"currencyCode":"CAD","category":null,"action":"save"}"#.utf8)))
        XCTAssertThrowsError(try ReceiptParser.validateModelJSON(source, locale: "en-CA", data: Data(#"{"merchant":null,"amountMinor":true,"currencyCode":"CAD","category":null}"#.utf8)))
        for marker in ["USD", "US $", "EUR", "€", "GBP", "£", "JPY", "¥", "INR", "₹"] {
            XCTAssertTrue(try ReceiptParser.parse("Cafe\nTOTAL \(marker)20.00", locale: "en-CA").reasons.contains("foreign_currency"), marker)
        }
    }
    @MainActor func testCancelledInferenceAndCameraFallback() async throws {
        let task = Task { try await LocalAssistant.suggest("Cafe\nTOTAL CAD 20.00", locale: "en-CA") }
        task.cancel()
        do { _ = try await task.value; XCTFail("Cancelled inference returned a proposal") } catch { XCTAssertTrue(error is CancellationError) }
        XCTAssertNotNil(ReceiptCameraAccess.message(status: .denied, available: true))
        XCTAssertNotNil(ReceiptCameraAccess.message(status: .restricted, available: true))
        XCTAssertNotNil(ReceiptCameraAccess.message(status: .authorized, available: false))
        XCTAssertNil(ReceiptCameraAccess.message(status: .authorized, available: true))
    }
    @MainActor func testImagePreparationPreservesOriginalAndReviewsHEICCopy() throws {
        let original = try file("receipt.png")
        let preserved = try ReceiptPreparation.prepare(original)
        XCTAssertFalse(preserved.optimized); XCTAssertEqual(preserved.data, original)
        let format = UIGraphicsImageRendererFormat(); format.scale = 1
        let image = UIGraphicsImageRenderer(size: CGSize(width: 128, height: 64), format: format).image { context in
            UIColor.white.setFill(); context.fill(CGRect(x: 0, y: 0, width: 128, height: 64))
            ("TOTAL CAD 20.00" as NSString).draw(at: CGPoint(x: 2, y: 10), withAttributes: [.font: UIFont.systemFont(ofSize: 12), .foregroundColor: UIColor.black])
        }
        let heic = NSMutableData()
        let destination = try XCTUnwrap(CGImageDestinationCreateWithData(heic, UTType.heic.identifier as CFString, 1, nil))
        CGImageDestinationAddImage(destination, try XCTUnwrap(image.cgImage), [kCGImagePropertyGPSDictionary: [kCGImagePropertyGPSLatitude: 43.0]] as CFDictionary)
        XCTAssertTrue(CGImageDestinationFinalize(destination))
        let syntheticImage = XCTAttachment(data: heic as Data, uniformTypeIdentifier: UTType.heic.identifier)
        syntheticImage.name = "synthetic-capture-review.heic"; syntheticImage.lifetime = .keepAlways; add(syntheticImage)
        let prepared = try ReceiptPreparation.prepare(heic as Data)
        XCTAssertTrue(prepared.optimized); XCTAssertTrue(prepared.data.starts(with: [0xff, 0xd8, 0xff]))
        _ = try ReceiptAttachment(data: prepared.data, expenseId: UUID().uuidString.lowercased())
        let imageSource = try XCTUnwrap(CGImageSourceCreateWithData(prepared.data as CFData, nil))
        let properties = try XCTUnwrap(CGImageSourceCopyPropertiesAtIndex(imageSource, 0, nil) as? [CFString: Any])
        XCTAssertNil(properties[kCGImagePropertyGPSDictionary])
        XCTAssertTrue(try ReceiptPreparation.camera(image).optimized)
        XCTAssertThrowsError(try ReceiptPreparation.prepare(Data(repeating: 0, count: ReceiptPreparation.maximumInputBytes + 1)))
        XCTAssertThrowsError(try ReceiptPreparation.prepare(Data("damaged image".utf8)))
    }
    @MainActor func testPNGIntegrityChecksCRCAndDistinctPreparationBounds() throws {
        var corrupted = try file("receipt.png")
        corrupted[29] ^= 1 // Damage the IHDR CRC without changing image dimensions.
        XCTAssertThrowsError(try ReceiptAttachment(data: corrupted, expenseId: UUID().uuidString.lowercased()))
        XCTAssertThrowsError(try ReceiptPreparation.prepare(corrupted))
        let format = UIGraphicsImageRendererFormat(); format.scale = 1; format.opaque = true
        let image = UIGraphicsImageRenderer(size: CGSize(width: 5_000, height: 1), format: format).image { context in
            UIColor.white.setFill(); context.fill(CGRect(x: 0, y: 0, width: 5_000, height: 1))
        }
        let original = try XCTUnwrap(image.pngData())
        XCTAssertThrowsError(try ReceiptAttachment(data: original, expenseId: UUID().uuidString.lowercased()))
        let prepared = try ReceiptPreparation.prepare(original)
        XCTAssertTrue(prepared.optimized)
        XCTAssertEqual(prepared.sourceByteCount, original.count)
        XCTAssertNoThrow(try ReceiptAttachment(data: prepared.data, expenseId: UUID().uuidString.lowercased()))
    }
    func testConfirmedRecoveryKeyIsDistinctDeviceOnlyAndMismatchDoesNotOverwrite() throws {
        let service = "ca.penny.offline.tests.recovery." + UUID().uuidString
        let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecAttrAccount as String: "portable-v1"]
        defer { SecItemDelete(query as CFDictionary) }
        XCTAssertNil(try RecoveryKeyStore.load(service: service))
        XCTAssertThrowsError(try RecoveryKeyStore.confirm(publicKey, reentry: publicKey + "0", service: service))
        XCTAssertNil(try RecoveryKeyStore.load(service: service))
        try RecoveryKeyStore.confirm(publicKey, reentry: publicKey, service: service)
        XCTAssertEqual(try RecoveryKeyStore.load(service: service), publicKey)
        XCTAssertThrowsError(try RecoveryKeyStore.confirm(BackupArchive.newRecoveryKey(), reentry: publicKey, service: service))
        XCTAssertEqual(try RecoveryKeyStore.load(service: service), publicKey)
        var attributesQuery = query; attributesQuery[kSecReturnAttributes as String] = true
        var attributes: CFTypeRef?; XCTAssertEqual(SecItemCopyMatching(attributesQuery as CFDictionary, &attributes), errSecSuccess)
        let found = try XCTUnwrap(attributes as? [String: Any])
        XCTAssertEqual(found[kSecAttrAccessible as String] as? String, kSecAttrAccessibleWhenUnlockedThisDeviceOnly as String)
        XCTAssertEqual(found[kSecAttrSynchronizable as String] as? Bool, false)
        XCTAssertNotEqual(RecoveryKeyStore.service, "ca.penny.offline.dev.vault")
        let next = BackupArchive.newRecoveryKey()
        XCTAssertThrowsError(try RecoveryKeyStore.confirm(next, reentry: next, service: service, verify: { nil }))
        XCTAssertEqual(try RecoveryKeyStore.load(service: service), publicKey)
    }
    func testExportStagingDestinationReadbackCancellationAndFailure() throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: directory) }
        let staging = directory.appendingPathComponent("protected")
        let snapshot = try StrictJSON.snapshot(file("snapshot-v3.json"))
        let export = try VerifiedBackupExport(snapshot: snapshot, recoveryKey: publicKey, directory: staging)
        let attrs = try FileManager.default.attributesOfItem(atPath: export.url.path)
        #if targetEnvironment(simulator)
        if let protection = attrs[.protectionKey] as? String { XCTAssertEqual(protection, FileProtectionType.complete.rawValue) }
        else {
            let limitation = XCTAttachment(string: "Simulator does not expose NSFileProtectionKey. The device build asserts complete file protection; physical lock-state evidence is still required.")
            limitation.name = "Simulator protection limitation"; limitation.lifetime = .keepAlways; add(limitation)
        }
        #else
        XCTAssertEqual(attrs[.protectionKey] as? String, FileProtectionType.complete.rawValue)
        #endif
        XCTAssertTrue(try XCTUnwrap(staging.resourceValues(forKeys: [.isExcludedFromBackupKey]).isExcludedFromBackup))
        XCTAssertThrowsError(try export.verifyDestination(export.url))
        let destination = try export.writeNewFile(in: directory)
        let lastGood = try Data(contentsOf: destination)
        XCTAssertThrowsError(try export.writeNewFile(in: directory))
        XCTAssertEqual(try Data(contentsOf: destination), lastGood)
        XCTAssertThrowsError(try export.writeNewFile(in: directory.appendingPathComponent("missing")))
        XCTAssertEqual(try Data(contentsOf: destination), lastGood)
        try export.verifyDestination(destination)
        XCTAssertEqual(try BackupArchive.restore(Data(contentsOf: destination), recoveryKey: publicKey).incomeEntries, snapshot.incomeEntries)
        let newer = try VerifiedBackupExport(snapshot: snapshot, recoveryKey: publicKey, directory: staging)
        let newerDestination = try newer.writeNewFile(in: directory)
        try Data("truncated".utf8).write(to: newerDestination)
        XCTAssertThrowsError(try newer.verifyDestination(newerDestination))
        XCTAssertEqual(try Data(contentsOf: destination), lastGood)
        newer.cancel()
        export.cancel(); XCTAssertFalse(FileManager.default.fileExists(atPath: export.url.path))
        XCTAssertThrowsError(try export.verifyDestination(destination))
        enum DiskFailure: Error { case full }
        XCTAssertThrowsError(try VerifiedBackupExport(snapshot: snapshot, recoveryKey: publicKey, directory: staging, checkpoint: { if $0 == .staged { throw DiskFailure.full } }))
        XCTAssertEqual(try FileManager.default.contentsOfDirectory(atPath: staging.path), [])
        let failed = try VerifiedBackupExport(snapshot: snapshot, recoveryKey: publicKey, directory: staging, checkpoint: { if $0 == .beforeDestinationVerification { throw DiskFailure.full } })
        XCTAssertThrowsError(try failed.verifyDestination(destination))
        failed.cancel()
    }
    @MainActor func testCategoryOnlyInferencePreservesManualCorrectionsOnFailureAndCancellation() async throws {
        let draft = ReceiptReviewDraft(); draft.merchant = "Corrected Cafe"; draft.amount = "25.00"
        let source = "Cafe\nTOTAL CAD 20.00"
        let proposal = try ReceiptParser.validateModel(source, locale: "en-CA", output: ReceiptModelOutput(merchant: "Cafe", amountMinor: 2000, currencyCode: "CAD", category: "Meals and entertainment"))
        _ = try await draft.suggestCategory(source: source, locale: "en-CA") { proposal }
        XCTAssertEqual(draft.merchant, "Corrected Cafe"); XCTAssertEqual(draft.amount, "25.00")
        enum InferenceFailure: Error { case invalid }
        do { _ = try await draft.suggestCategory(source: source, locale: "en-CA") { throw InferenceFailure.invalid }; XCTFail() } catch {}
        XCTAssertEqual(draft.merchant, "Corrected Cafe"); XCTAssertEqual(draft.amount, "25.00")
        let cancelled = Task { try await draft.suggestCategory(source: source, locale: "en-CA") { proposal } }
        cancelled.cancel()
        do { _ = try await cancelled.value; XCTFail() } catch { XCTAssertTrue(error is CancellationError) }
        XCTAssertEqual(draft.merchant, "Corrected Cafe"); XCTAssertEqual(draft.amount, "25.00")
        draft.category = Categories.other
        let ignored = try await draft.suggestCategory(source: source, locale: "en-CA") { draft.cancelCategory(); return proposal }
        XCTAssertNil(ignored); XCTAssertEqual(draft.category, Categories.other)
    }

}
