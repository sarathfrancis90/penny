import Foundation
import Observation

/// Editing values are separate from source evidence. Category inference cannot
/// replace a user's corrected merchant or amount, including on failure/cancel.
@MainActor @Observable final class ReceiptReviewDraft {
    var merchant = ""
    var amount = ""
    var category = Categories.other
    private var categoryRequest = UUID()
    func cancelCategory() { categoryRequest = UUID() }
    func populate(_ proposal: ReceiptProposal) {
        cancelCategory()
        merchant = proposal.merchant ?? ""; amount = proposal.amountMinor.map(Money.input) ?? ""
        if let category = proposal.category { self.category = category }
    }
    func suggestCategory(source: String, locale: String, generate: () async throws -> ReceiptProposal) async throws -> ReceiptProposal? {
        let token = UUID(); categoryRequest = token; let initialCategory = category
        _ = try ReceiptParser.parse(source, locale: locale)
        let proposal = try await generate()
        try Task.checkCancellation()
        guard categoryRequest == token, category == initialCategory else { return nil }
        if let category = proposal.category { self.category = category }
        return proposal
    }
}
