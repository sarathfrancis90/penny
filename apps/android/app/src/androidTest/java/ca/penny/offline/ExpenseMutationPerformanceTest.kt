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
        val target=instrumentation.targetContext
        check(target.packageName=="ca.penny.offline.dev.test")
        val directory=File(target.noBackupFilesDir,"test-mutation-benchmark-${Wire.id()}").apply {mkdir()}
        val context=object:android.content.ContextWrapper(target) {override fun getNoBackupFilesDir()=directory}
        val receiptCount=InstrumentationRegistry.getArguments().getString("pennyMutationReceiptCount","0").toInt().also {require(it==0 || it==4)}
        val id=Wire.id();val name="test-mutation-performance-$id.db";val alias="penny.test.mutation.performance.$id"
        val samples=JSONArray();val redundantRefreshSamples=JSONArray()
        try { VaultStore(context,name,alias).use { store ->
            val expenses=(0 until 10000).map { Expense(merchant="Synthetic merchant $it",amountMinor=1234,expenseDate="2026-09-13",createdAt="2026-09-13T12:00:00.000Z") }
            val receipts=if(receiptCount==0) emptyList() else {
                val tiny=instrumentation.context.assets.open("receipt.png").use {it.readBytes()}
                val chunk=ByteArray(Attachment.maxBytes-tiny.size);val payload=chunk.size-12
                java.nio.ByteBuffer.wrap(chunk).putInt(payload).put("npAD".toByteArray())
                val crc=java.util.zip.CRC32().apply {update(chunk,4,payload+4)}.value
                java.nio.ByteBuffer.wrap(chunk,chunk.size-4,4).putInt(crc.toInt())
                val bytes=tiny.copyOfRange(0,tiny.size-12)+chunk+tiny.copyOfRange(tiny.size-12,tiny.size)
                expenses.take(receiptCount).map {Attachment.fromBytes(it.id,bytes)}.also {ReceiptImage.validate(it)}
            }
            store.replace(Snapshot(Wire.id(),expenses,attachments=receipts))
            repeat(5) { index ->
                // Alternate order in one process/binary. The replay adds the former
                // all()/attachments() refresh to today's save; it is not old-source timing.
                val paths=if(index%2==0) listOf(false,true) else listOf(true,false)
                paths.forEach { replayRedundantRefresh ->
                    val changed=expenses[index].copy(merchant="Edited synthetic $index/$replayRedundantRefresh",amountMinor=2345)
                    val revision=store.revision()
                    val started=SystemClock.elapsedRealtimeNanos()
                    val saved=store.save(changed)
                    val ui=if(replayRedundantRefresh) VaultUiState(expenses=store.all(),attachments=store.attachments().map {ReceiptInfo(it.id,it.expenseId,it.mediaType,it.byteCount,it.sha256)})
                        else VaultUiState(expenses=saved.expenses,attachments=saved.attachments.map {ReceiptInfo(it.id,it.expenseId,it.mediaType,it.byteCount,it.sha256)},finance=saved.finance)
                    val elapsed=(SystemClock.elapsedRealtimeNanos()-started)/1_000_000.0
                    (if(replayRedundantRefresh) redundantRefreshSamples else samples).put(elapsed)
                    assertEquals(revision+1,store.revision()) // Both paths must perform real mutations.
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
                .put("recordCount",10000).put("receiptCount",receiptCount).put("receiptBytes",receipts.sumOf {it.byteCount}).put("pid",android.os.Process.myPid())
            File(target.filesDir,"mutation-performance.json").writeText(result.toString(2))
            println("PENNY_MUTATION_PERFORMANCE $result")
        }} finally {
            android.database.sqlite.SQLiteDatabase.deleteDatabase(File(context.noBackupFilesDir,name))
            KeyStore.getInstance("AndroidKeyStore").apply {load(null);deleteEntry(alias)}
            directory.deleteRecursively()
        }
    }
}
