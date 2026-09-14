import XCTest

@MainActor final class CaptureFlowTests: XCTestCase {
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
        // not an arbitrary Cancel elsewhere in the host application's hierarchy.
        let filesNavigation = app.navigationBars["FullDocumentManagerViewControllerNavigationBar"]
        guard filesNavigation.waitForExistence(timeout: 30) else {
            XCTFail("Files folder picker did not become ready"); return
        }
        let cancel = filesNavigation.buttons["Cancel"]
        guard cancel.waitForExistence(timeout: 5), cancel.isHittable else {
            XCTFail("Files folder picker has no hittable Cancel control"); return
        }
        cancel.tap()
        XCTAssertTrue(app.staticTexts["Export cancelled. Your local vault is unchanged."].waitForExistence(timeout: 5))
        app.terminate(); app.launchArguments = ["--uitesting"]; app.launch(); app.buttons["Vault"].tap()
        XCTAssertTrue(app.buttons["saveEncryptedBackup"].waitForExistence(timeout: 5)); XCTAssertTrue(app.buttons["saveEncryptedBackup"].isEnabled)
    }
}
