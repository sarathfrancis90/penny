import XCTest

@MainActor final class CloudFlowTests: XCTestCase {
    func testUnavailableCloudBuildKeepsLocalFinanceUsableAfterRestart() {
        let app = XCUIApplication(); app.launchArguments = ["--uitesting", "--reset-vault"]; app.launch()
        app.buttons["Vault"].tap()
        let link = app.buttons["Optional iCloud backup"]
        if !link.isHittable { app.swipeUp() }
        XCTAssertTrue(link.waitForExistence(timeout: 5)); link.tap()
        XCTAssertTrue(app.staticTexts["cloudUnavailable"].waitForExistence(timeout: 5))
        let enable = app.buttons["enableCloudBackup"]
        if !enable.isHittable { app.swipeUp() }
        XCTAssertTrue(enable.exists); XCTAssertFalse(enable.isEnabled)
        let automatic = app.switches["automaticCloudBackup"]
        if !automatic.isHittable { app.swipeUp() }
        XCTAssertTrue(automatic.waitForExistence(timeout: 5)); XCTAssertEqual(automatic.value as? String, "0"); XCTAssertFalse(automatic.isEnabled)
        let image = XCTAttachment(screenshot: app.screenshot()); image.name = "Cloud unavailable safely in default build"; image.lifetime = .keepAlways; add(image)
        app.terminate(); app.launchArguments = ["--uitesting"]; app.launch()
        app.buttons["addExpense"].tap()
        app.textFields["merchantField"].tap(); app.textFields["merchantField"].typeText("Local without cloud")
        app.textFields["amountField"].tap(); app.textFields["amountField"].typeText("4.25")
        app.buttons["saveExpense"].tap()
        XCTAssertTrue(app.buttons["expense-Local without cloud"].waitForExistence(timeout: 5))
        app.terminate(); app.launch()
        XCTAssertTrue(app.buttons["expense-Local without cloud"].waitForExistence(timeout: 5))
    }
    func testSyntheticAutomaticConsentCancelEnableRelaunchAndDisable() {
        let app = XCUIApplication(); app.launchArguments = ["--uitesting", "--reset-vault", "--synthetic-cloud"]; app.launch()
        func openCloud() {
            app.buttons["Vault"].tap(); let link = app.buttons["Optional iCloud backup"]
            if !link.isHittable { app.swipeUp() }; link.tap()
            XCTAssertTrue(app.staticTexts["syntheticCloudProvider"].exists || app.otherElements["syntheticCloudProvider"].exists)
        }
        func toggle() -> XCUIElement {
            let element = app.switches["automaticCloudBackup"]
            for _ in 0..<3 { if element.isHittable { break }; app.swipeUp() }
            XCTAssertTrue(element.waitForExistence(timeout: 5)); return element
        }
        openCloud(); let enable = app.buttons["enableCloudBackup"]
        if !enable.isHittable { app.swipeUp() }; enable.tap()
        let automatic = toggle(); XCTAssertEqual(automatic.value as? String, "0"); XCTAssertTrue(automatic.isEnabled)
        automatic.coordinate(withNormalizedOffset: CGVector(dx: 0.9, dy: 0.5)).tap()
        let consent = app.buttons["Enable automatic backup"]
        XCTAssertTrue(consent.waitForExistence(timeout: 5)); app.buttons["Cancel"].tap()
        XCTAssertEqual(automatic.value as? String, "0")
        automatic.coordinate(withNormalizedOffset: CGVector(dx: 0.9, dy: 0.5)).tap(); consent.tap()
        XCTAssertEqual(automatic.value as? String, "1")
        let image = XCTAttachment(screenshot: app.screenshot()); image.name = "Synthetic provider automatic consent"; image.lifetime = .keepAlways; add(image)
        app.terminate(); app.launchArguments = ["--uitesting", "--synthetic-cloud"]; app.launch(); openCloud()
        let persisted = toggle(); XCTAssertEqual(persisted.value as? String, "1")
        persisted.coordinate(withNormalizedOffset: CGVector(dx: 0.9, dy: 0.5)).tap(); XCTAssertEqual(persisted.value as? String, "0")
        app.terminate(); app.launch(); openCloud(); XCTAssertEqual(toggle().value as? String, "0")
    }

}
