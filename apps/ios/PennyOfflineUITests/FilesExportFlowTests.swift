#if PENNY_FILES_PICKER_PROOF
import XCTest

@MainActor final class FilesExportFlowTests: XCTestCase {
    // Runs with a uniquely named test app and an ordinary precreated Documents
    // folder. No application launch flag changes the Files provider or export.
    func testSaveIntoRealLocalFilesFolder() {
        let app = XCUIApplication(); app.launchArguments = ["--uitesting", "--reset-vault"]; app.launch(); app.buttons["Vault"].tap()
        app.buttons.matching(NSPredicate(format: "label == 'Set up a recovery key' OR label == 'Set up a different recovery key'")).firstMatch.tap()
        let key = "pny1-" + String(repeating: "01", count: 32)
        let candidate = app.secureTextFields["recoveryCandidate"]; candidate.tap(); candidate.typeText(key)
        let reentry = app.secureTextFields["recoveryReentry"]; reentry.tap(); reentry.typeText(key)
        app.buttons["confirmRecoveryKey"].tap(); app.buttons["saveEncryptedBackup"].tap()
        let navigation = app.navigationBars["FullDocumentManagerViewControllerNavigationBar"]
        guard navigation.waitForExistence(timeout: 30) else { XCTFail("Files picker did not open"); return }
        let local = app.staticTexts["On My iPhone"].firstMatch
        if !local.exists, app.tabBars["DOC.browsingModeTabBar"].buttons["Browse"].exists { app.tabBars["DOC.browsingModeTabBar"].buttons["Browse"].tap() }
        guard local.waitForExistence(timeout: 5) else { XCTFail("Local Files location unavailable: " + app.debugDescription); return }
        local.tap()
        let ownFolder = app.staticTexts["Penny Files Proof"].firstMatch
        guard ownFolder.waitForExistence(timeout: 5) else { XCTFail("Own Files folder unavailable: " + app.debugDescription); return }
        ownFolder.tap()
        let proof = app.staticTexts["PennyExportProof"].firstMatch
        guard proof.waitForExistence(timeout: 5) else { XCTFail("Proof folder unavailable: " + app.debugDescription); return }
        proof.tap()
        let open = navigation.buttons["Open"]
        guard open.waitForExistence(timeout: 5), open.isHittable else { XCTFail("Folder cannot be selected: " + app.debugDescription); return }
        open.tap()
        let success = app.staticTexts.matching(NSPredicate(format: "label == %@", "Encrypted file exported and reopened successfully. Remote backup or iCloud upload completion has not been verified. Keep the matching recovery key separately.")).firstMatch
        XCTAssertTrue(success.waitForExistence(timeout: 15))
        let shot = XCTAttachment(screenshot: app.screenshot()); shot.name = "files-export-confirmed"; shot.lifetime = .keepAlways; add(shot)
    }
}
#endif
