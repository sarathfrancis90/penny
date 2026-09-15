package ca.penny.offline

import android.app.Application
import android.content.Context
import android.content.ContextWrapper
import androidx.lifecycle.ViewModelStore
import androidx.test.platform.app.InstrumentationRegistry
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import org.junit.Assert.*
import org.junit.Test
import java.io.File
import java.security.KeyStore
import java.util.concurrent.atomic.AtomicBoolean

class LiveStateDeviceTest {
    private val ins=InstrumentationRegistry.getInstrumentation()
    private fun json(path:String)=ins.context.assets.open(path).use {StrictJson.objectFrom(it.readBytes())}
    private fun source()=Snapshot.decode(json("v4-native-writer-v1/android-finance.snapshot.json"))
    private fun fixture()=json("live-state-v1/metadata-edit.json")
    private fun changed()=Expense.decode(fixture().getJSONObject("expenseAfter"),3)
    private fun fails(block:()->Unit) {assertNotNull(runCatching(block).exceptionOrNull())}
    private fun scenario(block:(VaultStore,Context,String,File)->Unit) {
        val target=ins.targetContext;check(target.packageName=="ca.penny.offline.dev.test")
        val root=File(target.noBackupFilesDir,"live-${Wire.id()}").apply {mkdir()}
        val context=object:ContextWrapper(target) {override fun getNoBackupFilesDir()=root}
        val alias="penny.live.${Wire.id()}"
        try {VaultStore(context,"vault.db",alias).use {store->
            store.liveState() // Initialize the empty receiving vault explicitly; v4 preparation never provisions keys.
            val key=Backup.key(fixture().getString("publicSyntheticRecoveryKey"))
            try {store.restoreV4(ins.context.assets.open("v4-native-writer-v1/android-finance.pennybackup"),key)} finally {key.fill(0)}
            block(store,context,alias,root)
        }} finally {root.deleteRecursively();KeyStore.getInstance("AndroidKeyStore").apply {load(null);deleteEntry(alias)}}
    }
    private fun receipts(root:File)=root.walkTopDown().filter {it.extension=="pennyreceipt"}.associate {it.absolutePath to CloudContract.sha256(it.readBytes())}
    private fun noHydration(store:VaultStore) {store.generations.fault={if(it==VaultGenerations.Point.SNAPSHOT_HYDRATION) error("unexpected aggregate hydration")}}
    @Test fun sharedMetadataEditPreservesAllDomainsCiphertextAndFreshReopen()=scenario {store,context,alias,root ->
        val before=store.snapshot();val files=receipts(root);noHydration(store)
        val live=store.liveState();assertEquals(before.expenses,live.expenses);assertEquals(before.finance,live.finance)
        assertEquals(before.attachments.map {ReceiptInfo(it.id,it.expenseId,it.mediaType,it.byteCount,it.sha256)},live.receipts)
        assertEquals(live.expenses,store.all());assertEquals(live.finance,store.finance())
        fails {(live.expenses as MutableList).clear()};fails {(live.receipts as MutableList).clear()}
        val after=store.editExpense(live,changed());assertEquals(files,receipts(root));assertEquals(live.receipts,after.receipts);assertEquals(live.finance,after.finance)
        assertEquals(fixture().getLong("expectedExpenseTotalMinor"),Money.total(after.expenses))
        val expected=before.copy(expenses=before.expenses.map {if(it.id==changed().id) changed() else it})
        assertEquals(6250L,FinanceMath.report(expected,"2026-01").getLong("expenseMinor"))
        fails {store.snapshot()};store.generations.fault={};assertEquals(expected,store.snapshot())
        VaultStore(context,"vault.db",alias).use {reopened->noHydration(reopened);assertEquals(after.expenses,reopened.liveState().expenses)
            reopened.generations.fault={};assertEquals(expected,reopened.snapshot());assertEquals(files,receipts(root))}
    }
    @Test fun ownedReadsAreWipedAndSurviveEditsReplacementAndReferenceCountedGc()=scenario {store,_,_,root ->
        val live=store.liveState();val id=live.receipts.single().id;val expected=source().attachments.single().bytes()
        val cancel=LocalReceiptBlob.Cancellation();val first=store.openReceipt(live,id,cancel);val second=store.openReceipt(live,id,LocalReceiptBlob.Cancellation())
        var borrowed:ByteArray?=null
        first.withBytes {borrowed=it;assertArrayEquals(expected,it)};assertTrue(borrowed!!.all {it==0.toByte()})
        store.editExpense(live,changed());val files=receipts(root)
        store.deleteAttachment(id);assertEquals(files,receipts(root))
        first.close();store.replace(Snapshot(Wire.id(),emptyList()));assertEquals(files,receipts(root))
        second.withBytes {assertArrayEquals(expected,it)};fails {first.withBytes {}}
        second.close();store.save(Expense(merchant="GC trigger",amountMinor=1,expenseDate="2026-01-01"));assertTrue(receipts(root).isEmpty())
        // Cancellation never yields bytes, before or after acquiring ownership.
        store.replace(source());val now=store.liveState();val token=LocalReceiptBlob.Cancellation().apply {cancel()}
        fails {store.openReceipt(now,id,token)}
        val pending=LocalReceiptBlob.Cancellation();store.openReceipt(now,id,pending).use {read->pending.cancel();fails {read.withBytes {error("must not run")}}}
        expected.fill(0)
    }
    @Test fun staleSecondInstanceAndKeyLossCannotEdit()=scenario {store,context,alias,root ->
        val live=store.liveState();VaultStore(context,"vault.db",alias).use {second->
            second.editExpense(second.liveState(),changed());val before=second.snapshot();fails {store.editExpense(live,changed().copy(merchant="stale"))};assertEquals(before,second.snapshot())
        }
        val now=store.liveState();val files=receipts(root)
        KeyStore.getInstance("AndroidKeyStore").apply {load(null);deleteEntry(alias)}
        fails {store.editExpense(now,changed())};fails {store.liveState()};fails {store.openReceipt(now,now.receipts.single().id,LocalReceiptBlob.Cancellation())};assertEquals(files,receipts(root))
    }
    @Test fun cancellationAndActualSqlAbortKeepOriginalStateAndReceipts()=scenario {store,_,_,root ->
        val before=store.snapshot();val files=receipts(root)
        for(point in listOf(VaultGenerations.Point.LIVE_EDIT_READY,VaultGenerations.Point.LIVE_EDIT_WRITTEN)) {
            val token=RestoreOperation();store.generations.fault={if(it==point) token.cancel()}
            fails {store.editExpense(store.liveState(),changed(),token)};store.generations.fault={};assertEquals(before,store.snapshot());assertEquals(files,receipts(root))
        }
        store.writableDatabase.execSQL("CREATE TEMP TRIGGER fail_live BEFORE INSERT ON metadata WHEN NEW.key='revision' BEGIN SELECT RAISE(ABORT,'live transaction failure'); END")
        fails {store.editExpense(store.liveState(),changed())};assertEquals(before,store.snapshot());assertEquals(files,receipts(root));store.writableDatabase.execSQL("DROP TRIGGER fail_live")
    }
    @Test fun liveOpenAndEditRejectCorruptReceiptOrAuthenticatedCatalog()=scenario {store,_,_,root ->
        val live=store.liveState();val file=root.walkTopDown().single {it.extension=="pennyreceipt"};val bytes=file.readBytes()
        file.writeBytes(bytes.copyOf().also {it[it.lastIndex]=(it.last().toInt() xor 1).toByte()})
        fails {store.liveState()};fails {store.editExpense(live,changed())};assertEquals(1,receipts(root).size)
        file.writeBytes(bytes);store.writableDatabase.execSQL("DELETE FROM vault_rows WHERE domain='budgets'")
        fails {store.liveState()};fails {store.editExpense(live,changed())};assertArrayEquals(bytes,file.readBytes())
    }
    @Test fun receiptRefreshNeverUpgradesStaleEditorFields()=scenario {store,context,alias,_ ->
        val ai=object:ReceiptIntelligence {override suspend fun status()=NanoState.UNAVAILABLE;override suspend fun text(bytes:ByteArray)=error("unused");override suspend fun proposal(draft:ReceiptDraft)=draft;override fun close(){}}
        val owner=ViewModelStore();lateinit var model:PennyViewModel
        ins.runOnMainSync {model=PennyViewModel(ins.targetContext.applicationContext as Application,ai,store);owner.put("test",model)}
        fun settled(message:Boolean=false)=runBlocking {withTimeout(15000) {model.state.first {it.ready && !it.busy && (!message || it.message!=null)}}}
        try {
            val initial=settled();val original=initial.expenses.single {it.id==changed().id}
            VaultStore(context,"vault.db",alias).use {second->second.editExpense(second.liveState(),changed())}
            ins.runOnMainSync {model.deleteReceipt(initial.attachments.single().id)};settled(true)
            val before=store.snapshot();val callback=AtomicBoolean()
            ins.runOnMainSync {model.clearMessage();model.save(original.copy(merchant="stale form"),CloudContract.sha256(StrictJson.bytes(original.json()))) {callback.set(true)}}
            val rejected=settled(true);assertFalse(callback.get());assertEquals(before.expenses,rejected.expenses);assertEquals(before,store.snapshot())
        } finally {ins.runOnMainSync {owner.clear()}}
    }
    @Test fun actualViewModelOpenAndMetadataSaveNeverHydrateOrOptimisticallyPublish()=scenario {store,_,_,_ ->
        val ai=object:ReceiptIntelligence {override suspend fun status()=NanoState.UNAVAILABLE;override suspend fun text(bytes:ByteArray)=error("unused");override suspend fun proposal(draft:ReceiptDraft)=draft;override fun close(){}}
        val owner=ViewModelStore();lateinit var model:PennyViewModel;noHydration(store)
        ins.runOnMainSync {model=PennyViewModel(ins.targetContext.applicationContext as Application,ai,store);owner.put("test",model)}
        fun settled(message:Boolean=false)=runBlocking {withTimeout(15000) {model.state.first {it.ready && !it.busy && (!message || it.message!=null)}}}
        try {
            val before=settled();val done=AtomicBoolean()
            store.generations.fault={if(it==VaultGenerations.Point.SNAPSHOT_HYDRATION || it==VaultGenerations.Point.LIVE_EDIT_WRITTEN) error("injected")}
            ins.runOnMainSync {model.save(changed()) {done.set(true)}};val failed=settled(true);assertEquals(before.expenses,failed.expenses);assertFalse(done.get())
            noHydration(store);ins.runOnMainSync {model.clearMessage();model.save(changed()) {done.set(true)}}
            val next=settled(true);assertEquals("Saved on this device",next.message);assertEquals(before.attachments,next.attachments)
            model.openReceipt(next.attachments.single().id,LocalReceiptBlob.Cancellation()).use {it.withBytes {bytes->assertEquals(next.attachments.single().sha256,Attachment.digest(bytes))}}
        } finally {ins.runOnMainSync {owner.clear()}}
    }
}
