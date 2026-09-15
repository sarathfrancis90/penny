package ca.penny.offline

import android.app.Application
import android.graphics.Bitmap
import android.net.Uri
import androidx.lifecycle.ViewModelStore
import androidx.test.platform.app.InstrumentationRegistry
import kotlinx.coroutines.CompletableDeferred
import org.junit.Assert.*
import org.junit.Test
import java.io.ByteArrayOutputStream
import java.io.File
import java.security.KeyStore

class CaptureDeviceTest {
    private val instrumentation=InstrumentationRegistry.getInstrumentation()
    private val context get()=instrumentation.targetContext.also { check(it.packageName=="ca.penny.offline.dev.test") }
    private fun png()=instrumentation.context.assets.open("receipt.png").use { it.readBytes() }
    @Test fun preparationPreservesValidBytesBoundsCopiesAndRejectsCorruption() {
        val heic=instrumentation.context.assets.open("receipt-preparation.heic").use { it.readBytes() }
        if(android.os.Build.VERSION.SDK_INT>=28) {
            val converted=ReceiptImage.prepare(heic); assertTrue(converted.optimized)
            assertEquals("image/jpeg",Attachment.mediaType(converted.bytes)); ReceiptImage.decode(converted.bytes).recycle()
        } else assertTrue("Android8 requires JPEG or PNG input",runCatching {ReceiptImage.prepare(heic)}.isFailure)
        val original=png(); val unchanged=ReceiptImage.prepare(original)
        assertFalse(unchanged.optimized); assertArrayEquals(original,unchanged.bytes)
        val source=Bitmap.createBitmap(6000,100,Bitmap.Config.ARGB_8888)
        val bytes=ByteArrayOutputStream().apply { source.compress(Bitmap.CompressFormat.PNG,100,this) }.toByteArray()
        source.recycle()
        val result=ReceiptImage.prepare(bytes); assertTrue(result.optimized); assertEquals("image/jpeg",Attachment.mediaType(result.bytes))
        ReceiptImage.decode(result.bytes).let { assertTrue(it.width<=2048); it.recycle() }
        val small=Bitmap.createBitmap(160,80,Bitmap.Config.ARGB_8888)
        val rotated=ReceiptImage.prepareBitmap(small,90); small.recycle()
        ReceiptImage.decode(rotated.bytes).let { assertEquals(80,it.width);assertEquals(160,it.height);it.recycle() }
        val broken=original.copyOf().apply { this[30]=(this[30].toInt() xor 1).toByte() }
        assertTrue(runCatching { ReceiptImage.prepare(broken) }.isFailure)
        val animated=org.json.JSONObject(String(instrumentation.context.assets.open("conformance-v2.json").use { it.readBytes() })).getJSONArray("imageFailures").getJSONObject(0).getJSONObject("attachment")
        assertTrue(runCatching { ReceiptImage.prepare(java.util.Base64.getDecoder().decode(animated.getString("dataBase64"))) }.isFailure)
        assertTrue(runCatching { ReceiptImage.prepare(ByteArray(ReceiptImage.maxInputBytes+1)) }.isFailure)
        val snapshot=Snapshot(Wire.id(),listOf(Expense(merchant="Prepared image",amountMinor=123,expenseDate="2026-09-13",category=Categories.other)))
        val attached=snapshot.copy(attachments=listOf(Attachment.fromBytes(snapshot.expenses.single().id,result.bytes)))
        val key=Backup.recoveryKey(); assertArrayEquals(result.bytes,Backup.decrypt(Backup.encrypt(attached,key),key).attachments.single().bytes())
    }
    @Test fun sharedPngIntegrityCorpusRejectsPartialPixelsBeforeRestore() {
        val corpus=StrictJson.objectFrom(instrumentation.context.assets.open("png-integrity-corpus.json").use {it.readBytes()}).getJSONArray("cases")
        assertTrue(corpus.length()>=10)
        val token=Wire.id();val name="png-integrity-$token.db";val alias="penny.test.png.$token"
        try {VaultStore(context,name,alias).use {store ->
            val baseline=store.snapshot()
            for(index in 0 until corpus.length()) {
                val entry=corpus.getJSONObject(index);val id=entry.getString("id")
                val bytes=java.util.Base64.getDecoder().decode(entry.getString("dataBase64"))
                assertEquals(id,entry.getInt("byteCount"),bytes.size);assertEquals(id,entry.getString("sha256"),Attachment.digest(bytes))
                if(entry.getBoolean("valid")) {
                    ReceiptImage.decode(bytes).let {assertEquals(id,entry.getInt("width"),it.width);assertEquals(id,entry.getInt("height"),it.height);it.recycle()}
                    val prepared=ReceiptImage.prepare(bytes);assertFalse(id,prepared.optimized);assertArrayEquals(id,bytes,prepared.bytes)
                } else {
                    assertTrue(id,runCatching {ReceiptImage.decode(bytes)}.isFailure)
                    assertTrue(id,runCatching {ReceiptImage.prepare(bytes)}.isFailure)
                    val expense=Expense(merchant="Corrupt receipt fixture",amountMinor=100,expenseDate="2026-09-13")
                    val incoming=baseline.copy(expenses=listOf(expense),attachments=listOf(Attachment.fromBytes(expense.id,bytes)))
                    assertTrue(id,runCatching {store.replace(incoming)}.isFailure)
                    assertTrue(id,store.all().isEmpty());assertTrue(id,store.attachments().isEmpty())
                }
            }
        }} finally {android.database.sqlite.SQLiteDatabase.deleteDatabase(File(context.noBackupFilesDir,name));KeyStore.getInstance("AndroidKeyStore").apply {load(null);deleteEntry(alias)}}
    }
    @Test fun confirmedRecoveryKeyIsSeparateProtectedAndExportRequiresReadback() {
        val id=Wire.id(); val alias="penny.test.recovery.$id"; val name="recovery-$id"
        val keys=RecoveryKeyStore(context,name,alias); val key=Backup.recoveryKey()
        assertTrue(runCatching { keys.confirm(key,Backup.recoveryKey()) }.isFailure)
        assertNull(keys.load()); keys.confirm(key,key); assertEquals(key,keys.load())
        val file=File(context.noBackupFilesDir,name)
        assertFalse(String(file.readBytes()).contains(key))
        val snapshot=Snapshot(Wire.id(),emptyList()); val exporter=BackupExporter(context)
        var destination=byteArrayOf()
        exporter.exportVerified(snapshot,key,{destination=it},{destination})
        assertEquals(snapshot,Backup.decrypt(destination,key))
        assertTrue(runCatching { exporter.exportVerified(snapshot,key,{throw java.io.IOException("injected write failure")},{destination}) }.isFailure)
        assertTrue(runCatching { exporter.exportVerified(snapshot,key,{destination=it},{destination.copyOf(destination.size-1)}) }.isFailure)
        assertTrue(runCatching { exporter.exportVerified(snapshot,key,{destination=it},{throw java.io.IOException("injected readback failure")}) }.isFailure)
        assertTrue(File(context.noBackupFilesDir,"encrypted-exports").listFiles().orEmpty().isEmpty())
        KeyStore.getInstance("AndroidKeyStore").apply { load(null); deleteEntry(alias) }
        assertTrue(runCatching { keys.load() }.isFailure)
        assertTrue(file.exists())
        keys.confirm(key,key); assertEquals(key,keys.load())
        KeyStore.getInstance("AndroidKeyStore").apply { load(null); deleteEntry(alias) }; file.delete()
        // Real native resolver boundary, with the public confirmed fixture key.
        val standard=RecoveryKeyStore(context); standard.confirm(key,key)
        val target=File(context.cacheDir,"export-$id.pennybackup")
        try {
            exporter.export(snapshot,key,Uri.fromFile(target)); assertEquals(snapshot,Backup.decrypt(target.readBytes(),key))
            val previous=target.readBytes()
            assertTrue(runCatching { exporter.export(snapshot,key,Uri.fromFile(target)) }.isFailure)
            assertArrayEquals(previous,target.readBytes())
        } finally { target.delete() }
    }
    @Test fun canceledOcrCannotReopenDraftAndFailureRetainsImage() {
        val started=java.util.concurrent.CountDownLatch(1); val text=CompletableDeferred<String>()
        val fake=object: ReceiptIntelligence {
            override suspend fun status()=NanoState.UNAVAILABLE
            override suspend fun text(bytes: ByteArray): String { started.countDown();return text.await() }
            override suspend fun proposal(draft: ReceiptDraft): ReceiptDraft=error("Model unavailable")
            override fun close() {}
        }
        val owner=ViewModelStore(); lateinit var vm:PennyViewModel
        instrumentation.runOnMainSync { vm=PennyViewModel(context.applicationContext as Application,fake); owner.put("capture",vm) }
        val photo=File(context.cacheDir,"capture-cancel-${Wire.id()}.png").apply { writeBytes(png()) }
        try {
            instrumentation.runOnMainSync { vm.scan(Uri.fromFile(photo)) }
            assertTrue(started.await(15,java.util.concurrent.TimeUnit.SECONDS))
            assertArrayEquals(png(),vm.state.value.receiptBytes)
            instrumentation.runOnMainSync { vm.consumeReceipt() }
            text.complete("Merchant: Never saved\nTotal CAD 15.00")
            waitUntil { !vm.state.value.busy }
            assertNull(vm.state.value.receipt);assertNull(vm.state.value.receiptBytes)
        } finally { instrumentation.runOnMainSync { owner.clear() }; photo.delete() }
        val failure=object: ReceiptIntelligence {
            override suspend fun status()=NanoState.UNAVAILABLE
            override suspend fun text(bytes: ByteArray): String=error("OCR unavailable")
            override suspend fun proposal(draft: ReceiptDraft): ReceiptDraft=error("Model unavailable")
            override fun close() {}
        }
        val other=ViewModelStore(); val file=File(context.cacheDir,"capture-failure-${Wire.id()}.png").apply { writeBytes(png()) }
        try {
            instrumentation.runOnMainSync { vm=PennyViewModel(context.applicationContext as Application,failure); other.put("capture",vm); vm.scan(Uri.fromFile(file)) }
            waitUntil { vm.state.value.receipt?.reasons?.contains("ocr_failed")==true }
            assertArrayEquals(png(),vm.state.value.receiptBytes)
        } finally { instrumentation.runOnMainSync { other.clear() }; file.delete() }
    }
    private fun waitUntil(condition: ()->Boolean) { val end=System.nanoTime()+15_000_000_000; while(!condition() && System.nanoTime()<end) Thread.sleep(20);assertTrue(condition()) }
}
