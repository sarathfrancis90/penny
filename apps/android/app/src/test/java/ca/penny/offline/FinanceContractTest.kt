package ca.penny.offline

import org.json.JSONObject
import org.json.JSONArray
import org.junit.Assert.*
import org.junit.Test
import java.io.File

class FinanceContractTest {
    private fun fixture(name:String)=checkNotNull(javaClass.classLoader?.getResourceAsStream(name)).readBytes()
    private fun snapshot()=Snapshot.decode(StrictJson.objectFrom(fixture("snapshot-v3.json")))
    private fun equalJson(expected:Any,actual:Any) {
        when(expected) {
            is JSONObject -> { val actualJson=actual as JSONObject;assertEquals(expected.keys().asSequence().toSet(),actualJson.keys().asSequence().toSet());expected.keys().asSequence().forEach { equalJson(expected.get(it),actualJson.get(it)) } }
            is JSONArray -> { val actualJson=actual as JSONArray;assertEquals(expected.length(),actualJson.length());for(i in 0 until expected.length()) equalJson(expected.get(i),actualJson.get(i)) }
            is Number -> assertEquals(expected.toLong(),(actual as Number).toLong())
            else -> assertEquals(expected,actual)
        }
    }
    @Test fun goldenCalculationsAndRecurrence() {
        val value=snapshot();val golden=StrictJson.objectFrom(fixture("finance-golden.json"));val month=golden.getString("month")
        equalJson(golden.getJSONObject("report"),FinanceMath.report(value,month))
        equalJson(golden.getJSONArray("budgetUsage"),JSONArray().apply { FinanceMath.budgets(value,month).forEach { put(it.json()) } })
        equalJson(golden.getJSONObject("savingsProgress"),FinanceMath.savings(value,value.finance.savingsGoals.single()))
        val recurrence=golden.getJSONArray("recurrence")
        for(i in 0 until recurrence.length()) { val row=recurrence.getJSONObject(i);equalJson(row.getJSONArray("expected"),JSONArray(FinanceMath.occurrences(Schedule.decode(row.getJSONObject("schedule")),row.getString("from"),row.getString("to"),row.getBoolean("recurring")))) }
        val due=FinanceMath.dues(value,"2026-02-01","2026-02-28")
        assertEquals(listOf("2026-02-28"),due.filterNot { it.income }.map { it.date });assertTrue(due.none { it.income })
        assertArrayEquals(fixture("expenses-v3.csv"),FinanceMath.csv(value))
        assertTrue(runCatching { FinanceMath.occurrences(Schedule(),"2020-01-01","2022-01-01") }.isFailure)
    }
    @Test fun strictV3CorpusAndBackwardUpgrade() {
        val original=snapshot();val corpus=StrictJson.objectFrom(fixture("conformance-v3.json"));val rows=corpus.getJSONArray("mutations")
        assertTrue(runCatching { original.expenses.first().copy(merchant="\uFEFFCafé") }.isFailure)
        assertTrue(runCatching { original.finance.incomeSources.first().copy(name="\uFEFFCafé") }.isFailure)
        val csv=corpus.getJSONArray("csvCases");for(i in 0 until csv.length()) { val row=csv.getJSONObject(i);assertEquals(row.getString("expected"),FinanceMath.csvCell(row.getString("input"))) }
        for(i in 0 until rows.length()) { val row=rows.getJSONObject(i);val mutated=original.json();mutated.getJSONArray(row.getString("domain")).getJSONObject(row.getInt("index")).put(row.getString("field"),row.get("value"));assertEquals(row.toString(),row.getBoolean("valid"),runCatching { Snapshot.decode(mutated) }.isSuccess) }
        FinanceData.limits.keys.forEach { domain -> val missing=original.json();missing.remove(domain);assertTrue(runCatching { Snapshot.decode(missing) }.isFailure) }
        val duplicate=original.copy(finance=original.finance.copy(incomeEntries=original.finance.incomeEntries+original.finance.incomeEntries.single().copy(id=Wire.id())))
        assertTrue(runCatching { duplicate.validate() }.isFailure)
        for(version in 1..2) { val old=Snapshot.decode(StrictJson.objectFrom(fixture("snapshot-v$version.json")));assertTrue(old.finance.domains().values.all { it.isEmpty() });assertEquals("",old.expenses.single().description);assertEquals(3,old.json().getInt("schemaVersion")) }
        val invalid=original.json().put("schemaVersion",true);assertTrue(runCatching { Snapshot.decode(invalid) }.isFailure)
    }
    @Test fun portableFullFinanceRoundTrip() {
        val key=StrictJson.objectFrom(fixture("golden-vector-v3.json")).getString("recoveryKey")
        val restored=Backup.decrypt(fixture("backup-v3.pennybackup"),key)
        assertEquals(snapshot(),restored)
        val bytes=Backup.encrypt(restored,key);assertEquals(restored,Backup.decrypt(bytes,key));File("build/android-backup-v3.pennybackup").writeBytes(bytes)
        val wrong=Backup.recoveryKey();assertTrue(runCatching { Backup.decrypt(bytes,wrong) }.isFailure)
    }
    @Test fun rolloverGapsZeroBudgetsOverflowAndCsvSafety() {
        val id=Wire.id();val expense=Expense(merchant="=HYPERLINK(\"x\")",amountMinor=Money.maxExpense,expenseDate="2026-03-01",description="\tformula",note="  @SUM(1)")
        val budget=Budget(category=expense.category,month="2026-03",limitMinor=0,rollover=true,alertThresholdBps=10000)
        val value=Snapshot(id,listOf(expense),finance=FinanceData(budgets=listOf(budget.copy(id=Wire.id(),month="2026-01",limitMinor=Money.maxExpense),budget)))
        val usage=FinanceMath.budgets(value,"2026-03").single();assertEquals(0L,usage.carry);assertTrue(usage.thresholdReached);assertEquals(-Money.maxExpense,usage.remaining)
        val goal=SavingsGoal(name="Overflow-safe goal",targetMinor=1,openingMinor=Money.maxExpense)
        assertEquals(10000,FinanceMath.savings(value.copy(finance=FinanceData(savingsGoals=listOf(goal))),goal).getInt("progressBps"))
        val csv=String(FinanceMath.csv(value));assertTrue(csv.contains("\"'=HYPERLINK"));assertTrue(csv.contains("\"'\tformula\""));assertTrue(csv.endsWith("\r\n"))
    }
}
