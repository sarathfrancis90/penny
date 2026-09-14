package ca.penny.offline

import android.content.Context
import android.content.ContextWrapper
import android.system.Os
import androidx.test.platform.app.InstrumentationRegistry
import ca.penny.v4frameprobe.NativeFrames
import java.io.*
import java.security.KeyStore
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

class V4ExportDeviceTest {
    private val instrumentation get()=InstrumentationRegistry.getInstrumentation()
    private val root get()=ByteArray(32) {7}
    private fun fixture()=Snapshot.decode(StrictJson.objectFrom(instrumentation.context.assets.open("snapshot-v3.json").use {it.readBytes()}))
    private fun fails(block:()->Unit)=checkNotNull(runCatching(block).exceptionOrNull())
    private fun state(s:VaultStore)=s.readableDatabase.rawQuery("SELECT key,value FROM metadata ORDER BY key",null).use {r->buildMap {while(r.moveToNext()) put(r.getString(0),r.getString(1))}}
    private fun isolated(block:(VaultStore,Context,String,File)->Unit) {
        val target=instrumentation.targetContext;assertEquals("ca.penny.offline.dev.test",target.packageName)
        val dir=File(target.noBackupFilesDir,"v4-export-test-${Wire.id()}").apply {mkdir()};val alias="penny.test.v4.export.${Wire.id()}"
        val context=object:ContextWrapper(target) {override fun getNoBackupFilesDir()=dir}
        try {VaultStore(context,"v4-export-${Wire.id()}.db",alias).use {it.replace(fixture());block(it,context,alias,dir)}}
        finally {dir.deleteRecursively();KeyStore.getInstance("AndroidKeyStore").apply {load(null);deleteEntry(alias)};assertEquals(0,NativeFrames.activeHandlesForTests())}
    }
    private fun compare(expected:Snapshot,actual:Snapshot) {
        assertEquals(expected.vaultId,actual.vaultId);assertEquals(expected.snapshotId,actual.snapshotId);assertEquals(expected.createdAt,actual.createdAt)
        assertEquals(expected.expenses.toSet(),actual.expenses.toSet());assertEquals(expected.finance,actual.finance)
        assertEquals(expected.attachments.toSet(),actual.attachments.toSet());expected.attachments.forEach {d->assertArrayEquals(d.bytes(),actual.attachments.single {it.id==d.id}.bytes())}
    }
    @Test fun actualPlatformContextUsesPrivateCiphertextChild() {
        val context=instrumentation.targetContext;assertEquals("ca.penny.offline.dev.test",context.packageName)
        val name="v4-platform-${Wire.id()}.db";val alias="penny.test.v4.platform.${Wire.id()}"
        val mode=Os.stat(context.noBackupFilesDir.path).st_mode
        try {VaultStore(context,name,alias).use {store->store.replace(fixture())
            store.exportV4(root).use {file->val bytes=ByteArrayOutputStream();file.copyTo(bytes);store.restoreV4(ByteArrayInputStream(bytes.toByteArray()),root);compare(fixture(),store.snapshot())}
            assertEquals(mode,Os.stat(context.noBackupFilesDir.path).st_mode)
            assertEquals(448,Os.stat(File(context.noBackupFilesDir,CiphertextDirectory.NAME).path).st_mode and 511)
        }} finally {context.deleteDatabase(name);KeyStore.getInstance("AndroidKeyStore").apply {load(null);deleteEntry(alias)}}
    }
    @Test fun financeReceiptsEscapingExportReadbackInstallAndReopen()=isolated {store,context,alias,dir->
        val initial=fixture();val expected=initial.copy(expenses=initial.expenses.map {it.copy(note="Quotes \" \\ newline\n tab\t café 🍁")})
        store.replace(expected);val before=state(store)
        store.generations.fault={if(it==VaultGenerations.Point.SNAPSHOT_HYDRATION) error("No aggregate hydration during export")}
        val file=store.exportV4(root)
        store.generations.fault={};assertEquals(before,state(store));assertEquals(expected.vaultId,file.source.vaultId)
        val exportDir=File(instrumentation.targetContext.filesDir,"v4-writer-exports").apply {mkdirs()}
        val export=File(exportDir,"android-finance.pennybackup");file.copyTo(export.outputStream())
        assertEquals(file.byteCount,export.length());assertEquals(file.sha256,Attachment.digest(export.readBytes()))
        File(exportDir,"expected.snapshot.json").writeBytes(StrictJson.bytes(expected.json()))
        File(exportDir,"manifest.json").writeText(JSONObject().put("producer","Android actual app native v4 writer").put("api",android.os.Build.VERSION.SDK_INT)
            .put("file",export.name).put("recoveryKey","pny1-"+"07".repeat(32)).put("ciphertextBytes",file.byteCount).put("ciphertextSha256",file.sha256)
            .put("snapshotFile","expected.snapshot.json").put("snapshotSha256",Attachment.digest(StrictJson.bytes(expected.json())))
            .put("transcriptSha256",file.summary.transcriptSha256).toString(2))
        file.close();fails {file.copyTo(ByteArrayOutputStream())};assertTrue(dir.walkTopDown().none {it.extension=="ciphertext"})
        store.restoreV4(export.inputStream(),root)
        VaultStore(context,File(store.readableDatabase.path).name,alias).use {compare(expected,it.snapshot())}
    }
    @Test fun cancellationStageErrorsPartialWriteAndReadbackTamperCleanOwnedOnly() {
        for(point in V4Export.Point.entries) isolated {store,_,_,dir->
            val before=state(store);val token=RestoreOperation();val sibling=File(dir,"unrelated").apply {writeText("keep")}
            var reached=false
            fails {store.exportV4(root,token) {at,file->if(at==point && !reached) {reached=true
                if(point==V4Export.Point.WRITE) {assertTrue(file.length()>0);throw IOException("after partial ciphertext write")}
                if(point==V4Export.Point.SYNCED || point==V4Export.Point.CLOSED) throw IOException("after successful real $point")
                token.cancel()
            }}}
            assertTrue("Reached $point",reached);assertEquals(before,state(store));assertEquals("keep",sibling.readText());assertTrue(dir.walkTopDown().none {it.extension=="ciphertext"})
        }
        isolated {store,_,_,dir->
            val before=state(store);var changed=false
            fails {store.exportV4(root) {point,file->if(point==V4Export.Point.CLOSED && !changed) {changed=true;Os.chmod(file.path,384);RandomAccessFile(file,"rw").use {it.seek(100);it.write(88)};Os.chmod(file.path,256)}}}
            assertTrue(changed);assertEquals(before,state(store));assertTrue(dir.walkTopDown().none {it.extension=="ciphertext"})
        }
    }
    @Test fun missingKeyAtCaptureOrLeaseReleaseNeverProvisionsOrReturnsOutput() {
        for(late in listOf(false,true)) isolated {store,_,alias,dir->
            val before=state(store);val keys=KeyStore.getInstance("AndroidKeyStore").apply {load(null)}
            if(!late) keys.deleteEntry(alias)
            fails {store.exportV4(root) {point,_->if(late && point==V4Export.Point.SOURCE_READY) keys.deleteEntry(alias)}}
            assertFalse(keys.containsAlias(alias));assertEquals(before,state(store));assertTrue(dir.walkTopDown().none {it.extension=="ciphertext"})
        }
    }
    @Test fun sourceLeaseBlocksOrdinaryWriteAndRejectsReentrantMutation() {
        isolated {store,context,alias,_->
            val started=CountDownLatch(1);val done=CountDownLatch(1);var failure:Throwable?=null;var thread:Thread?=null
            val file=store.exportV4(root) {point,_->if(point==V4Export.Point.SOURCE_READY) {
                thread=Thread {try {started.countDown();VaultStore(context,File(store.readableDatabase.path).name,alias).use {other->other.save(other.all().first().copy(note="after export"))}} catch(e:Throwable) {failure=e} finally {done.countDown()}}.apply {start()}
                assertTrue(started.await(5,TimeUnit.SECONDS));assertFalse(done.await(100,TimeUnit.MILLISECONDS))
            }}
            assertTrue(done.await(10,TimeUnit.SECONDS));thread!!.join();failure?.let {throw it}
            val out=ByteArrayOutputStream();file.copyTo(out);file.close()
            assertTrue(store.all().any {it.note=="after export"});store.restoreV4(ByteArrayInputStream(out.toByteArray()),root);compare(fixture(),store.snapshot())
        }
        isolated {store,_,_,dir->
            val before=state(store)
            fails {store.exportV4(root) {point,_->if(point==V4Export.Point.SOURCE_READY) store.save(store.all().first().copy(note="nested mutation"))}}
            assertEquals(before,state(store));assertTrue(dir.walkTopDown().none {it.extension=="ciphertext"})
        }
    }
    @Test fun multiFrameMetadataAndCurrentSourceCapacityRemainBounded()=isolated {store,_,_,_->
        assertEquals(15727872,V4BackupReader.maxPolicyMetadataBytes)
        V4BackupReader.requirePolicyMetadata(15727872);fails {V4BackupReader.requirePolicyMetadata(15727873)}
        val base=fixture();val template=base.expenses.first().copy(recurringTemplateId=null,recurringOccurrenceDate=null)
        val rows=(0 until 600).map {template.copy(id="%08x-aaaa-4aaa-8aaa-aaaaaaaaaaaa".format(it),note="é".repeat(1000))}
        val expected=base.copy(expenses=rows,attachments=emptyList());store.replace(expected)
        store.exportV4(root).use {file->assertTrue(file.byteCount>1048576);val out=ByteArrayOutputStream();file.copyTo(out);store.restoreV4(ByteArrayInputStream(out.toByteArray()),root);compare(expected,store.snapshot())}
        val before=state(store)
        fails {store.replace(base.copy(expenses=(0..10000).map {template.copy(id="%08x-bbbb-4bbb-8bbb-bbbbbbbbbbbb".format(it))},attachments=emptyList()))}
        assertEquals(before,state(store))
    }
}
