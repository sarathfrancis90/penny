package ca.penny.offline

import org.json.JSONArray
import org.json.JSONObject
import java.time.LocalDate
import java.time.YearMonth

object FinanceWire {
    fun obj(vararg values: Pair<String, Any?>) = JSONObject().apply { values.forEach { put(it.first, it.second ?: JSONObject.NULL) } }
    fun text(value: String, max: Int = 4000, name: Boolean = false) { Wire.requireUnicode(value); require(value.codePointCount(0,value.length) <= max && (!name || value.isNotEmpty() && value == Wire.trim(value))) { "Check the text length and surrounding spaces" } }
    fun money(value: Long, zero: Boolean = false) { require(value in (if(zero) 0L else 1L)..Money.maxExpense) { "Amount is outside the supported range" } }
    fun month(value: String) { require(Regex("[0-9]{4}-[0-9]{2}").matches(value)); Wire.requireDate("$value-01") }
    fun times(created: String, updated: String) { Wire.requireInstant(created); Wire.requireInstant(updated); require(updated >= created) }
    fun bool(json: JSONObject, key: String) = (json.get(key) as? Boolean) ?: error("Invalid boolean")
    fun nullString(json: JSONObject, key: String): String? = if(json.get(key) === JSONObject.NULL) null else Wire.string(json,key)
    fun nullLong(json: JSONObject, key: String): Long? = if(json.get(key) === JSONObject.NULL) null else Wire.integer(json,key)
    fun sum(values: Iterable<Long>) = values.fold(0L) { total, value -> Math.addExact(total,value).also { require(it <= Money.maxAggregate) { "Total exceeds supported range" } } }
}

interface FinanceRecord { val id: String; fun json(): JSONObject }

data class Schedule(val frequency: String = "monthly", val startDate: String = LocalDate.now().toString(), val endDate: String? = null, val dayOfMonth: Int? = null) {
    init { require(frequency in listOf("once","weekly","biweekly","monthly","yearly")); Wire.requireDate(startDate); endDate?.let { Wire.requireDate(it); require(it >= startDate) }; require(dayOfMonth == null || dayOfMonth in 1..31); require(frequency in listOf("monthly","yearly") || dayOfMonth == null) }
    fun json() = FinanceWire.obj("frequency" to frequency,"startDate" to startDate,"endDate" to endDate,"dayOfMonth" to dayOfMonth)
    companion object { fun decode(j: JSONObject): Schedule { Wire.exactKeys(j,"frequency","startDate","endDate","dayOfMonth"); val day = FinanceWire.nullLong(j,"dayOfMonth"); require(day == null || day in 1..31); return Schedule(Wire.string(j,"frequency"),Wire.string(j,"startDate"),FinanceWire.nullString(j,"endDate"),day?.toInt()) } }
}

data class Budget(override val id: String = Wire.id(), val category: String = Categories.other, val month: String = YearMonth.now().toString(), val limitMinor: Long, val rollover: Boolean = false, val alertThresholdBps: Int = 8000, val notificationsEnabled: Boolean = false, val createdAt: String = Wire.now(), val updatedAt: String = createdAt): FinanceRecord {
    init { Wire.requireId(id); require(category in Categories.all); FinanceWire.month(month); FinanceWire.money(limitMinor,true); require(alertThresholdBps in 0..10000); FinanceWire.times(createdAt,updatedAt) }
    override fun json() = FinanceWire.obj("id" to id,"category" to category,"month" to month,"limitMinor" to limitMinor,"rollover" to rollover,"alertThresholdBps" to alertThresholdBps,"notificationsEnabled" to notificationsEnabled,"createdAt" to createdAt,"updatedAt" to updatedAt)
    companion object { fun decode(j: JSONObject): Budget { Wire.exactKeys(j,"id","category","month","limitMinor","rollover","alertThresholdBps","notificationsEnabled","createdAt","updatedAt"); val threshold = Wire.integer(j,"alertThresholdBps"); require(threshold in 0..10000); return Budget(Wire.string(j,"id"),Wire.string(j,"category"),Wire.string(j,"month"),Wire.integer(j,"limitMinor"),FinanceWire.bool(j,"rollover"),threshold.toInt(),FinanceWire.bool(j,"notificationsEnabled"),Wire.string(j,"createdAt"),Wire.string(j,"updatedAt")) } }
}

