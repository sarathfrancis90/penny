package ca.penny.offline

import android.os.SystemClock
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Assume.assumeTrue
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File
import java.security.KeyStore

@RunWith(AndroidJUnit4::class)
class ExpenseMutationPerformanceTest {
    @Test fun fiveTenThousandExpenseSaveAndUiRefreshSamples() {
        val instrumentation=InstrumentationRegistry.getInstrumentation()
        assumeTrue(InstrumentationRegistry.getArguments().getString("pennyMutationPerformance")=="true")
        val context=instrumentation.targetContext
        check(context.packageName=="ca.penny.offline.dev.test")
        val id=Wire.id();val name="test-mutation-performance-$id.db";val alias="penny.test.mutation.performance.$id"
        val samples=JSONArray();val redundantRefreshSamples=JSONArray()
        try { VaultStore(context,name,alias).use { store ->
            val expenses=(0 until 10000).map { Expense(merchant="Synthetic merchant $it",amountMinor=1234,expenseDate="2026-09-13",createdAt="2026-09-13T12:00:00.000Z") }
            store.replace(Snapshot(Wire.id(),expenses))
            repeat(5) { index ->
                val changed=expenses[index].copy(merchant="Edited synthetic $index",amountMinor=2345)
                // Alternate order in one process/binary. The replay adds the former
                // all()/attachments() refresh to today's save; it is not old-source timing.
                val paths=if(index%2==0) listOf(false,true) else listOf(true,false)
                paths.forEach { replayRedundantRefresh ->
                    val started=SystemClock.elapsedRealtimeNanos()
                    val saved=store.save(changed)
                    val ui=if(replayRedundantRefresh) VaultUiState(expenses=store.all(),attachments=store.attachments())
                        else VaultUiState(expenses=saved.expenses,attachments=saved.attachments,finance=saved.finance)
                    val elapsed=(SystemClock.elapsedRealtimeNanos()-started)/1_000_000.0
                    (if(replayRedundantRefresh) redundantRefreshSamples else samples).put(elapsed)
                    // Full validation/reopen oracle is outside the timed UI path.
                    val oracle=store.snapshot()
                    assertEquals(oracle.expenses,ui.expenses);assertEquals(oracle.attachments,ui.attachments)
                    assertEquals(10000,ui.expenses.size)
                    assertEquals(12_340_000L+(index+1)*1111,Money.total(ui.expenses))
                }
            }
            val result=JSONObject().put("kind","paired-current-binary-returned-state-vs-redundant-refresh")
                .put("returnedStateMs",samples).put("redundantRefreshMs",redundantRefreshSamples)
                .put("api",android.os.Build.VERSION.SDK_INT).put("build","debug instrumented")
                .put("recordCount",10000).put("receiptCount",0).put("pid",android.os.Process.myPid())
            File(context.filesDir,"mutation-performance.json").writeText(result.toString(2))
            println("PENNY_MUTATION_PERFORMANCE $result")
        }} finally {
            android.database.sqlite.SQLiteDatabase.deleteDatabase(File(context.noBackupFilesDir,name))
            KeyStore.getInstance("AndroidKeyStore").apply {load(null);deleteEntry(alias)}
        }
    }
}
