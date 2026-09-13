package ca.penny.offline

import org.json.JSONArray
import org.json.JSONObject
import java.time.LocalDate
import java.time.YearMonth
import java.time.temporal.ChronoUnit
import java.math.BigInteger

object FinanceMath {
    fun occurrences(schedule: Schedule, from: String, to: String, recurring: Boolean = true): List<String> {
        Wire.requireDate(from); Wire.requireDate(to)
        val first = LocalDate.parse(from); val last = LocalDate.parse(to); val anchor = LocalDate.parse(schedule.startDate)
        val span = ChronoUnit.DAYS.between(first,last); require(span in 0..366) { "Choose a recurrence range of at most 366 days" }
        val frequency = if(recurring) schedule.frequency else "once"
        return (0..span).map { first.plusDays(it) }.filter { day ->
            if(day < anchor || schedule.endDate?.let { day > LocalDate.parse(it) } == true) false
            else when(frequency) {
                "once" -> day == anchor
                "weekly" -> ChronoUnit.DAYS.between(anchor,day) % 7 == 0L
                "biweekly" -> ChronoUnit.DAYS.between(anchor,day) % 14 == 0L
                else -> day.dayOfMonth == minOf(schedule.dayOfMonth ?: anchor.dayOfMonth,day.lengthOfMonth()) && (frequency == "monthly" || day.month == anchor.month)
            }
        }.map { it.toString() }
    }
    data class Due(val id: String, val date: String, val income: Boolean)
    fun dues(snapshot: Snapshot, from: String, to: String): List<Due> {
        val f = snapshot.finance
        val expenses = f.recurringExpenses.filter { it.isActive }.flatMap { template -> occurrences(template.schedule,from,to).filter { date -> snapshot.expenses.none { it.recurringTemplateId == template.id && it.recurringOccurrenceDate == date } }.map { Due(template.id,it,false) } }
        val income = f.incomeSources.filter { it.isActive }.flatMap { source -> occurrences(source.schedule,from,to,source.isRecurring).filter { date -> f.incomeEntries.none { it.sourceId == source.id && it.occurrenceDate == date } }.map { Due(source.id,it,true) } }
        return (expenses+income).sortedWith(compareBy<Due> { it.date }.thenBy { it.id })
    }
    fun report(snapshot: Snapshot, month: String): JSONObject {
        FinanceWire.month(month)
        val expenses = snapshot.expenses.filter { it.expenseDate.startsWith(month) }
        val income = snapshot.finance.incomeEntries.filter { it.receivedDate.startsWith(month) }
        val spent = Money.total(expenses); val received = FinanceWire.sum(income.map { it.amountMinor })
        fun categories(values: List<String>, sum: (String)->Long) = JSONArray().apply { values.forEach { put(FinanceWire.obj("category" to it,"amountMinor" to sum(it))) } }
        return FinanceWire.obj("month" to month,"currencyCode" to "CAD","expenseMinor" to spent,"receivedMinor" to received,"netMinor" to received-spent,"savingsContributionMinor" to FinanceWire.sum(snapshot.finance.savingsEntries.filter { it.date.startsWith(month) }.map { it.amountMinor }),"expenseCount" to expenses.size,"incomeCount" to income.size,
            "expenseByCategory" to categories(Categories.all) { category -> Money.total(expenses.filter { it.category == category }) },"incomeByCategory" to categories(IncomeSource.categories) { category -> FinanceWire.sum(income.filter { row -> snapshot.finance.incomeSources.first { it.id == row.sourceId }.category == category }.map { it.amountMinor }) })
    }
    data class BudgetUsage(val budget: Budget,val carry: Long,val available: Long,val spent: Long) {
        val remaining get() = available-spent
        val thresholdReached get() = spent > 0 && BigInteger.valueOf(spent)*BigInteger.valueOf(10000) >= BigInteger.valueOf(available)*BigInteger.valueOf(budget.alertThresholdBps.toLong())
        fun json() = FinanceWire.obj("id" to budget.id,"category" to budget.category,"month" to budget.month,"limitMinor" to budget.limitMinor,"carryMinor" to carry,"availableMinor" to available,"spentMinor" to spent,"remainingMinor" to remaining,"thresholdReached" to thresholdReached,"overBudget" to (spent > available))
    }
    fun budgets(snapshot: Snapshot, month: String): List<BudgetUsage> {
        FinanceWire.month(month)
        val previous = mutableMapOf<String,BudgetUsage>(); val result = mutableListOf<BudgetUsage>()
        snapshot.finance.budgets.filter { it.month <= month }.sortedWith(compareBy<Budget> { it.month }.thenBy { it.category }).forEach { budget ->
            val prior = previous[budget.category]
            val carry = if(budget.rollover && prior?.budget?.month == YearMonth.parse(budget.month).minusMonths(1).toString()) maxOf(0,prior.remaining) else 0
            val row = BudgetUsage(budget,carry,FinanceWire.sum(listOf(budget.limitMinor,carry)),Money.total(snapshot.expenses.filter { it.category == budget.category && it.expenseDate.startsWith(budget.month) }))
            previous[budget.category] = row; if(budget.month == month) result.add(row)
        }
        return result.sortedBy { Categories.all.indexOf(it.budget.category) }
    }
    fun savings(snapshot: Snapshot, goal: SavingsGoal): JSONObject {
        val contributed = FinanceWire.sum(snapshot.finance.savingsEntries.filter { it.goalId == goal.id }.map { it.amountMinor })
        val current = FinanceWire.sum(listOf(goal.openingMinor,contributed))
        val progress = (BigInteger.valueOf(current)*BigInteger.valueOf(10000)/BigInteger.valueOf(goal.targetMinor)).min(BigInteger.valueOf(10000)).toInt()
        return FinanceWire.obj("goalId" to goal.id,"openingMinor" to goal.openingMinor,"contributedMinor" to contributed,"currentMinor" to current,"targetMinor" to goal.targetMinor,"remainingMinor" to maxOf(0,goal.targetMinor-current),"progressBps" to progress)
    }
    fun csvCell(value: String): String {
        val dangerous = value.firstOrNull() in listOf('\t','\r','\n') || value.dropWhile(Wire::whitespace).firstOrNull() in listOf('=','+','-','@')
        return "\"" + (if(dangerous) "'$value" else value).replace("\"","\"\"") + "\""
    }
    fun csv(snapshot: Snapshot): ByteArray {
        val rows = listOf(listOf("id","date","merchant","amount","currency","category","description","note")) + snapshot.expenses.sortedWith(compareBy<Expense> { it.expenseDate }.thenBy { it.id }).map { listOf(it.id,it.expenseDate,it.merchant,Money.edit(it.amountMinor),it.currencyCode,it.category,it.description,it.note) }
        return (rows.joinToString("\r\n") { it.joinToString(",",transform=::csvCell) } + "\r\n").toByteArray(Charsets.UTF_8)
    }
}
