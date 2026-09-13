package ca.penny.offline

import org.json.JSONArray
import org.json.JSONObject

/** Exact capture-v1 proposal. Source text is immutable evidence, never instructions. */
data class ReceiptDraft(val sourceText: String, val locale: String, val merchant: String? = null, val amountMinor: Long? = null,
    val merchantLineIndex: Int? = null, val totalLineIndex: Int? = null, val category: String? = null, val reasons: List<String> = emptyList()) {
    val amount: String get() = amountMinor?.let(Money::edit).orEmpty()
    fun json() = JSONObject().put("parserVersion",1).put("locale",locale).put("sourceText",sourceText)
        .put("merchant",merchant ?: JSONObject.NULL).put("amountMinor",amountMinor ?: JSONObject.NULL)
        .put("currencyCode",if(amountMinor == null) JSONObject.NULL else "CAD")
        .put("merchantLineIndex",merchantLineIndex ?: JSONObject.NULL).put("totalLineIndex",totalLineIndex ?: JSONObject.NULL)
        .put("category",category ?: JSONObject.NULL).put("requiresReview",true).put("reasons",JSONArray(reasons))
}
object ReceiptParser {
    // Java's UNICODE_CASE folds Turkish dotted/dotless I into ASCII I; ECMAScript /iu does not.
    // Match ASCII case plus the simple folds used by these labels, retaining original capture spans.
    private class Rule(pattern: String) {
        private val compiled=java.util.regex.Pattern.compile(pattern,java.util.regex.Pattern.CASE_INSENSITIVE)
        private fun matcher(value: String)=compiled.matcher(value.replace('ſ','s').replace('K','k'))
        fun matches(value: String)=matcher(value).matches()
        fun containsMatchIn(value: String)=matcher(value).find()
        fun matchEntire(value: String): Groups? {
            val match=matcher(value); if(!match.matches()) return null
            return Groups((0..match.groupCount()).map { if(match.start(it)<0) "" else value.substring(match.start(it),match.end(it)) })
        }
    }
    private data class Groups(val groupValues: List<String>)
    private fun regex(pattern: String) = Rule(pattern.replace("\\s", "[\\u0009-\\u000d \\u00a0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000\\ufeff]")
        .replace("\\b", "(?:(?<=[A-Za-z0-9_])(?![A-Za-z0-9_])|(?<![A-Za-z0-9_])(?=[A-Za-z0-9_]))")
        .replace("é","[éÉ]").replace("ç","[çÇ]").replace("à","[àÀ]"))
    private val merchantLabel = regex("""^(?:merchant|vendor|marchand|commerçant)\s*:\s*(.*)$""")
    private val ignored = regex("""^(?:sub[ -]?total|sous[ -]?total|total\s+(?:tax(?:es)?|items?|articles?|discounts?|remises?)|tax(?:es)?|tps|tvq|hst|gst|pst|tender(?:ed)?|cash|change|discount|remise|monnaie|comptant)\b""")
    private val instruction = regex("""\b(?:ignore\s+(?:all\s+)?(?:previous|prior|above)\s+instructions|system\s+prompt|assistant\s*:|execute\s+(?:code|command)|send\s+(?:money|data)|ignorez\s+les\s+instructions)(?!\p{L})""")
    private val foreign = regex("""\b(?:USD|EUR|GBP|AUD|NZD|JPY|CNY|INR|MXN|CHF|RMB|US\s+dollars?)(?![a-z])|US\s*\$|[€£¥₹]""")
    private val refund = regex("""\b(?:refund(?:ed)?|remboursement|remboursé|credit\s+note|note\s+de\s+crédit)(?!\p{L})""")
    private val signed = regex("""[-−+()]|\bCR\b""")
    private fun total(locale: String) = regex(if(locale == "en-CA") """^(?:grand\s+total|total\s+paid|amount\s+due|balance\s+due|total)\b\s*:?\s*(.*)$""" else """^(?:total\s+général|montant\s+total|total\s+à\s+payer|net\s+à\s+payer|total\s+ttc|total)\b\s*:?\s*(.*)$""")
    private fun validMerchant(value: String) = value.isNotEmpty() && value.codePointCount(0,value.length) <= 200 && Regex("\\p{L}").containsMatchIn(value) && !Regex("\\p{Cc}").containsMatchIn(value) && !regex("^(?:receipt|invoice|facture|welcome|thank you|merci)$").matches(value) && !Regex("[0-9]+[.,][0-9]{2}").containsMatchIn(value) && !ignored.containsMatchIn(value)
    private fun amount(text: String, locale: String): Long {
        require(!signed.containsMatchIn(text)) { "signed_total" }
        val horizontal = "[ \\t\\u00a0\\u202f]"
        val numeric = if(locale == "en-CA") "(?:0|[1-9][0-9]*|[1-9][0-9]{0,2}(?:,[0-9]{3})+)\\.[0-9]{2}" else "(?:0|[1-9][0-9]*|[1-9][0-9]{0,2}(?:${horizontal}[0-9]{3})+),[0-9]{2}"
        val match = regex("^(?:(?:CAD(?:[ \\t]*\\$)?|CA\\$|C\\$|\\$)${horizontal}*)?($numeric)(?:${horizontal}*(?:\\$[ \\t]*CAD|CAD|CA\\$|C\\$|\\$))?$").matchEntire(text)
        requireNotNull(match) { "malformed_total" }
        val normalized = if(locale == "en-CA") match.groupValues[1].replace(",", "") else match.groupValues[1].replace(Regex(horizontal), "").replace(',', '.')
        require(normalized != "0.00") { "nonpositive_total" }
        return try { Money.parse(normalized) } catch(_: Exception) { error("total_overflow") }
    }
    fun draft(sourceText: String, locale: String = "en-CA"): ReceiptDraft {
        require(locale in listOf("en-CA", "fr-CA")) { "unsupported_locale" }
        require(runCatching { Wire.requireUnicode(sourceText) }.isSuccess) { "invalid_unicode" }
        require(sourceText.codePointCount(0,sourceText.length) <= 4000) { "input_too_long" }
        var result = ReceiptDraft(sourceText,locale)
        val reasons = mutableListOf<String>()
        val lines = sourceText.split(Regex("\r\n|\r|\n")).mapIndexed { index, line -> index to Wire.trim(line) }.filter { it.second.isNotEmpty() }
        if(instruction.containsMatchIn(sourceText)) return result.copy(reasons=listOf("instruction_like_text"))
        val labelled = lines.filter { merchantLabel.matches(it.second) }
        if(labelled.size > 1) reasons += "ambiguous_merchant" else {
            val candidate = labelled.firstOrNull()?.let { it.first to Wire.trim(merchantLabel.matchEntire(it.second)!!.groupValues[1]) } ?: lines.firstOrNull()
            if(candidate != null && (labelled.isNotEmpty() || !total(locale).matches(candidate.second)) && validMerchant(candidate.second)) result = result.copy(merchant=candidate.second,merchantLineIndex=candidate.first)
            else reasons += "missing_merchant"
        }
        if(foreign.containsMatchIn(sourceText)) return result.copy(reasons=reasons+"foreign_currency")
        if(refund.containsMatchIn(sourceText)) return result.copy(reasons=reasons+"unsupported_refund")
        val totals = lines.filter { !merchantLabel.matches(it.second) && !ignored.containsMatchIn(it.second) && total(locale).matches(it.second) }
        when {
            totals.isEmpty() -> reasons += "missing_total"
            totals.size > 1 -> reasons += "multiple_totals"
            else -> try {
                result = result.copy(amountMinor=amount(Wire.trim(total(locale).matchEntire(totals[0].second)!!.groupValues[1]),locale),totalLineIndex=totals[0].first)
                if(!regex("""\bCAD(?![a-z])|CA\$|C\$""").containsMatchIn(sourceText)) reasons += "currency_assumed_cad"
            } catch(e: Exception) { reasons += checkNotNull(e.message) }
        }
        return result.copy(reasons=reasons)
    }
    fun validateModel(source: String, locale: String, output: JSONObject): ReceiptDraft {
        val draft = draft(source,locale)
        Wire.exactKeys(output,"merchant","amountMinor","currencyCode","category")
        require(output.isNull("merchant") || output.get("merchant") is String && output.getString("merchant") == draft.merchant) { "model_merchant_ungrounded" }
        require(output.isNull("amountMinor") || runCatching { Wire.integer(output,"amountMinor").let { it > 0 && it == draft.amountMinor } }.getOrDefault(false)) { "model_amount_ungrounded" }
        require(if(output.isNull("amountMinor")) output.isNull("currencyCode") else output.get("currencyCode") == "CAD") { "model_currency_ungrounded" }
        require(output.isNull("category") || output.get("category") in Categories.all) { "model_category_invalid" }
        require(output.isNull("category") || draft.merchant != null && draft.amountMinor != null) { "model_category_ungrounded" }
        return draft.copy(category=if(output.isNull("category")) null else output.getString("category"))
    }
    fun reason(value: String) = when(value) {
        "currency_assumed_cad" -> "CAD is assumed from the selected locale. Confirm the currency."
        "foreign_currency" -> "A foreign currency was found. Enter a verified CAD amount manually."
        "multiple_totals" -> "More than one total was found. Choose the correct amount manually."
        "instruction_like_text" -> "Instruction-like text was ignored. Enter the expense manually."
        "input_too_long" -> "OCR text exceeds 4,000 characters. No fields were proposed; the full text is available."
        "ocr_failed" -> "Text could not be read. The image is retained for manual entry."
        else -> value.replace('_',' ').replaceFirstChar { it.uppercase() } + ". Review the original receipt."
    }
}