data class IncomeSource(override val id: String = Wire.id(), val name: String, val category: String = "other", val grossMinor: Long, val netMinor: Long? = null, val currencyCode: String = "CAD", val taxable: Boolean = true, val isRecurring: Boolean = false, val isActive: Boolean = true, val description: String = "", val schedule: Schedule = Schedule("once"), val lastReceivedAt: String? = null, val createdAt: String = Wire.now(), val updatedAt: String = createdAt): FinanceRecord {
    init { Wire.requireId(id); FinanceWire.text(name,200,true); require(category in categories); FinanceWire.money(grossMinor); netMinor?.let { require(it in 0..grossMinor) }; require(currencyCode == "CAD"); FinanceWire.text(description); lastReceivedAt?.let(Wire::requireInstant); FinanceWire.times(createdAt,updatedAt) }
    override fun json() = FinanceWire.obj("id" to id,"name" to name,"category" to category,"grossMinor" to grossMinor,"netMinor" to netMinor,"currencyCode" to currencyCode,"taxable" to taxable,"isRecurring" to isRecurring,"isActive" to isActive,"description" to description,"schedule" to schedule.json(),"lastReceivedAt" to lastReceivedAt,"createdAt" to createdAt,"updatedAt" to updatedAt)
    companion object {
        val categories = listOf("salary","freelance","bonus","investment","rental","side_hustle","gift","other")
        fun decode(j: JSONObject): IncomeSource { Wire.exactKeys(j,"id","name","category","grossMinor","netMinor","currencyCode","taxable","isRecurring","isActive","description","schedule","lastReceivedAt","createdAt","updatedAt"); return IncomeSource(Wire.string(j,"id"),Wire.string(j,"name"),Wire.string(j,"category"),Wire.integer(j,"grossMinor"),FinanceWire.nullLong(j,"netMinor"),Wire.string(j,"currencyCode"),FinanceWire.bool(j,"taxable"),FinanceWire.bool(j,"isRecurring"),FinanceWire.bool(j,"isActive"),Wire.string(j,"description"),Schedule.decode(j.getJSONObject("schedule")),FinanceWire.nullString(j,"lastReceivedAt"),Wire.string(j,"createdAt"),Wire.string(j,"updatedAt")) }
    }
}

data class IncomeEntry(override val id: String = Wire.id(), val sourceId: String, val receivedDate: String = LocalDate.now().toString(), val amountMinor: Long, val currencyCode: String = "CAD", val note: String = "", val occurrenceDate: String? = null, val createdAt: String = Wire.now(), val updatedAt: String = createdAt): FinanceRecord {
    init { Wire.requireId(id); Wire.requireId(sourceId); Wire.requireDate(receivedDate); FinanceWire.money(amountMinor); require(currencyCode == "CAD"); FinanceWire.text(note); occurrenceDate?.let(Wire::requireDate); FinanceWire.times(createdAt,updatedAt) }
    override fun json() = FinanceWire.obj("id" to id,"sourceId" to sourceId,"receivedDate" to receivedDate,"amountMinor" to amountMinor,"currencyCode" to currencyCode,"note" to note,"occurrenceDate" to occurrenceDate,"createdAt" to createdAt,"updatedAt" to updatedAt)
    companion object { fun decode(j: JSONObject): IncomeEntry { Wire.exactKeys(j,"id","sourceId","receivedDate","amountMinor","currencyCode","note","occurrenceDate","createdAt","updatedAt"); return IncomeEntry(Wire.string(j,"id"),Wire.string(j,"sourceId"),Wire.string(j,"receivedDate"),Wire.integer(j,"amountMinor"),Wire.string(j,"currencyCode"),Wire.string(j,"note"),FinanceWire.nullString(j,"occurrenceDate"),Wire.string(j,"createdAt"),Wire.string(j,"updatedAt")) } }
}

