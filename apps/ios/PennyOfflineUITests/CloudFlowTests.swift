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
    func testSyntheticAutomaticConsentCancelEnableRelaunchAndDisable() throws {
        let app = XCUIApplication(); app.launchArguments = ["--uitesting", "--reset-vault", "--synthetic-cloud"]; app.launch()
        func openCloud() {
            app.buttons["Vault"].tap(); let link = app.buttons["Optional iCloud backup"]
            if !link.isHittable { app.swipeUp() }; link.tap()
            XCTAssertTrue(app.staticTexts["syntheticCloudProvider"].exists || app.otherElements["syntheticCloudProvider"].exists)
        }
        func toggle() throws -> XCUIElement {
            let element = app.switches["automaticCloudBackup"]
            for _ in 0..<8 {
                let frame = element.exists ? element.frame : .zero
                let bottom = app.tabBars.firstMatch.exists ? app.tabBars.firstMatch.frame.minY : app.frame.maxY
                let top = app.navigationBars.firstMatch.frame.maxY
                if element.exists, element.isHittable, !frame.isEmpty,
                   frame.minY > top + 8, frame.maxY < bottom - 8 { return element }
                let aboveNavigation = !frame.isEmpty && frame.minY <= top + 8
                app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: aboveNavigation ? 0.4 : 0.7))
                    .press(forDuration: 0.05, thenDragTo: app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: aboveNavigation ? 0.7 : 0.4)))
            }
            XCTFail("Automatic backup switch must be fully visible between navigation and tab bars")
            throw NSError(domain: "CloudFlowTests", code: 1)
        }
        func tapToggle() throws {
            let row = try toggle()
            let controls = row.descendants(matching: .switch).allElementsBoundByIndex.filter { $0.isHittable && $0.frame.width <= 100 && $0.frame.height <= 60 }
            // SwiftUI may expose the compact UISwitch as a child of a labelled
            // switch row. Require a single control; never tap near obscuring tabs.
            let control: XCUIElement
            if controls.count == 1 { control = controls[0] }
            else if controls.isEmpty, row.frame.width <= 100, row.frame.height <= 60 { control = row }
            else { XCTFail("Ambiguous automatic-backup switch controls"); throw NSError(domain: "CloudFlowTests", code: 2) }
            guard let value = row.value as? String, value == "0" || value == "1" else {
                XCTFail("Automatic backup switch has no binary state"); throw NSError(domain: "CloudFlowTests", code: 3)
            }
            // A hosted native center tap left the enabled switch unchanged.
            // Move its thumb once in the requested direction; consent/state
            // assertions below remain mandatory, with no gesture retry.
            let start = control.coordinate(withNormalizedOffset: CGVector(dx: value == "0" ? 0.25 : 0.75, dy: 0.5))
            let end = control.coordinate(withNormalizedOffset: CGVector(dx: value == "0" ? 0.75 : 0.25, dy: 0.5))
            start.press(forDuration: 0.1, thenDragTo: end)
        }
        openCloud(); let enable = app.buttons["enableCloudBackup"]
        if !enable.isHittable { app.swipeUp() }; enable.tap()
        let automatic = try toggle(); XCTAssertEqual(automatic.value as? String, "0"); XCTAssertTrue(automatic.isEnabled)
        try tapToggle()
        let consent = app.buttons["Enable automatic backup"]
        guard consent.waitForExistence(timeout: 5) else { XCTFail("Explicit automatic backup consent must appear"); return }
        app.buttons["Cancel"].tap()
        XCTAssertEqual(automatic.value as? String, "0")
        try tapToggle(); XCTAssertTrue(consent.waitForExistence(timeout: 5)); consent.tap()
        XCTAssertEqual(automatic.value as? String, "1")
        let image = XCTAttachment(screenshot: app.screenshot()); image.name = "Synthetic provider automatic consent"; image.lifetime = .keepAlways; add(image)
        app.terminate(); app.launchArguments = ["--uitesting", "--synthetic-cloud"]; app.launch(); openCloud()
        let persisted = try toggle(); XCTAssertEqual(persisted.value as? String, "1")
        try tapToggle(); XCTAssertEqual(persisted.value as? String, "0")
        app.terminate(); app.launch(); openCloud(); XCTAssertEqual(try toggle().value as? String, "0")
    }

}
