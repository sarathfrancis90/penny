import Foundation

struct ReceiptProposal: Codable, Equatable, Sendable {
    var parserVersion = 1
    let locale: String
    let sourceText: String
    var merchant: String?
    var amountMinor: Int64?
    var currencyCode: String?
    var merchantLineIndex: Int?
    var totalLineIndex: Int?
    var category: String?
    var requiresReview = true
    var reasons: [String] = []
    enum CodingKeys: String, CodingKey { case parserVersion, locale, sourceText, merchant, amountMinor, currencyCode, merchantLineIndex, totalLineIndex, category, requiresReview, reasons }
    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(parserVersion, forKey: .parserVersion); try c.encode(locale, forKey: .locale); try c.encode(sourceText, forKey: .sourceText)
        try c.encode(merchant, forKey: .merchant); try c.encode(amountMinor, forKey: .amountMinor); try c.encode(currencyCode, forKey: .currencyCode)
        try c.encode(merchantLineIndex, forKey: .merchantLineIndex); try c.encode(totalLineIndex, forKey: .totalLineIndex)
        try c.encode(category, forKey: .category); try c.encode(requiresReview, forKey: .requiresReview); try c.encode(reasons, forKey: .reasons)
    }
}

struct ReceiptModelOutput: Codable, Sendable {
    var merchant: String?
    var amountMinor: Int64?
    var currencyCode: String?
    var category: String?
}