data class SavingsGoal(override val id: String = Wire.id(), val name: String, val category: String = "custom", val targetMinor: Long, val openingMinor: Long = 0, val monthlyContributionMinor: Long = 0, val currencyCode: String = "CAD", val status: String = "active", val isActive: Boolean = true, val priority: String = "medium", val description: String = "", val emoji: String = "", val startDate: String = LocalDate.now().toString(), val targetDate: String? = null, val achievedDate: String? = null, val lastContributionAt: String? = null, val createdAt: String = Wire.now(), val updatedAt: String = createdAt): FinanceRecord {
    init { Wire.requireId(id); FinanceWire.text(name,200,true); require(category in categories); FinanceWire.money(targetMinor); FinanceWire.money(openingMinor,true); FinanceWire.money(monthlyContributionMinor,true); require(currencyCode == "CAD"); require(status in listOf("active","achieved","paused","cancelled")); require(priority in listOf("low","medium","high","critical")); FinanceWire.text(description); FinanceWire.text(emoji,16); Wire.requireDate(startDate); listOfNotNull(targetDate,achievedDate).forEach { Wire.requireDate(it); require(it >= startDate) }; lastContributionAt?.let(Wire::requireInstant); FinanceWire.times(createdAt,updatedAt) }
    override fun json() = FinanceWire.obj("id" to id,"name" to name,"category" to category,"targetMinor" to targetMinor,"openingMinor" to openingMinor,"monthlyContributionMinor" to monthlyContributionMinor,"currencyCode" to currencyCode,"status" to status,"isActive" to isActive,"priority" to priority,"description" to description,"emoji" to emoji,"startDate" to startDate,"targetDate" to targetDate,"achievedDate" to achievedDate,"lastContributionAt" to lastContributionAt,"createdAt" to createdAt,"updatedAt" to updatedAt)
    companion object {
        val categories = listOf("emergency_fund","travel","education","health","house_down_payment","car","wedding","retirement","investment","custom")
        fun decode(j: JSONObject): SavingsGoal { Wire.exactKeys(j,"id","name","category","targetMinor","openingMinor","monthlyContributionMinor","currencyCode","status","isActive","priority","description","emoji","startDate","targetDate","achievedDate","lastContributionAt","createdAt","updatedAt"); return SavingsGoal(Wire.string(j,"id"),Wire.string(j,"name"),Wire.string(j,"category"),Wire.integer(j,"targetMinor"),Wire.integer(j,"openingMinor"),Wire.integer(j,"monthlyContributionMinor"),Wire.string(j,"currencyCode"),Wire.string(j,"status"),FinanceWire.bool(j,"isActive"),Wire.string(j,"priority"),Wire.string(j,"description"),Wire.string(j,"emoji"),Wire.string(j,"startDate"),FinanceWire.nullString(j,"targetDate"),FinanceWire.nullString(j,"achievedDate"),FinanceWire.nullString(j,"lastContributionAt"),Wire.string(j,"createdAt"),Wire.string(j,"updatedAt")) }
    }
}

data class SavingsEntry(override val id: String = Wire.id(), val goalId: String, val goalName: String, val date: String = LocalDate.now().toString(), val amountMinor: Long, val currencyCode: String = "CAD", val contributionType: String = "manual", val source: String = "", val note: String = "", val createdAt: String = Wire.now(), val updatedAt: String = createdAt): FinanceRecord {
    init { Wire.requireId(id); Wire.requireId(goalId); FinanceWire.text(goalName,200,true); Wire.requireDate(date); FinanceWire.money(amountMinor); require(currencyCode == "CAD"); require(contributionType in listOf("manual","auto","from_expense_savings")); FinanceWire.text(source); FinanceWire.text(note); FinanceWire.times(createdAt,updatedAt) }
    override fun json() = FinanceWire.obj("id" to id,"goalId" to goalId,"goalName" to goalName,"date" to date,"amountMinor" to amountMinor,"currencyCode" to currencyCode,"contributionType" to contributionType,"source" to source,"note" to note,"createdAt" to createdAt,"updatedAt" to updatedAt)
    companion object { fun decode(j: JSONObject): SavingsEntry { Wire.exactKeys(j,"id","goalId","goalName","date","amountMinor","currencyCode","contributionType","source","note","createdAt","updatedAt"); return SavingsEntry(Wire.string(j,"id"),Wire.string(j,"goalId"),Wire.string(j,"goalName"),Wire.string(j,"date"),Wire.integer(j,"amountMinor"),Wire.string(j,"currencyCode"),Wire.string(j,"contributionType"),Wire.string(j,"source"),Wire.string(j,"note"),Wire.string(j,"createdAt"),Wire.string(j,"updatedAt")) } }
}

