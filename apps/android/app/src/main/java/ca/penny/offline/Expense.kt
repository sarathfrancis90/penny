package ca.penny.offline

import org.json.JSONObject
import java.math.BigDecimal
import java.text.NumberFormat
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import java.util.Currency
import java.util.Locale
import java.util.UUID

object Wire {
    fun whitespace(c: Char) = c in '\u0009'..'\u000d' || c in '\u2000'..'\u200a' || c in listOf(' ','\u00a0','\u1680','\u2028','\u2029','\u202f','\u205f','\u3000','\ufeff')
    fun trim(value: String) = value.trim(::whitespace)
    fun exactKeys(json: JSONObject, vararg expected: String) { require(json.keys().asSequence().toSet() == expected.toSet()) { "Unexpected or missing fields" } }
    fun string(json: JSONObject, key: String): String = (json.get(key) as? String) ?: error("Invalid text field")
    val instantFormat: DateTimeFormatter = DateTimeFormatter.ofPattern("uuuu-MM-dd'T'HH:mm:ss.SSS'Z'").withZone(ZoneOffset.UTC)
    fun now(): String = instantFormat.format(Instant.now())
    fun id(): String = UUID.randomUUID().toString()
    fun requireId(value: String) { require(Regex("[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}").matches(value)) { "Invalid identifier" } }
    fun requireDate(value: String) {
        require(Regex("[0-9]{4}-[0-9]{2}-[0-9]{2}").matches(value) && value.take(4) != "0000") { "Use YYYY-MM-DD" }
        require(LocalDate.parse(value).toString() == value) { "Invalid calendar date" }
    }
    fun requireInstant(value: String) {
        require(Regex("[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\\.[0-9]{3}Z").matches(value)) { "Invalid timestamp" }
        requireDate(value.take(10))
        require(instantFormat.format(Instant.parse(value)) == value) { "Invalid timestamp" }
    }
    fun integer(json: JSONObject, key: String): Long {
        val value = json.get(key)
        require(value is Number) { "Invalid integer" }
        return BigDecimal(value.toString()).longValueExact()
    }
    fun requireUnicode(value: String) {
        var index = 0
        while (index < value.length) {
            val c = value[index++]
            if (Character.isHighSurrogate(c)) { require(index < value.length && Character.isLowSurrogate(value[index])) { "Invalid Unicode text" }; index++ }
            else require(!Character.isLowSurrogate(c)) { "Invalid Unicode text" }
        }
    }
}

object Money {
    const val maxExpense = 99_999_999_999L
    const val maxAggregate = 999_999_999_999_999L
    fun parse(input: String): Long {
        val value = input
        require(Regex("(0|[1-9][0-9]*)(\\.[0-9]{1,2})?").matches(value)) { "Enter a positive CAD amount with up to two decimal places" }
        return BigDecimal(value).movePointRight(2).longValueExact().also {
            require(it in 1..maxExpense) { "Amount must be between $0.01 and $999,999,999.99" }
        }
    }
    fun edit(minor: Long): String = BigDecimal.valueOf(minor, 2).toPlainString()
    fun format(minor: Long): String = NumberFormat.getCurrencyInstance(Locale.CANADA).apply { currency = Currency.getInstance("CAD") }.format(BigDecimal.valueOf(minor, 2))
    fun total(expenses: List<Expense>): Long = expenses.fold(0L) { sum, expense ->
        Math.addExact(sum, expense.amountMinor).also { require(it <= maxAggregate) { "Vault total exceeds supported range" } }
    }
}

data class Expense(
    val id: String = Wire.id(), val merchant: String, val amountMinor: Long,
    val currencyCode: String = "CAD", val expenseDate: String,
    val category: String = Categories.other, val note: String = "",
    val createdAt: String = Wire.now(), val updatedAt: String = createdAt,
    val description: String = "", val recurringTemplateId: String? = null, val recurringOccurrenceDate: String? = null,
) {
    init {
        Wire.requireId(id)
        Wire.requireUnicode(merchant); Wire.requireUnicode(note); Wire.requireUnicode(description)
        require(merchant == Wire.trim(merchant) && merchant.codePointCount(0, merchant.length) in 1..200) { "Enter a merchant (up to 200 characters)" }
        require(amountMinor in 1..Money.maxExpense) { "Invalid amount" }
        require(currencyCode == "CAD") { "This version supports CAD only" }
        Wire.requireDate(expenseDate)
        require(category in Categories.all) { "Choose an expense category" }
        require(note.codePointCount(0, note.length) <= 4000) { "Notes are limited to 4000 characters" }
        require(description.codePointCount(0, description.length) <= 4000)
        require((recurringTemplateId == null) == (recurringOccurrenceDate == null))
        recurringTemplateId?.let(Wire::requireId); recurringOccurrenceDate?.let(Wire::requireDate)
        Wire.requireInstant(createdAt); Wire.requireInstant(updatedAt)
        require(updatedAt >= createdAt) { "Update precedes creation" }
    }
    fun json(): JSONObject = JSONObject().put("id", id).put("merchant", merchant).put("amountMinor", amountMinor)
        .put("currencyCode", currencyCode).put("expenseDate", expenseDate).put("category", category)
        .put("note", note).put("createdAt", createdAt).put("updatedAt", updatedAt)
        .put("description", description).put("recurringTemplateId", recurringTemplateId ?: JSONObject.NULL).put("recurringOccurrenceDate", recurringOccurrenceDate ?: JSONObject.NULL)
    companion object {
        fun decode(json: JSONObject, version: Int = 3): Expense {
            val fields = arrayOf("id", "merchant", "amountMinor", "currencyCode", "expenseDate", "category", "note", "createdAt", "updatedAt")
            Wire.exactKeys(json, *(if (version < 3) fields else fields + arrayOf("description", "recurringTemplateId", "recurringOccurrenceDate")))
            return Expense(id = Wire.string(json, "id"), merchant = Wire.string(json, "merchant"), amountMinor = Wire.integer(json, "amountMinor"),
                currencyCode = Wire.string(json, "currencyCode"), expenseDate = Wire.string(json, "expenseDate"), category = Wire.string(json, "category"),
                note = Wire.string(json, "note"), createdAt = Wire.string(json, "createdAt"), updatedAt = Wire.string(json, "updatedAt"),
                description = if (version < 3) "" else Wire.string(json,"description"), recurringTemplateId = if(version < 3) null else FinanceWire.nullString(json,"recurringTemplateId"), recurringOccurrenceDate = if(version < 3) null else FinanceWire.nullString(json,"recurringOccurrenceDate"))
        }
    }
}
