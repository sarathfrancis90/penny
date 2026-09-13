import XCTest

@MainActor final class VisualFlowTests: XCTestCase {
    private func reveal(_ element: XCUIElement, in app: XCUIApplication) {
        for _ in 0..<20 {
            if element.isHittable { return }
            let upward = !element.exists || element.frame.isEmpty || element.frame.maxY >= 160
            app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: upward ? 0.72 : 0.40))
                .press(forDuration: 0.05, thenDragTo: app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: upward ? 0.40 : 0.72)))
        }
        XCTAssertTrue(element.isHittable, element.debugDescription)
    }
    private func capture(_ app: XCUIApplication, _ name: String) {
        let image = XCTAttachment(screenshot: XCUIScreen.main.screenshot()); image.name = name; image.lifetime = .keepAlways; add(image)
    }
    func testReportExportAndCapacityRemainReachableInLightAndLargeDark() {
        let app = XCUIApplication(); app.launchArguments = ["--uitesting", "--reset-vault"]; app.launch()
        app.buttons["addExpense"].tap()
        app.textFields["merchantField"].tap(); app.textFields["merchantField"].typeText("Layout Coffee")
        app.textFields["amountField"].tap(); app.textFields["amountField"].typeText("5.75")
        app.buttons["saveExpense"].tap()
        XCTAssertTrue(app.buttons["expense-Layout Coffee"].waitForExistence(timeout: 5))
        for large in [false, true] {
            if large {
                app.terminate(); app.launchArguments = ["--uitesting", "--visual-large-dark"]; app.launch()
                if UIDevice.current.userInterfaceIdiom == .pad { XCUIDevice.shared.orientation = .landscapeLeft }
            }
            app.buttons["Reports"].firstMatch.tap()
            let csv = app.buttons["exportCSV"]; reveal(csv, in: app)
            for _ in 0..<3 { if app.tabBars.firstMatch.exists && csv.frame.maxY > app.tabBars.firstMatch.frame.minY { app.swipeUp() } }
            let tabs = app.tabBars.firstMatch
            if tabs.exists && tabs.frame.minY > app.frame.height / 2 { XCTAssertLessThanOrEqual(csv.frame.maxY, tabs.frame.minY + 2) }
            capture(app, large ? "Reports large Dynamic Type dark" : "Reports light")
            csv.tap(); XCTAssertTrue(app.buttons["Create readable CSV"].waitForExistence(timeout: 5))
            if app.buttons["Cancel"].exists { app.buttons["Cancel"].tap() } else { app.tap() }
            app.buttons["Vault"].firstMatch.tap()
            let limits = app.buttons["Finance record limits"]; reveal(limits, in: app); limits.tap()
            let templates = app.descendants(matching: .any).matching(identifier: "capacityRecurring").firstMatch; reveal(templates, in: app)
            capture(app, large ? "Vault capacity large Dynamic Type dark" : "Vault capacity light")
            app.buttons["Plans"].firstMatch.tap(); XCTAssertTrue(app.buttons["Income"].waitForExistence(timeout: 5))
            capture(app, large ? "Plans large Dynamic Type dark" : "Plans light")
        }
        XCUIDevice.shared.orientation = .portrait
    }
}