data class RecurringExpense(override val id: String = Wire.id(), val merchant: String, val amountMinor: Long, val currencyCode: String = "CAD", val category: String = Categories.other, val description: String = "", val note: String = "", val isActive: Boolean = true, val schedule: Schedule = Schedule(), val createdAt: String = Wire.now(), val updatedAt: String = createdAt): FinanceRecord {
    init { Wire.requireId(id); FinanceWire.text(merchant,200,true); FinanceWire.money(amountMinor); require(currencyCode == "CAD" && category in Categories.all); FinanceWire.text(description); FinanceWire.text(note); FinanceWire.times(createdAt,updatedAt) }
    override fun json() = FinanceWire.obj("id" to id,"merchant" to merchant,"amountMinor" to amountMinor,"currencyCode" to currencyCode,"category" to category,"description" to description,"note" to note,"isActive" to isActive,"schedule" to schedule.json(),"createdAt" to createdAt,"updatedAt" to updatedAt)
    companion object { fun decode(j: JSONObject): RecurringExpense { Wire.exactKeys(j,"id","merchant","amountMinor","currencyCode","category","description","note","isActive","schedule","createdAt","updatedAt"); return RecurringExpense(Wire.string(j,"id"),Wire.string(j,"merchant"),Wire.integer(j,"amountMinor"),Wire.string(j,"currencyCode"),Wire.string(j,"category"),Wire.string(j,"description"),Wire.string(j,"note"),FinanceWire.bool(j,"isActive"),Schedule.decode(j.getJSONObject("schedule")),Wire.string(j,"createdAt"),Wire.string(j,"updatedAt")) } }
}

data class FinanceData(val budgets: List<Budget> = emptyList(), val incomeSources: List<IncomeSource> = emptyList(), val incomeEntries: List<IncomeEntry> = emptyList(), val savingsGoals: List<SavingsGoal> = emptyList(), val savingsEntries: List<SavingsEntry> = emptyList(), val recurringExpenses: List<RecurringExpense> = emptyList()) {
    fun domains(): Map<String,List<FinanceRecord>> = linkedMapOf("budgets" to budgets,"incomeSources" to incomeSources,"incomeEntries" to incomeEntries,"savingsGoals" to savingsGoals,"savingsEntries" to savingsEntries,"recurringExpenses" to recurringExpenses)
    fun validate(expenses: List<Expense>) {
        domains().forEach { (name,rows) -> require(rows.size <= limits.getValue(name) && rows.map { it.id }.toSet().size == rows.size) { "Duplicate records or too many $name" } }
        require(budgets.map { "${it.category}/${it.month}" }.toSet().size == budgets.size) { "A budget already exists for this category and month" }
        require(incomeEntries.all { row -> incomeSources.any { it.id == row.sourceId } } && savingsEntries.all { row -> savingsGoals.any { it.id == row.goalId } }) { "Missing financial record reference" }
        val incomeKeys = incomeEntries.mapNotNull { it.occurrenceDate?.let { date -> "${it.sourceId}/$date" } }; require(incomeKeys.toSet().size == incomeKeys.size) { "Income occurrence was already received" }
        val expenseKeys = expenses.mapNotNull { it.recurringTemplateId?.let { id -> require(recurringExpenses.any { template -> template.id == id }); "$id/${it.recurringOccurrenceDate}" } }; require(expenseKeys.toSet().size == expenseKeys.size) { "Expense occurrence was already posted" }
        listOf(budgets.map { it.limitMinor },incomeSources.map { it.grossMinor },incomeEntries.map { it.amountMinor },savingsGoals.map { it.targetMinor },savingsGoals.map { it.openingMinor },savingsGoals.map { it.monthlyContributionMinor },savingsEntries.map { it.amountMinor },recurringExpenses.map { it.amountMinor }).forEach { FinanceWire.sum(it) }
        savingsGoals.forEach { goal -> FinanceWire.sum(listOf(goal.openingMinor) + savingsEntries.filter { it.goalId == goal.id }.map { it.amountMinor }) }
        FinanceWire.sum(savingsGoals.map { it.openingMinor } + savingsEntries.map { it.amountMinor })
    }
    companion object {
        val limits = linkedMapOf("budgets" to 1200,"incomeSources" to 1000,"incomeEntries" to 10000,"savingsGoals" to 1000,"savingsEntries" to 10000,"recurringExpenses" to 1000)
        fun decode(j: JSONObject): FinanceData {
            fun <T> rows(name: String, decode: (JSONObject)->T): List<T> { val list = j.getJSONArray(name); require(list.length() <= limits.getValue(name)); return (0 until list.length()).map { decode(list.getJSONObject(it)) } }
            return FinanceData(rows("budgets",Budget::decode),rows("incomeSources",IncomeSource::decode),rows("incomeEntries",IncomeEntry::decode),rows("savingsGoals",SavingsGoal::decode),rows("savingsEntries",SavingsEntry::decode),rows("recurringExpenses",RecurringExpense::decode))
        }
    }
}
