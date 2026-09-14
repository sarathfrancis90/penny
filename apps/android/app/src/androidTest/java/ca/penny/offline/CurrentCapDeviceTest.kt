package ca.penny.offline

import android.content.ContextWrapper
import android.os.Debug
import android.os.SystemClock
import androidx.test.platform.app.InstrumentationRegistry
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Assume.assumeTrue
import org.junit.Test
import java.io.File
import java.nio.ByteBuffer
import java.security.KeyStore
import java.util.zip.CRC32

/** Single opt-in combined boundary sample; boundary memory includes the retained test oracle. */
class CurrentCapDeviceTest {
    @Test fun combinedCurrentCapsLiveEditV4AndCompatibilityRoundtrip() {
        assumeTrue(InstrumentationRegistry.getArguments().getString("pennyCurrentCap")=="true")
        val ins=InstrumentationRegistry.getInstrumentation();val target=ins.targetContext
        assertEquals("ca.penny.offline.dev.test",target.packageName)
        val report=JSONObject().put("api",android.os.Build.VERSION.SDK_INT).put("pid",android.os.Process.myPid())
            .put("scope","One debug-instrumented sample; padded 1x1 PNGs; boundary memory includes test oracle, not peak/p95 or decoded-pixel stress")
        val stages=JSONArray();report.put("stages",stages)
        val output=File(target.filesDir,"current-cap.json")
        fun persist()=output.writeText(report.toString(2))
        fun memory():JSONObject {
            val runtime=Runtime.getRuntime();val info=Debug.MemoryInfo();Debug.getMemoryInfo(info)
            return JSONObject().put("javaUsedBytes",runtime.totalMemory()-runtime.freeMemory())
                .put("nativeAllocatedBytes",Debug.getNativeHeapAllocatedSize()).put("totalPssKiB",info.totalPss)
        }
        fun <T> stage(name:String,work:()->T):T {
            val row=JSONObject().put("name",name).put("before",memory());stages.put(row);persist()
            val start=SystemClock.elapsedRealtimeNanos()
            try {return work().also {row.put("status","pass")}}
            catch(e:Throwable) {row.put("status","fail").put("error",e.toString());throw e}
            finally {row.put("elapsedMs",(SystemClock.elapsedRealtimeNanos()-start)/1_000_000.0).put("after",memory());persist()}
        }
        val dir=File(target.noBackupFilesDir,"current-cap-${Wire.id()}").apply {check(mkdir())}
        val context=object:ContextWrapper(target) {override fun getNoBackupFilesDir()=dir}
        val alias="penny.test.currentcap.${Wire.id()}";val key=ByteArray(32) {7}
        try {
            val planBytes=ins.context.assets.open("current-cap-v1/workload.json").use {it.readBytes()}
            assertEquals("35bdfaee6e8236504ed50c8e06e0eeb0f4b27c1f6716ad87fac3eab4b1b7afa9",Attachment.digest(planBytes))
            report.put("workloadSha256",Attachment.digest(planBytes))
            val plan=StrictJson.objectFrom(planBytes)
            var expected=stage("generate_validate_capacity") {
                val bytes=ins.context.assets.open("v4-native-writer-v1/android-finance.snapshot.json").use {it.readBytes()}
                assertEquals(plan.getString("sourceSnapshotSha256"),Attachment.digest(bytes))
                val base=Snapshot.decode(StrictJson.objectFrom(bytes));val tiny=base.attachments.single().bytes()
                assertEquals(plan.getString("sourceReceiptSha256"),Attachment.digest(tiny))
                val expenses=base.expenses+(0 until plan.getInt("expenseCount")-base.expenses.size).map {i->
                    Expense.decode(JSONObject(plan.getJSONObject("expenseTemplate").toString())
                        .put("id",plan.getString("expenseIdPrefix")+i.toString().padStart(12,'0'))
                        .put("merchant",plan.getString("merchantPrefix")+i),3)
                }
                val lengths=plan.getJSONArray("receiptLengths")
                val receipts=(0 until lengths.length()).map {i->
                    val chunk=ByteArray(lengths.getInt(i)-tiny.size);val payload=chunk.size-12
                    ByteBuffer.wrap(chunk).putInt(payload).put("npAD".toByteArray(Charsets.US_ASCII))
                    ByteBuffer.wrap(chunk,chunk.size-4,4).putInt(CRC32().apply {update(chunk,4,payload+4)}.value.toInt())
                    val raw=tiny.copyOfRange(0,tiny.size-12)+chunk+tiny.copyOfRange(tiny.size-12,tiny.size)
                    assertEquals(plan.getJSONObject("receiptSha256ByLength").getString(raw.size.toString()),Attachment.digest(raw))
                    Attachment.fromBytes(expenses[i].id,raw).copy(id=plan.getString("receiptIdPrefix")+i.toString().padStart(12,'0'))
                }
                base.copy(expenses=expenses,attachments=receipts).also {
                    assertEquals(10000,it.expenses.size);assertEquals(100,it.attachments.size)
                    assertEquals(8388608L,it.attachments.sumOf {a->a.byteCount});assertEquals(2097152L,it.attachments.maxOf {a->a.byteCount})
                    assertEquals(plan.getLong("expectedExpenseTotalMinor"),Money.total(it.expenses))
                    assertEquals(6,it.finance.domains().size);assertTrue(it.finance.domains().values.all {rows->rows.isNotEmpty()})
                    it.validate();ReceiptImage.validate(it.attachments);Backup.requireCapacity(it)
                    report.put("expenseCount",it.expenses.size).put("receiptCount",it.attachments.size).put("receiptBytes",8388608)
                        .put("schema3PlaintextBytes",StrictJson.bytes(it.json()).size)
                }
            }
            fun compare(actual:Snapshot) {
                assertEquals(expected.vaultId,actual.vaultId);assertEquals(expected.snapshotId,actual.snapshotId);assertEquals(expected.createdAt,actual.createdAt)
                assertEquals(expected.expenses.toSet(),actual.expenses.toSet());assertEquals(expected.finance,actual.finance)
                assertEquals(expected.attachments.toSet(),actual.attachments.toSet())
                val attachments=actual.attachments.associateBy {it.id}
                expected.attachments.forEach {assertArrayEquals(it.bytes(),attachments.getValue(it.id).bytes())}
            }
            VaultStore(context,"vault.db",alias).use {store->
                stage("seed") {store.replace(expected)}
                store.generations.fault={if(it==VaultGenerations.Point.SNAPSHOT_HYDRATION) error("Aggregate hydration on live/export path")}
                val live=stage("live_open") {store.liveState()}
                val edit=plan.getJSONObject("edit");val changed=expected.expenses.single {it.id==edit.getString("expenseId")}
                    .copy(amountMinor=edit.getLong("amountMinor"),note=edit.getString("note"))
                expected=expected.copy(expenses=expected.expenses.map {if(it.id==changed.id) changed else it})
                stage("live_metadata_edit") {
                    val after=store.editExpense(live,changed)
                    assertEquals(expected.expenses.toSet(),after.expenses.toSet());assertEquals(live.receipts,after.receipts);assertEquals(expected.finance,after.finance)
                    assertEquals(12351548L,Money.total(after.expenses))
                }
                val file=stage("v4_export_native_readback") {store.exportV4(key)}
                val encrypted=File(dir,"export.pennybackup")
                file.use {
                    assertNotEquals(expected.snapshotId,it.summary.snapshotId)
                    expected=expected.copy(snapshotId=it.summary.snapshotId,createdAt=it.summary.createdAt)
                    stage("v4_ciphertext_copy") {it.copyTo(encrypted.outputStream())}
                    assertEquals(it.byteCount,encrypted.length());report.put("v4Bytes",it.byteCount).put("v4Sha256",it.sha256)
                }
                val candidate=stage("v4_prepare_two_pass") {store.prepareV4(encrypted.inputStream(),key)}
                store.generations.fault={}
                candidate.use {stage("v4_guarded_install") {store.installPrepared(it)}}
                stage("installed_full_oracle") {compare(store.snapshot())}
            }
            stage("new_store_reopen_exact") {VaultStore(context,"vault.db",alias).use {compare(it.snapshot())}}
            stage("compatibility_export_decode_exact") {
                VaultStore(context,"vault.db",alias).use {store->
                    val snapshot=store.snapshot();compare(snapshot);Backup.requireCapacity(snapshot)
                    val encrypted=Backup.encrypt(snapshot,"pny1-"+"07".repeat(32))
                    try {assertTrue(encrypted.size<=Backup.maxEnvelopeBytes);report.put("compatibilityBytes",encrypted.size);compare(Backup.decrypt(encrypted,"pny1-"+"07".repeat(32)))} finally {encrypted.fill(0)}
                }
            }
            report.put("status","pass")
        } catch(e:Throwable) {report.put("status","fail").put("error",e.toString());throw e}
        finally {persist();key.fill(0);dir.deleteRecursively();KeyStore.getInstance("AndroidKeyStore").apply {load(null);deleteEntry(alias)}}
    }
}
