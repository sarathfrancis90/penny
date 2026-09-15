import XCTest

@MainActor final class CaptureFlowTests: XCTestCase {
    func testActualAvailabilityMessageAndManualEditorRemainUsable() {
        let app = XCUIApplication(); app.launchArguments = ["--uitesting", "--reset-vault"]; app.launch()
        app.buttons["Vault"].tap()
        let messages = [
            "Apple Intelligence is ready on this device.",
            "This device does not support Apple Intelligence. Receipt text recognition and manual entry still work offline.",
            "Enable Apple Intelligence in Settings to use text suggestions. Manual entry and receipt text recognition work offline.",
            "Apple's on-device model is not ready. It may need its initial download. Manual entry and receipt text recognition work offline.",
            "On-device text suggestions are unavailable. You can still add expenses manually."
        ]
        let message = app.staticTexts.matching(NSPredicate(format: "label IN %@", messages)).firstMatch
        // Scroll only the QA app. No Settings, camera, Photos or model request.
        for _ in 0..<6 {
            if message.exists && message.isHittable && app.frame.contains(message.frame) { break }
            app.swipeUp()
        }
        guard message.exists, message.isHittable, app.frame.contains(message.frame), message.frame.height > 0 else {
            XCTFail("The complete model-availability message is not visible in Vault"); return
        }
        let text = XCTAttachment(string: message.label)
        text.name = "Actual availability accessibility text"; text.lifetime = .keepAlways; add(text)
        let screenshot = XCTAttachment(screenshot: app.screenshot())
        screenshot.name = "Actual availability visible in Vault"; screenshot.lifetime = .keepAlways; add(screenshot)
        app.buttons["Expenses"].tap(); app.buttons["addExpense"].tap()
        let merchant = app.textFields["merchantField"]
        XCTAssertTrue(merchant.waitForExistence(timeout: 5)); merchant.tap(); merchant.typeText("Manual Availability Check")
        let amount = app.textFields["amountField"]; amount.tap(); amount.typeText("7.00")
        XCTAssertTrue(app.buttons["saveExpense"].isEnabled)
        app.buttons["Cancel"].tap()
        XCTAssertTrue(app.staticTexts["A fresh start"].waitForExistence(timeout: 5))
        XCTAssertFalse(app.buttons["expense-Manual Availability Check"].exists)
    }
    func testReceiptDraftRequiresReviewAndCameraFallbackPreservesManualEntry() {
        let app = XCUIApplication(); app.launchArguments = ["--uitesting", "--reset-vault"]; app.launch()
        app.buttons["addExpense"].tap(); app.buttons["Capture on device"].tap()
        app.buttons["receiptLocale"].tap(); app.buttons["English (Canada)"].tap()
        let source = app.textFields["receiptSource"]
        XCTAssertTrue(source.waitForExistence(timeout: 5)); source.tap(); source.typeText("Merchant: Corpus Cafe\nTOTAL CAD 20.00")
        app.buttons["parseReceipt"].tap()
        XCTAssertEqual(app.textFields["merchantField"].value as? String, "Corpus Cafe")
        XCTAssertEqual(app.textFields["amountField"].value as? String, "20.00")
        app.buttons["Cancel"].tap()
        XCTAssertFalse(app.buttons["expense-Corpus Cafe"].exists)
        app.buttons["addExpense"].tap()
        let merchant = app.textFields["merchantField"]; merchant.tap(); merchant.typeText("Manual Fallback")
        let amount = app.textFields["amountField"]; amount.tap(); amount.typeText("7.00")
        app.swipeUp()
        let camera = app.buttons["captureReceiptCamera"]
        XCTAssertTrue(camera.waitForExistence(timeout: 5)); camera.tap()
        let error = app.staticTexts["formError"]
        XCTAssertTrue(error.waitForExistence(timeout: 5)); XCTAssertTrue(error.label.contains("camera is unavailable"))
        app.buttons["saveExpense"].tap()
        XCTAssertTrue(app.buttons["expense-Manual Fallback"].waitForExistence(timeout: 5))
        app.terminate(); app.launchArguments = ["--uitesting"]; app.launch()
        XCTAssertTrue(app.buttons["expense-Manual Fallback"].waitForExistence(timeout: 5))
    }
    func testFullRecoveryKeyReentryAndExportCancellation() {
        let app = XCUIApplication(); app.launchArguments = ["--uitesting", "--reset-vault"]; app.launch(); app.buttons["Vault"].tap()
        let setup = app.buttons.matching(NSPredicate(format: "label == 'Set up a recovery key' OR label == 'Set up a different recovery key'")).firstMatch
        XCTAssertTrue(setup.waitForExistence(timeout: 5)); setup.tap()
        let key = "pny1-" + String(repeating: "01", count: 32) // public synthetic test key
        let candidate = app.secureTextFields["recoveryCandidate"]; candidate.tap(); candidate.typeText(key)
        let reentry = app.secureTextFields["recoveryReentry"]
        reentry.tap(); reentry.typeText("wrong")
        app.buttons["confirmRecoveryKey"].tap()
        XCTAssertTrue(app.alerts["Vault action failed"].waitForExistence(timeout: 5)); app.alerts.buttons["OK"].tap()
        reentry.tap(); reentry.typeText(String(repeating: XCUIKeyboardKey.delete.rawValue, count: 5) + key)
        app.buttons["confirmRecoveryKey"].tap()
        let save = app.buttons["saveEncryptedBackup"]
        XCTAssertTrue(save.waitForExistence(timeout: 5)); XCTAssertTrue(save.isEnabled); save.tap()
        // Files runs in a remote service; wait for its own navigation surface,
        // then select its observed navigation button or host accessibility overlay.
        let filesNavigation = app.navigationBars["FullDocumentManagerViewControllerNavigationBar"]
        guard filesNavigation.waitForExistence(timeout: 30) else {
            XCTFail("Files folder picker did not become ready"); return
        }
        // Files can restore a nested folder, whose toolbar offers Open and Back.
        // Return through actual parent controls until its visible Cancel appears.
        let cancel = filesNavigation.buttons["Cancel"]
        for _ in 0..<4 {
            if cancel.exists && cancel.isHittable { break }
            let back = filesNavigation.buttons["BackButton"]
            guard back.exists, back.isHittable else { break }
            back.tap()
        }
        guard cancel.waitForExistence(timeout: 5), cancel.isHittable else {
            XCTFail("Files folder picker has no hittable Cancel control"); return
        }
        cancel.tap()
        XCTAssertTrue(app.staticTexts["Export cancelled. Your local vault is unchanged."].waitForExistence(timeout: 5))
        XCTAssertFalse(filesNavigation.exists)
        app.terminate(); app.launchArguments = ["--uitesting"]; app.launch(); app.buttons["Vault"].tap()
        XCTAssertTrue(app.buttons["saveEncryptedBackup"].waitForExistence(timeout: 5)); XCTAssertTrue(app.buttons["saveEncryptedBackup"].isEnabled)
    }
}
