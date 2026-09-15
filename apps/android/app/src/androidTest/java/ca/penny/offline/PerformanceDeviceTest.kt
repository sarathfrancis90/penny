package ca.penny.offline

import android.os.Debug
import android.os.SystemClock
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.*
import org.junit.Assume.assumeTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.nio.ByteBuffer
import java.security.KeyStore
import java.util.zip.CRC32

/** Opt-in measured workload, isolated from the app's vault and normal CI time budget. */
@RunWith(AndroidJUnit4::class)
class PerformanceDeviceTest {
    private val instrumentation = InstrumentationRegistry.getInstrumentation()
    private val context get() = instrumentation.targetContext
    private val rows = JSONArray()
    private fun <T> measure(workload: String, operation: String, block: () -> T): T {
        val start = SystemClock.elapsedRealtimeNanos()
        val result = block()
        val memory = Debug.MemoryInfo().also(Debug::getMemoryInfo)
        val runtime = Runtime.getRuntime()
        val row = JSONObject().put("workload",workload).put("operation",operation)
            .put("elapsedMs",(SystemClock.elapsedRealtimeNanos()-start)/1_000_000)
            .put("pssKiB",memory.totalPss).put("javaUsedBytes",runtime.totalMemory()-runtime.freeMemory())
        rows.put(row)
        File(context.filesDir,"p6-performance.json").writeText(rows.toString(2))
        println("PENNY_PERFORMANCE $row")
        return result
    }
    private fun isolated(block: (String,String) -> Unit) {
        val suffix=Wire.id();val name="test-performance-$suffix.db";val alias="penny.test.performance.$suffix"
        try { block(name,alias) }
        finally { android.database.sqlite.SQLiteDatabase.deleteDatabase(File(context.noBackupFilesDir,name));KeyStore.getInstance("AndroidKeyStore").apply {load(null);deleteEntry(alias)} }
    }
    @Test fun tenThousandRecordsAcrossProcessRestart() {
        val args=InstrumentationRegistry.getArguments();val phase=args.getString("pennyPerformancePhase")
        assumeTrue(phase in listOf("seed","open"));check(context.packageName=="ca.penny.offline.dev.test")
        val marker=checkNotNull(args.getString("pennyPerformanceMarker")).also(Wire::requireId)
        val name="test-performance-process-$marker.db";val alias="penny.test.performance.process.$marker"
        if(phase=="seed") {
            check(!File(context.noBackupFilesDir,name).exists())
            VaultStore(context,name,alias).use {store->store.replace(Snapshot(Wire.id(),(0 until 10000).map {Expense(merchant="Process scale $it",amountMinor=1234,expenseDate="2026-09-13")}))}
            println("PENNY_PROCESS_SCALE_SEED pid=${android.os.Process.myPid()}")
        } else try {
            val started=SystemClock.elapsedRealtimeNanos()
            val snapshot=VaultStore(context,name,alias).use {it.snapshot()}
            val elapsed=(SystemClock.elapsedRealtimeNanos()-started)/1_000_000
            assertEquals(10000,snapshot.expenses.size);assertEquals(12_340_000L,Money.total(snapshot.expenses))
            val result=JSONObject().put("pid",android.os.Process.myPid()).put("expenseCount",snapshot.expenses.size).put("openMs",elapsed).put("pssKiB",Debug.MemoryInfo().also(Debug::getMemoryInfo).totalPss)
            File(context.filesDir,"p6-process-open.json").writeText(result.toString(2));println("PENNY_PROCESS_SCALE_OPEN $result")
        } finally {android.database.sqlite.SQLiteDatabase.deleteDatabase(File(context.noBackupFilesDir,name));KeyStore.getInstance("AndroidKeyStore").apply {load(null);deleteEntry(alias)}}
    }
    @Test fun nativeVaultScaleAndFullReceiptCapacity() {
        assumeTrue(InstrumentationRegistry.getArguments().getString("pennyPerformance")=="true")
        check(context.packageName=="ca.penny.offline.dev.test")
        for(count in listOf(1000,10000)) isolated { name,alias ->
            val label="$count expenses"
            val expenses=(0 until count).map { Expense(merchant="Synthetic merchant $it",amountMinor=1234,expenseDate="2026-09-13",createdAt="2026-09-13T12:00:00.000Z") }
            val snapshot=Snapshot(Wire.id(),expenses)
            measure(label,"initial encrypted restore") { VaultStore(context,name,alias).use { it.replace(snapshot) } }
            VaultStore(context,name,alias).use { store ->
                val opened=measure(label,"reopen and decrypt") { store.snapshot() }
                assertEquals(expenses.toSet(),opened.expenses.toSet())
                val updated=expenses.first().copy(merchant="Edited synthetic merchant",amountMinor=2345)
                measure(label,"edit and durable save") { store.save(updated) }
                val current=measure(label,"snapshot after save") { store.snapshot() }
                val report=measure(label,"monthly report") { FinanceMath.report(current,"2026-09") }
                assertEquals(count*1234L+1111,report.getLong("expenseMinor"))
                val csv=measure(label,"CSV export") { FinanceMath.csv(current) }
                assertEquals(count+1,String(csv).split("\r\n").count { it.isNotEmpty() })
                val key=Backup.recoveryKey()
                val sealed=measure(label,"encrypted export") { Backup.encrypt(current,key) }
                val restored=measure(label,"authenticate and decode") { Backup.decrypt(sealed,key) }
                assertEquals(current.expenses.toSet(),restored.expenses.toSet())
                measure(label,"replace existing vault") { store.replace(restored) }
                assertEquals(updated,store.all().first {it.id==updated.id})
            }
        }
        isolated { name,alias ->
            // Valid decoder-readable PNG with a CRC-valid ancillary chunk, exactly 2 MiB.
            // This measures byte capacity; the existing noisy large-image test measures pixels.
            val tiny=instrumentation.context.assets.open("receipt.png").use {it.readBytes()}
            val chunk=ByteArray(Attachment.maxBytes-tiny.size)
            val payloadLength=chunk.size-12
            ByteBuffer.wrap(chunk).putInt(payloadLength).put("npAD".toByteArray())
            val crc=CRC32().apply {update(chunk,4,payloadLength+4)}.value
            ByteBuffer.wrap(chunk,chunk.size-4,4).putInt(crc.toInt())
            val bytes=tiny.copyOfRange(0,tiny.size-12)+chunk+tiny.copyOfRange(tiny.size-12,tiny.size)
            assertEquals(Attachment.maxBytes,bytes.size)
            val expenses=(0..3).map {Expense(merchant="Receipt capacity $it",amountMinor=100,expenseDate="2026-09-13")}
            val receipts=expenses.map {Attachment.fromBytes(it.id,bytes)}
            ReceiptImage.validate(receipts)
            assertEquals(Attachment.maxTotalBytes.toLong(),receipts.sumOf {it.byteCount})
            val snapshot=Snapshot(Wire.id(),expenses,attachments=receipts)
            measure("8 MiB receipts","initial encrypted restore") {VaultStore(context,name,alias).use {it.replace(snapshot)}}
            VaultStore(context,name,alias).use {store ->
                val opened=measure("8 MiB receipts","reopen and decrypt") {store.snapshot()}
                assertEquals(receipts.toSet(),opened.attachments.toSet())
                val key=Backup.recoveryKey()
                val sealed=measure("8 MiB receipts","encrypted export") {Backup.encrypt(opened,key)}
                val restored=measure("8 MiB receipts","authenticate and full image decode") {Backup.decrypt(sealed,key).also {ReceiptImage.validate(it.attachments)}}
                assertEquals(receipts.toSet(),restored.attachments.toSet())
                measure("8 MiB receipts","replace existing vault") {store.replace(restored)}
                assertEquals(receipts.toSet(),store.attachments().toSet())
            }
        }
    }
}