enum ReceiptParser {
    struct Failure: LocalizedError, Equatable { let code: String; var errorDescription: String? { code } }
    private static let merchantLabel = #"^(?:merchant|vendor|marchand|commerçant)\s*:\s*(.*)$"#
    private static let ignoredTotal = #"^(?:sub[ -]?total|sous[ -]?total|total\s+(?:tax(?:es)?|items?|articles?|discounts?|remises?)|tax(?:es)?|tps|tvq|hst|gst|pst|tender(?:ed)?|cash|change|discount|remise|monnaie|comptant)\b"#
    private static let instruction = #"\b(?:ignore\s+(?:all\s+)?(?:previous|prior|above)\s+instructions|system\s+prompt|assistant\s*:|execute\s+(?:code|command)|send\s+(?:money|data)|ignorez\s+les\s+instructions)(?!\p{L})"#
    private static let foreign = #"\b(?:USD|EUR|GBP|AUD|NZD|JPY|CNY|INR|MXN|CHF|RMB|US\s+dollars?)(?![a-z])|US\s*\$|[€£¥₹]"#
    private static let refund = #"\b(?:refund(?:ed)?|remboursement|remboursé|credit\s+note|note\s+de\s+crédit)(?!\p{L})"#
    private static func matches(_ pattern: String, _ text: String) -> [String]? {
        // ICU's Unicode word boundaries and whitespace differ from ECMAScript.
        let boundary = #"(?:(?<=[A-Za-z0-9_])(?![A-Za-z0-9_])|(?<![A-Za-z0-9_])(?=[A-Za-z0-9_]))"#
        let whitespace = #"[\u0009-\u000d\u0020\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]"#
        let exact = pattern.replacingOccurrences(of: #"\b"#, with: boundary).replacingOccurrences(of: #"\s"#, with: whitespace)
        let regex = try! NSRegularExpression(pattern: exact, options: [.caseInsensitive])
        guard let result = regex.firstMatch(in: text, range: NSRange(text.startIndex..., in: text)) else { return nil }
        return (0..<result.numberOfRanges).map { Range(result.range(at: $0), in: text).map { String(text[$0]) } ?? "" }
    }
    private static func trim(_ text: String) -> String { text.trimmingCharacters(in: FinanceValidation.wireWhitespace) }
    private static func totalLabel(_ locale: String) -> String {
        locale == "en-CA" ? #"^(?:grand\s+total|total\s+paid|amount\s+due|balance\s+due|total)\b\s*:?\s*(.*)$"#
        : #"^(?:total\s+général|montant\s+total|total\s+à\s+payer|net\s+à\s+payer|total\s+ttc|total)\b\s*:?\s*(.*)$"#
    }
    private static func validMerchant(_ value: String) -> Bool {
        !value.isEmpty && value.unicodeScalars.count <= 200 && matches(#"\p{L}"#, value) != nil
        && matches(#"\p{Cc}"#, value) == nil && matches(#"^(?:receipt|invoice|facture|welcome|thank you|merci)$"#, value) == nil
        && matches(#"[0-9]+[.,][0-9]{2}"#, value) == nil && matches(ignoredTotal, value) == nil
    }
    private static func amount(_ text: String, locale: String) throws -> Int64 {
        guard matches(#"[-−+()]|\bCR\b"#, text) == nil else { throw Failure(code: "signed_total") }
        let horizontal = #"[ \t\u00a0\u202f]"#
        let numeric = locale == "en-CA" ? #"(?:0|[1-9][0-9]*|[1-9][0-9]{0,2}(?:,[0-9]{3})+)\.[0-9]{2}"#
        : "(?:0|[1-9][0-9]*|[1-9][0-9]{0,2}(?:\(horizontal)[0-9]{3})+),[0-9]{2}"
        let prefix = #"(?:CAD(?:[ \t]*\$)?|CA\$|C\$|\$)"#
        let suffix = #"(?:\$[ \t]*CAD|CAD|CA\$|C\$|\$)"#
        guard let found = matches("^(?:\(prefix)\(horizontal)*)?(\(numeric))(?:\(horizontal)*\(suffix))?$", text) else { throw Failure(code: "malformed_total") }
        let normalized: String
        if locale == "en-CA" { normalized = found[1].replacingOccurrences(of: ",", with: "") }
        else { normalized = found[1].components(separatedBy: CharacterSet(charactersIn: " \t\u{00a0}\u{202f}")).joined().replacingOccurrences(of: ",", with: ".") }
        guard normalized != "0.00" else { throw Failure(code: "nonpositive_total") }
        do { return try Money.parse(normalized) } catch { throw Failure(code: "total_overflow") }
    }
    static func parse(_ sourceText: String, locale: String) throws -> ReceiptProposal {
        guard ["en-CA", "fr-CA"].contains(locale) else { throw Failure(code: "unsupported_locale") }
        guard sourceText.unicodeScalars.count <= 4_000 else { throw Failure(code: "input_too_long") }
        var proposal = ReceiptProposal(locale: locale, sourceText: sourceText)
        let lines = sourceText.replacingOccurrences(of: "\r\n", with: "\n").replacingOccurrences(of: "\r", with: "\n")
            .components(separatedBy: "\n").enumerated().map { (text: trim($0.element), index: $0.offset) }.filter { !$0.text.isEmpty }
        if matches(instruction, sourceText) != nil { proposal.reasons = ["instruction_like_text"]; return proposal }
        let labelled = lines.compactMap { line -> (text: String, index: Int)? in
            guard let match = matches(merchantLabel, line.text) else { return nil }; return (trim(match[1]), line.index)
        }
        if labelled.count > 1 { proposal.reasons.append("ambiguous_merchant") }
        else if let candidate = labelled.first ?? lines.first,
                (!labelled.isEmpty || matches(totalLabel(locale), candidate.text) == nil), validMerchant(candidate.text) {
            proposal.merchant = candidate.text; proposal.merchantLineIndex = candidate.index
        } else { proposal.reasons.append("missing_merchant") }
        if matches(foreign, sourceText) != nil { proposal.reasons.append("foreign_currency"); return proposal }
        if matches(refund, sourceText) != nil { proposal.reasons.append("unsupported_refund"); return proposal }
        let totals = lines.compactMap { line -> (text: String, index: Int)? in
            guard matches(merchantLabel, line.text) == nil, matches(ignoredTotal, line.text) == nil,
                  let match = matches(totalLabel(locale), line.text) else { return nil }; return (trim(match[1]), line.index)
        }
        if totals.isEmpty { proposal.reasons.append("missing_total") }
        else if totals.count > 1 { proposal.reasons.append("multiple_totals") }
        else {
            do {
                proposal.amountMinor = try amount(totals[0].text, locale: locale)
                proposal.totalLineIndex = totals[0].index; proposal.currencyCode = "CAD"
                if matches(#"\bCAD(?![a-z])|CA\$|C\$"#, sourceText) == nil { proposal.reasons.append("currency_assumed_cad") }
            } catch { proposal.reasons.append((error as? Failure)?.code ?? "malformed_total") }
        }
        return proposal
    }
    static func validateModel(_ source: String, locale: String, output: ReceiptModelOutput) throws -> ReceiptProposal {
        var proposal = try parse(source, locale: locale)
        guard output.merchant == nil || output.merchant == proposal.merchant else { throw Failure(code: "model_merchant_ungrounded") }
        guard output.amountMinor == nil || (output.amountMinor == proposal.amountMinor && output.amountMinor! > 0 && output.amountMinor! <= Money.maximumMinor) else { throw Failure(code: "model_amount_ungrounded") }
        guard output.currencyCode == (output.amountMinor == nil ? nil : "CAD") else { throw Failure(code: "model_currency_ungrounded") }
        guard output.category == nil || Categories.all.contains(output.category!) else { throw Failure(code: "model_category_invalid") }
        guard output.category == nil || (proposal.merchant != nil && proposal.amountMinor != nil) else { throw Failure(code: "model_category_ungrounded") }
        proposal.category = output.category
        return proposal
    }
    static func validateModelJSON(_ source: String, locale: String, data: Data) throws -> ReceiptProposal {
        _ = try StrictJSON.object(data, keys: ["merchant", "amountMinor", "currencyCode", "category"])
        return try validateModel(source, locale: locale, output: JSONDecoder().decode(ReceiptModelOutput.self, from: data))
    }
    static func explanation(_ reason: String) -> String {
        switch reason {
        case "currency_assumed_cad": "CAD is assumed from your selected Canadian receipt language. Confirm the currency."
        case "instruction_like_text": "This text includes instruction-like content. Enter the details manually."
        case "foreign_currency": "A foreign currency was found. Penny currently records CAD expenses only."
        case "unsupported_refund", "signed_total": "Refunds and signed totals need manual review; no amount was proposed."
        case "multiple_totals": "More than one total was found. Enter the correct amount yourself."
        case "missing_merchant", "ambiguous_merchant": "The merchant is missing or ambiguous. Check the receipt."
        case "missing_total": "No labelled final total was found. Enter the amount yourself."
        case "total_overflow": "The total exceeds Penny's supported amount."
        case "nonpositive_total": "An expense must have a positive amount."
        default: "The total format is unclear for this receipt language. Check the original and enter the amount yourself."
        }
    }
}
