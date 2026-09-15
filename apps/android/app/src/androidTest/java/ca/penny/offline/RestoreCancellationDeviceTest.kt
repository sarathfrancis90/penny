package ca.penny.offline

import android.app.Application
import android.net.Uri
import androidx.lifecycle.ViewModelStore
import androidx.test.platform.app.InstrumentationRegistry
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import java.io.File
import java.security.KeyStore
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import org.junit.Assert.*
import org.junit.Test

class RestoreCancellationDeviceTest {
    private val instrumentation=InstrumentationRegistry.getInstrumentation()
    private fun fixture(name:String)=instrumentation.context.assets.open("local-generation-v1/$name.json").use {Snapshot.decode(StrictJson.objectFrom(it.readBytes()))}
    @Test fun realLocalPreviewCancelStopsBeforePublicationAndLateCancelDoesNotLie() {
        val context=instrumentation.targetContext;check(context.packageName=="ca.penny.offline.dev.test")
        for(point in listOf(VaultGenerations.Point.FILES_READY,VaultGenerations.Point.POINTER_COMMITTED,VaultGenerations.Point.REOPENED)) {
            val id=Wire.id();val name="cancel-$id.db";val alias="penny.cancel.$id";val store=VaultStore(context,name,alias)
            val input=File(context.cacheDir,"cancel-$id.pennybackup")
            val owner=ViewModelStore();lateinit var model:PennyViewModel
            val ai=object:ReceiptIntelligence {override suspend fun status()=NanoState.UNAVAILABLE;override suspend fun text(bytes:ByteArray):String=error("unused");override suspend fun proposal(draft:ReceiptDraft)=draft;override fun close(){}}
            try {
                val old=fixture("previous");val next=fixture("replacement");store.replace(old)
                val key=Backup.recoveryKey();input.writeBytes(Backup.encrypt(next,key))
                instrumentation.runOnMainSync {model=PennyViewModel(context.applicationContext as Application,ai,store);owner.put("test",model)}
                runBlocking {withTimeout(10000) {model.state.first {it.ready && !it.busy}}}
                instrumentation.runOnMainSync {model.preview(Uri.fromFile(input),key)}
                runBlocking {withTimeout(10000) {model.state.first {!it.busy && it.restorePreview!=null}}}
                val staged=CountDownLatch(1);val proceed=CountDownLatch(1)
                store.generations.fault={if(it==point) {if(point==VaultGenerations.Point.REOPENED) error("injected post-publication verification failure");staged.countDown();check(proceed.await(10,TimeUnit.SECONDS))}}
                instrumentation.runOnMainSync {model.restore();model.restore()}
                if(point!=VaultGenerations.Point.REOPENED) {assertTrue(staged.await(10,TimeUnit.SECONDS));instrumentation.runOnMainSync {model.cancelRestore()};proceed.countDown()}
                val state=runBlocking {withTimeout(10000) {model.state.first {!it.busy && it.message!=null}}}
                store.generations.fault={}
                instrumentation.runOnMainSync {model.cancelRestore()};assertNull(model.state.value.restorePreview)
                val expected=if(point==VaultGenerations.Point.FILES_READY) old else next
                assertEquals(expected.expenses.toSet(),store.snapshot().expenses.toSet())
                if(point==VaultGenerations.Point.REOPENED) assertTrue(state.message!!.startsWith("Restore could not finish."))
                else {assertEquals(expected.expenses.toSet(),state.expenses.toSet());assertEquals(if(point==VaultGenerations.Point.FILES_READY) "Restore cancelled before replacement." else "Backup restored on this device",state.message)}
            } finally {instrumentation.runOnMainSync {owner.clear()};store.close();input.delete();android.database.sqlite.SQLiteDatabase.deleteDatabase(File(context.noBackupFilesDir,name));KeyStore.getInstance("AndroidKeyStore").apply {load(null);deleteEntry(alias)}}
        }
    }
    @Test fun candidateTamperBeforePointerKeepsPreviousLedger() {
        val context=instrumentation.targetContext;check(context.packageName=="ca.penny.offline.dev.test")
        val id=Wire.id();val name="tamper-$id.db";val alias="penny.tamper.$id"
        VaultStore(context,name,alias).use {store ->
            try {val old=fixture("previous");store.replace(old);val revision=store.revision()
                store.generations.fault={if(it==VaultGenerations.Point.ROWS_READY) store.writableDatabase.execSQL("UPDATE vault_rows SET sealed=zeroblob(length(sealed)) WHERE generationId=(SELECT id FROM vault_generations ORDER BY rowid DESC LIMIT 1)")}
                assertTrue(runCatching {store.replace(fixture("replacement"))}.isFailure)
                assertEquals(old.expenses.toSet(),store.snapshot().expenses.toSet());assertEquals(revision,store.revision())
            } finally {android.database.sqlite.SQLiteDatabase.deleteDatabase(File(context.noBackupFilesDir,name));KeyStore.getInstance("AndroidKeyStore").apply {load(null);deleteEntry(alias)}}
        }
    }
}
