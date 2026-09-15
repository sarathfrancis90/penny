import XCTest

@MainActor final class FinanceFlowTests: XCTestCase {
    private func enter(_ app: XCUIApplication, _ id: String, _ text: String) {
        let field = app.textFields[id]
        XCTAssertTrue(field.waitForExistence(timeout: 5), id)
        field.tap()
        let old = field.value as? String ?? ""
        let clear = old == field.placeholderValue ? "" : String(repeating: XCUIKeyboardKey.delete.rawValue, count: old.count)
        field.typeText(clear + text)
    }
    private func section(_ app: XCUIApplication, _ name: String) {
        app.buttons["Plans"].tap()
        let back = app.navigationBars.buttons["Your plans"]
        if back.exists { back.tap() }
        app.buttons[name].tap()
    }
    private func assertAmount(_ app: XCUIApplication, _ id: String, _ value: String) {
        let element = app.descendants(matching: .any).matching(identifier: id).firstMatch
        XCTAssertTrue(element.waitForExistence(timeout: 5))
        XCTAssertTrue(element.label.contains(value) || (element.value as? String)?.contains(value) == true || element.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", value)).firstMatch.exists, element.debugDescription)
    }
    func testLocalFinanceJourneyAndRelaunch() {
        let app = XCUIApplication(); app.launchArguments = ["--uitesting", "--reset-vault"]; app.launch()
        section(app, "Budgets"); app.buttons["addFinance"].tap()
        enter(app, "financeAmount-limit", "100.00")
        app.switches["Carry unused previous month"].tap()
        app.buttons["saveFinance"].tap()
        XCTAssertTrue(app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH 'budgetRow-'")).firstMatch.waitForExistence(timeout: 5))
        section(app, "Income"); app.buttons["addFinance"].tap()
        enter(app, "financeName", "Local Contract"); enter(app, "financeAmount-gross", "1000.00")
        app.buttons["saveFinance"].tap()
        XCTAssertTrue(app.buttons["incomeSource-Local Contract"].waitForExistence(timeout: 5))
        app.buttons["recordIncome-Local Contract"].tap(); enter(app, "ledgerAmount", "800.00"); app.buttons["saveLedger"].tap()
        section(app, "Savings"); app.buttons["addFinance"].tap()
        enter(app, "financeName", "Rainy Day"); enter(app, "financeAmount-target", "500.00")
        enter(app, "financeAmount-opening", "100.00"); enter(app, "financeAmount-monthly", "25.00")
        app.buttons["saveFinance"].tap()
        XCTAssertTrue(app.buttons["savingsGoal-Rainy Day"].waitForExistence(timeout: 5))
        app.buttons["recordSavings-Rainy Day"].tap(); enter(app, "ledgerAmount", "50.00"); app.buttons["saveLedger"].tap()
        section(app, "Recurring expenses"); app.buttons["addFinance"].tap()
        enter(app, "financeName", "Desk Plan"); enter(app, "financeAmount-recurring", "12.00")
        app.buttons["saveFinance"].tap()
        XCTAssertTrue(app.buttons["reviewDue-Desk Plan"].waitForExistence(timeout: 5)); app.buttons["reviewDue-Desk Plan"].tap()
        app.buttons["Post expense"].tap()
        XCTAssertTrue(app.buttons["reviewDue-Desk Plan"].waitForNonExistence(timeout: 5))
        app.buttons["Reports"].tap()
        assertAmount(app, "reportReceived", "800.00"); assertAmount(app, "reportExpenses", "12.00")
        assertAmount(app, "reportNet", "788.00"); assertAmount(app, "reportSavings", "50.00")
        let screenshot = XCTAttachment(screenshot: app.screenshot()); screenshot.name = "Local finance report"; screenshot.lifetime = .keepAlways; add(screenshot)
        app.terminate(); app.launchArguments = ["--uitesting"]; app.launch(); app.buttons["Reports"].tap()
        assertAmount(app, "reportNet", "788.00"); assertAmount(app, "reportSavings", "50.00")
        section(app, "Income"); app.buttons["incomeSource-Local Contract"].tap()
        let active = app.switches["Active"]
        active.coordinate(withNormalizedOffset: CGVector(dx: 0.9, dy: 0.5)).tap()
        XCTAssertEqual(active.value as? String, "0", active.debugDescription)
        app.buttons["saveFinance"].tap()
        let source = app.buttons["incomeSource-Local Contract"]
        XCTAssertTrue(source.waitForExistence(timeout: 5))
        XCTAssertTrue(source.label.contains("Inactive"), app.debugDescription)
        app.buttons["Reports"].tap(); assertAmount(app, "reportReceived", "800.00")
    }
}
