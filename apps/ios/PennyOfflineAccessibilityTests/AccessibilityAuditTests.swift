import XCTest

/// Unfiltered diagnostic; kept separate from functional tests so unresolved
/// inspector findings remain visible and cannot be mistaken for a clean audit.
@MainActor final class AccessibilityAuditTests: XCTestCase {
    func testPrimaryPagesAccessibilityAudit() throws {
        let app = XCUIApplication(); app.launchArguments = ["--uitesting", "--reset-vault"]; app.launch()
        try app.performAccessibilityAudit { issue in
            print("PENNY_ACCESSIBILITY", issue.auditType.rawValue, issue.compactDescription, issue.detailedDescription, issue.element?.debugDescription ?? "No element")
            return false
        }
        app.buttons["Reports"].firstMatch.tap(); try app.performAccessibilityAudit { issue in
            print("PENNY_ACCESSIBILITY", issue.auditType.rawValue, issue.compactDescription, issue.detailedDescription, issue.element?.debugDescription ?? "No element")
            return false
        }
        app.buttons["Vault"].firstMatch.tap(); try app.performAccessibilityAudit { issue in
            print("PENNY_ACCESSIBILITY", issue.auditType.rawValue, issue.compactDescription, issue.detailedDescription, issue.element?.debugDescription ?? "No element")
            return false
        }
    }
}
