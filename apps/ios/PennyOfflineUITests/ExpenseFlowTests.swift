import XCTest

@MainActor final class ExpenseFlowTests: XCTestCase {
    func testLocalExpenseSurvivesRelaunchThenEditAndDelete() {
        let app = XCUIApplication()
        app.launchArguments = ["--uitesting", "--reset-vault"]
        app.launch()
        app.buttons["addExpense"].tap()
        app.textFields["merchantField"].tap()
        app.textFields["merchantField"].typeText("Offline Test Cafe")
        app.textFields["amountField"].tap()
        app.textFields["amountField"].typeText("12.34")
        app.buttons["saveExpense"].tap()
        XCTAssertTrue(app.buttons["expense-Offline Test Cafe"].waitForExistence(timeout: 5))
        app.terminate()
        app.launchArguments = ["--uitesting"]
        app.launch()
        let expense = app.buttons["expense-Offline Test Cafe"]
        XCTAssertTrue(expense.waitForExistence(timeout: 5))
        expense.tap()
        let merchant = app.textFields["merchantField"]
        merchant.tap()
        merchant.typeText(String(repeating: XCUIKeyboardKey.delete.rawValue, count: "Offline Test Cafe".count) + "Edited Local Cafe")
        app.buttons["saveExpense"].tap()
        let edited = app.buttons["expense-Edited Local Cafe"]
        XCTAssertTrue(edited.waitForExistence(timeout: 5))
        edited.swipeLeft()
        app.buttons["Delete"].tap()
        app.buttons["Delete expense"].tap()
        XCTAssertTrue(app.staticTexts["A fresh start"].waitForExistence(timeout: 5))
        app.terminate()
        app.launch()
        XCTAssertFalse(app.buttons["expense-Edited Local Cafe"].exists)
    }
    func testReceiptPhotoSurvivesRelaunchAndCanBeRemoved() {
        let app = XCUIApplication()
        app.launchArguments = ["--uitesting", "--reset-vault"]
        app.launch()
        app.buttons["addExpense"].tap()
        app.textFields["merchantField"].tap(); app.textFields["merchantField"].typeText("Receipt Test")
        app.textFields["amountField"].tap(); app.textFields["amountField"].typeText("7.25")
        app.swipeUp()
        let picker = app.buttons["Attach receipt photo"]
        XCTAssertTrue(picker.waitForExistence(timeout: 5)); picker.tap()
        let photo = app.images.matching(identifier: "PXGGridLayout-Info").firstMatch
        XCTAssertTrue(photo.waitForExistence(timeout: 5), app.debugDescription)
        // The system photo grid exposes its image frame but reports no AX hit
        // point on iOS 26. Tap the observed image center within the real picker.
        photo.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap()
        let receipt = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH 'viewReceipt-'")).firstMatch
        XCTAssertTrue(receipt.waitForExistence(timeout: 10), app.debugDescription)
        app.buttons["saveExpense"].tap()
        XCTAssertTrue(app.buttons["expense-Receipt Test"].waitForExistence(timeout: 5))
        app.terminate(); app.launchArguments = ["--uitesting"]; app.launch()
        app.buttons["expense-Receipt Test"].tap(); app.swipeUp()
        XCTAssertTrue(receipt.waitForExistence(timeout: 5)); receipt.tap()
        XCTAssertTrue(app.images["receiptOriginal"].waitForExistence(timeout: 5))
        let screenshot = XCTAttachment(screenshot: app.screenshot()); screenshot.name = "Retained receipt after relaunch"; screenshot.lifetime = .keepAlways; add(screenshot)
        app.buttons["Done"].tap()
        app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH 'removeReceipt-'")).firstMatch.tap()
        app.buttons["saveExpense"].tap()
        app.terminate(); app.launch()
        app.buttons["expense-Receipt Test"].tap(); app.swipeUp()
        XCTAssertFalse(receipt.exists)
    }

}
