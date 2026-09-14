package ca.penny.offline

import android.app.Application
import android.net.Uri
import androidx.lifecycle.ViewModelStore
import androidx.test.platform.app.InstrumentationRegistry
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import java.io.File
import java.io.ByteArrayInputStream
import java.security.KeyStore
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger
import org.junit.Assert.*
import org.junit.Test

class V4FilesRestoreDeviceTest {
    private val ins=InstrumentationRegistry.getInstrumentation()
    private val context=ins.targetContext
    private val key="pny1-"+"07".repeat(32)
    private val ai=object:ReceiptIntelligence {override suspend fun status()=NanoState.UNAVAILABLE;override suspend fun text(bytes:ByteArray):String=error("unused");override suspend fun proposal(draft:ReceiptDraft)=draft;override fun close(){}}
    private fun bytes(name:String)=ins.context.assets.open("v4-frames/$name.pennyframe").use {it.readBytes()}
    private fun previous()=ins.context.assets.open("local-generation-v1/previous.json").use {Snapshot.decode(StrictJson.objectFrom(it.readBytes()))}
    private fun waitFor(model:PennyViewModel, predicate:(VaultUiState)->Boolean)=runBlocking {withTimeout(15000) {model.state.first(predicate)}}
    private fun scenario(body:(PennyViewModel,VaultStore,File,String,String)->Unit) {
        check(context.packageName=="ca.penny.offline.dev.test")
        val id=Wire.id();val db="files-v4-$id.db";val alias="penny.files.$id";val file=File(context.cacheDir,"files-$id.pennybackup")
        val store=VaultStore(context,db,alias);val owner=ViewModelStore();lateinit var model:PennyViewModel
        try {
            store.replace(previous())
            ins.runOnMainSync {model=PennyViewModel(context.applicationContext as Application,ai,store);owner.put("model",model)}
            waitFor(model) {it.ready && !it.busy};body(model,store,file,db,alias)
        } finally {ins.runOnMainSync {owner.clear()};store.close();file.delete();android.database.sqlite.SQLiteDatabase.deleteDatabase(File(context.noBackupFilesDir,db));KeyStore.getInstance("AndroidKeyStore").apply {load(null);deleteEntry(alias)}}
    }
    @Test fun realV4FilesPreviewHasNoSnapshotAndPublishesOnlyAfterConfirmation()=scenario {model,store,file,db,alias->
        val before=store.snapshot();file.writeBytes(bytes("one-receipt"))
        store.generations.fault={if(it==VaultGenerations.Point.SNAPSHOT_HYDRATION) error("Preview must not hydrate")}
        ins.runOnMainSync {model.preview(Uri.fromFile(file),key)}
        val state=waitFor(model) {!it.busy && (it.restoreSummary!=null || it.message!=null)}
        assertNotNull(state.message,state.restoreSummary)
        assertEquals(4,state.restoreSummary!!.version);assertEquals(1,state.restoreSummary!!.counts["attachments"]);assertNull(state.restorePreview)
        store.generations.fault={};assertEquals(before,store.snapshot())
        ins.runOnMainSync {model.restore();model.restore()}
        waitFor(model) {!it.busy && it.message=="Backup restored on this device"}
        assertNull(model.state.value.restoreSummary);val next=store.snapshot();assertEquals(1,next.expenses.size);assertEquals(1,next.attachments.size)
        assertNotEquals(before.snapshotId,next.snapshotId);assertEquals(next,store.snapshot());VaultStore(context,db,alias).use {assertEquals(next,it.snapshot())}
    }
    @Test fun wrongKeyMalformedV4CancelAndStaleConfirmationNeverReplace()=scenario {model,store,file,_,_->
        val before=store.snapshot()
        for(data in listOf(bytes("one-receipt"),bytes("one-receipt").copyOf(9))) {
            file.writeBytes(data);ins.runOnMainSync {model.preview(Uri.fromFile(file),"pny1-"+"08".repeat(32))}
            waitFor(model) {!it.busy && it.message?.startsWith("Backup preview failed.")==true}
            assertNull(model.state.value.restoreSummary);assertEquals(before,store.snapshot())
        }
        file.writeBytes(bytes("one-receipt"));ins.runOnMainSync {model.preview(Uri.fromFile(file),key)}
        waitFor(model) {!it.busy && it.restoreSummary!=null};ins.runOnMainSync {model.cancelRestore()};assertNull(model.state.value.restoreSummary)
        ins.runOnMainSync {model.preview(Uri.fromFile(file),key)};waitFor(model) {!it.busy && it.restoreSummary!=null}
        val edited=store.save(before.expenses.first().copy(note="intervening edit"))
        ins.runOnMainSync {model.restore()};waitFor(model) {!it.busy && it.message?.startsWith("Restore could not finish.")==true}
        assertEquals(edited,store.snapshot());assertNull(model.state.value.restoreSummary)
    }
    @Test fun cancellationDuringOneOwnedInputReadClosesAndSuppressesLatePreview() {
        val id=Wire.id();val db="files-cancel-$id.db";val alias="penny.files.$id";val store=VaultStore(context,db,alias)
        val owner=ViewModelStore();lateinit var model:PennyViewModel
        val entered=CountDownLatch(1);val proceed=CountDownLatch(1);val opens=AtomicInteger();val closes=AtomicInteger()
        try {
            store.replace(previous());val old=store.snapshot()
            ins.runOnMainSync {model=PennyViewModel(context.applicationContext as Application,ai,store) {
                assertNotEquals(android.os.Looper.getMainLooper(),android.os.Looper.myLooper());opens.incrementAndGet()
                object:ByteArrayInputStream(bytes("one-receipt")) {
                    override fun read(b:ByteArray,off:Int,len:Int):Int {entered.countDown();check(proceed.await(10,TimeUnit.SECONDS));return super.read(b,off,len)}
                    override fun close() {closes.incrementAndGet();super.close()}
                }
            };owner.put("model",model)}
            waitFor(model) {it.ready && !it.busy};ins.runOnMainSync {model.preview(Uri.EMPTY,key)}
            assertTrue(entered.await(10,TimeUnit.SECONDS));ins.runOnMainSync {model.cancelRestore()};proceed.countDown()
            waitFor(model) {!it.busy && it.message!=null};assertNull(model.state.value.restoreSummary)
            assertEquals(1,opens.get());assertEquals(1,closes.get());assertEquals(old,store.snapshot())
        } finally {proceed.countDown();ins.runOnMainSync {owner.clear()};store.close();android.database.sqlite.SQLiteDatabase.deleteDatabase(File(context.noBackupFilesDir,db));KeyStore.getInstance("AndroidKeyStore").apply {load(null);deleteEntry(alias)}}
    }
}
