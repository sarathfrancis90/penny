package ca.penny.offline

import android.app.Application
import android.net.Uri
import androidx.lifecycle.ViewModelStore
import androidx.test.platform.app.InstrumentationRegistry
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import java.io.*
import java.security.KeyStore
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import org.junit.Assert.*
import org.junit.Test

class V4FilesExportDeviceTest {
    private val ins=InstrumentationRegistry.getInstrumentation();private val context=ins.targetContext
    private val recovery="pny1-"+"07".repeat(32)
    private val ai=object:ReceiptIntelligence {override suspend fun status()=NanoState.UNAVAILABLE;override suspend fun text(bytes:ByteArray):String=error("unused");override suspend fun proposal(draft:ReceiptDraft)=draft;override fun close(){}}
    private fun waitFor(model:PennyViewModel,predicate:(VaultUiState)->Boolean)=runBlocking {withTimeout(15000) {model.state.first(predicate)}}
    private fun fails(block:()->Unit)=checkNotNull(runCatching(block).exceptionOrNull())
    private fun scenario(body:(PennyViewModel,VaultStore,File)->Unit) {
        assertEquals("ca.penny.offline.dev.test",context.packageName)
        val id=Wire.id();val name="files-export-$id.db";val alias="penny.test.files.export.$id";val file=File(context.cacheDir,"$id.pennybackup")
        val store=VaultStore(context,name,alias);val owner=ViewModelStore();lateinit var model:PennyViewModel
        try {RecoveryKeyStore(context).confirm(recovery,recovery)
            ins.runOnMainSync {model=PennyViewModel(context.applicationContext as Application,ai,store);owner.put("model",model)}
            waitFor(model) {it.ready && !it.busy};body(model,store,file)
        } finally {ins.runOnMainSync {owner.clear()};file.delete();store.close();android.database.sqlite.SQLiteDatabase.deleteDatabase(File(context.noBackupFilesDir,name));KeyStore.getInstance("AndroidKeyStore").apply {load(null);deleteEntry(alias)}}
    }
    private fun prepare(model:PennyViewModel,key:String=recovery):BackupExportRequest {
        val done=CountDownLatch(1);var request:BackupExportRequest?=null
        ins.runOnMainSync {model.prepareExport(key) {request=it;done.countDown()}}
        assertTrue(done.await(15,TimeUnit.SECONDS));waitFor(model) {!it.busy};return checkNotNull(request)
    }
    @Test fun blankReadyVaultExportsFreshIdentityAndCanPreviewItsExactFile()=scenario {model,store,file->
        val before=store.snapshot();assertTrue(before.expenses.isEmpty())
        val request=prepare(model);val filename=request.filename;assertNotEquals("Penny-${before.createdAt.take(10)}-${before.snapshotId}.pennybackup",filename)
        file.createNewFile();ins.runOnMainSync {model.completeExport(request,Uri.fromFile(file))}
        waitFor(model) {!it.busy && it.message?.startsWith("Encrypted file exported and read back successfully.")==true}
        assertEquals(before,store.snapshot());assertArrayEquals("PNYBKP4\n".toByteArray(),file.readBytes().copyOf(8))
        val root=Backup.key(recovery);try {store.prepareV4(file.inputStream(),root).use {candidate->assertEquals("Penny-${candidate.metadata.createdAt.take(10)}-${candidate.metadata.snapshotId}.pennybackup",filename);assertEquals(0,candidate.metadata.counts["expenses"])}} finally {root.fill(0)}
    }
    @Test fun existingDestinationUnconfirmedKeyAndPickerCancellationNeverClaimSuccess()=scenario {model,store,file->
        val before=store.snapshot();val request=prepare(model);file.writeText("preserve existing")
        ins.runOnMainSync {model.completeExport(request,Uri.fromFile(file))};waitFor(model) {!it.busy && it.message?.startsWith("Backup export was not verified.")==true}
        assertEquals("preserve existing",file.readText());assertEquals(before,store.snapshot())
        val unconfirmed=java.util.concurrent.atomic.AtomicBoolean()
        ins.runOnMainSync {model.prepareExport("pny1-"+"08".repeat(32)) {unconfirmed.set(true)}}
        waitFor(model) {!it.busy && it.message?.startsWith("Backup export could not be prepared.")==true}
        assertFalse(unconfirmed.get())
        val cancelled=prepare(model);ins.runOnMainSync {model.cancelExport();assertFalse(model.completeExport(cancelled,Uri.fromFile(file)))}
        assertEquals("preserve existing",file.readText())
    }
    @Test fun stalePickerUriAndNullCannotConsumeOrCancelReplacementRequest()=scenario {model,store,file->
        val original=store.snapshot();val first=prepare(model)
        ins.runOnMainSync {model.cancelExport()}
        val second=prepare(model);assertNotSame(first,second)
        val stale=File(file.parentFile,"stale-${Wire.id()}.pennybackup").apply {writeText("unchanged")}
        try {
            ins.runOnMainSync {
                assertFalse(model.completeExport(first,Uri.fromFile(stale)))
                assertFalse(model.completeExport(first,null))
            }
            assertEquals("unchanged",stale.readText());file.createNewFile()
            ins.runOnMainSync {assertTrue(model.completeExport(second,Uri.fromFile(file)))}
            waitFor(model) {!it.busy && it.message?.startsWith("Encrypted file exported and read back successfully.")==true}
            val key=Backup.key(recovery);try {store.prepareV4(file.inputStream(),key).use {assertTrue(second.filename.contains(it.metadata.snapshotId))}} finally {key.fill(0)}
            assertEquals(original,store.snapshot());ins.runOnMainSync {assertFalse(model.completeExport(second,null))}
        } finally {stale.delete()}
    }
    @Test fun pickerDisposalCleansOnlyUnclaimedRequestAndPreservesQueuedClaim()=scenario {model,store,file->
        val directory=CiphertextDirectory.get(context)
        val before=directory.listFiles().orEmpty().map {it.name}.toSet()
        val abandoned=prepare(model)
        val owned=directory.listFiles().orEmpty().filter {it.name !in before};assertEquals(1,owned.size)
        ins.runOnMainSync {model.exportPickerDisposed(abandoned)}
        val end=android.os.SystemClock.elapsedRealtime()+5000
        while(owned.any {it.exists()} && android.os.SystemClock.elapsedRealtime()<end) android.os.SystemClock.sleep(50)
        assertTrue(owned.none {it.exists()})
        val claimed=prepare(model);file.createNewFile()
        val csv=File(file.parentFile,"blocked-${Wire.id()}.csv");val database=store.writableDatabase
        database.beginTransaction()
        try {
            ins.runOnMainSync {model.exportCsv(Uri.fromFile(csv))};waitFor(model) {it.busy}
            ins.runOnMainSync {
                assertTrue(model.completeExport(claimed,Uri.fromFile(file)))
                model.exportPickerDisposed(claimed) // Queued behind CSV's held mutex.
                assertFalse(model.completeExport(claimed,null))
            }
        } finally {database.endTransaction()}
        try {waitFor(model) {!it.busy && it.message?.startsWith("Encrypted file exported and read back successfully.")==true}}
        finally {csv.delete()}
        assertTrue(file.length()>0)
    }
    @Test fun cancelDuringBlockedPreparationSuppressesLatePickerCallback()=scenario {model,store,_ ->
        val callback=java.util.concurrent.atomic.AtomicBoolean()
        val database=store.writableDatabase;database.beginTransaction()
        try {ins.runOnMainSync {model.prepareExport(recovery) {callback.set(true)}}
            waitFor(model) {it.busy};ins.runOnMainSync {model.cancelExport()}
        } finally {database.endTransaction()}
        waitFor(model) {!it.busy && it.message?.startsWith("Backup export could not be prepared.")==true}
        assertFalse(callback.get())
    }
    @Test fun boundedDestinationReadbackRejectsChangedTruncatedCloseFailureAndCancellation()=scenario {_,store,_ ->
        for(mode in listOf("success","changed","truncated","trailing","write-close","read-close","cancel-write","cancel-read","over-report")) {
            val operation=RestoreOperation();val root=Backup.key(recovery);val before=store.snapshot();var saved=byteArrayOf();var outputClosed=false;var inputClosed=false
            try {store.exportV4(root,operation).use {file->
                val destination=object:V4ExportDestination.Destination {
                    override fun openEmpty()=object:ByteArrayOutputStream() {
                        override fun close() {outputClosed=true;saved=toByteArray();super.close();if(mode=="write-close") throw IOException("destination close failed");if(mode=="cancel-write") operation.cancel()}
                    }
                    override fun read():InputStream {
                        val value=when(mode) {"changed"->saved.copyOf().also {it[it.lastIndex]=(it.last().toInt() xor 1).toByte()};"truncated"->saved.copyOf(saved.size-1);"trailing"->saved+byteArrayOf(0);else->saved}
                        return object:ByteArrayInputStream(value) {
                            override fun read(b:ByteArray,off:Int,len:Int):Int {if(mode=="over-report") return len+1;if(mode=="cancel-read") operation.cancel();return super.read(b,off,len)}
                            override fun close() {inputClosed=true;super.close();if(mode=="read-close") throw IOException("destination read close failed")}
                        }
                    }
                }
                if(mode=="success") V4ExportDestination.copyAndVerify(file,root,destination,operation) else fails {V4ExportDestination.copyAndVerify(file,root,destination,operation)}
                assertTrue(outputClosed);if(mode !in listOf("write-close","cancel-write")) assertTrue(inputClosed)
                assertTrue(saved.isNotEmpty());assertEquals(before,store.snapshot())
            }} finally {root.fill(0)}
        }
    }
}
