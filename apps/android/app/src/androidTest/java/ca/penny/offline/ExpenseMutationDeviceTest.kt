package ca.penny.offline

import android.app.Application
import androidx.lifecycle.ViewModelStore
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File
import java.security.KeyStore
import java.util.concurrent.atomic.AtomicBoolean

@RunWith(AndroidJUnit4::class)
class ExpenseMutationDeviceTest {
    private val instrumentation=InstrumentationRegistry.getInstrumentation()
    private val context get()=instrumentation.targetContext
    private fun isolated(block: (VaultStore,String,String)->Unit) {
        check(context.packageName=="ca.penny.offline.dev.test")
        val id=Wire.id();val name="test-mutation-$id.db";val alias="penny.test.mutation.$id"
        try { VaultStore(context,name,alias).use {block(it,name,alias)} }
        finally {android.database.sqlite.SQLiteDatabase.deleteDatabase(File(context.noBackupFilesDir,name));KeyStore.getInstance("AndroidKeyStore").apply {load(null);deleteEntry(alias)}}
    }
    private fun golden()=Snapshot.decode(StrictJson.objectFrom(instrumentation.context.assets.open("snapshot-v3.json").use {it.readBytes()}))
    private fun oracle(store: VaultStore, result: Snapshot) {
        val actual=store.snapshot();Backup.requireCapacity(actual)
        assertEquals(actual.vaultId,result.vaultId);assertEquals(actual.expenses,result.expenses)
        assertEquals(actual.attachments.toSet(),result.attachments.toSet());assertEquals(actual.finance,result.finance)
        assertEquals(FinanceMath.report(actual,"2026-09").toString(),FinanceMath.report(result,"2026-09").toString())
    }
    private fun sealedState(store: VaultStore)=buildMap<String,String> {
        (listOf("expenses","attachments")+FinanceData.limits.keys).forEach {table ->
            store.readableDatabase.rawQuery("SELECT id,hex(sealed) FROM $table",null).use {while(it.moveToNext())put("$table/${it.getString(0)}",it.getString(1))}
        }
        store.readableDatabase.rawQuery("SELECT generationId,domain,id,hex(sealed) FROM vault_rows",null).use {while(it.moveToNext())put("row/${it.getString(0)}/${it.getString(1)}/${it.getString(2)}",it.getString(3))}
        store.readableDatabase.rawQuery("SELECT id,hex(wrappedKey),hex(sealedHeader) FROM vault_generations",null).use {while(it.moveToNext())put("generation/${it.getString(0)}",it.getString(1)+":"+it.getString(2))}
        store.readableDatabase.rawQuery("SELECT key,value FROM metadata",null).use {while(it.moveToNext())put("metadata/${it.getString(0)}",it.getString(1))}
    }
    @Test fun returnedViewsMatchFullValidationAndReadSecondConnectionChanges()=isolated {store,name,alias ->
        store.replace(golden())
        VaultStore(context,name,alias).use {second ->
            val stale=store.snapshot();val oldRevision=store.revision()
            second.saveFinance(stale.finance.budgets.first().copy(limitMinor=54321))
            val outside=Expense(merchant="Other connection",amountMinor=123,expenseDate="2025-01-01")
            second.save(outside)
            val changed=stale.expenses.first().copy(expenseDate="2024-01-01",merchant="Edited first")
            val saved=store.save(changed);oracle(second,saved)
            assertTrue(saved.expenses.contains(outside))
            assertEquals(54321L,saved.finance.budgets.first {it.id==stale.finance.budgets.first().id}.limitMinor)
            assertTrue(store.revision()>oldRevision)
            assertTrue(runCatching {store.replace(stale,oldRevision)}.isFailure)
            val owner=Expense(merchant="Receipt owner",amountMinor=765,expenseDate="2026-09-13")
            val receipt=Attachment.fromBytes(owner.id,instrumentation.context.assets.open("receipt.png").use {it.readBytes()})
            oracle(second,store.save(owner,listOf(receipt)))
            val deleted=store.delete(owner.id);oracle(second,deleted)
            assertFalse(deleted.attachments.any {it.expenseId==owner.id})
            // A restore on the other connection rotates the wrapped data key.
            second.replace(golden())
            oracle(second,store.save(outside))
        }
    }
    @Test fun failedValidationOrLateTransactionNeverReturnsCommittedState()=isolated {store,_,_ ->
        store.replace(golden());val before=sealedState(store)
        val original=store.all().first()
        val invalid=original.copy(id=Wire.id(),recurringTemplateId=Wire.id(),recurringOccurrenceDate="2026-09-13")
        assertTrue(runCatching {store.save(invalid)}.isFailure);assertEquals(before,sealedState(store))
        val wrongOwner=golden().attachments.first().copy(id=Wire.id(),expenseId=Wire.id())
        assertTrue(runCatching {store.save(original,listOf(wrongOwner))}.isFailure);assertEquals(before,sealedState(store))
        // Fail after rows have changed but before revision can commit.
        store.writableDatabase.execSQL("CREATE TEMP TRIGGER fail_revision BEFORE INSERT ON metadata WHEN NEW.key='revision' BEGIN SELECT RAISE(ABORT,'injected late write'); END")
        assertTrue(runCatching {store.save(original.copy(merchant="Must not commit"))}.isFailure)
        assertEquals(before,sealedState(store))
        assertTrue(runCatching {store.delete(original.id)}.isFailure);assertEquals(before,sealedState(store))
        store.writableDatabase.execSQL("DROP TRIGGER fail_revision")
        oracle(store,store.save(original.copy(merchant="Committed after failure")))
    }
    @Test fun warmedStoreStillRejectsCorruptAndMissingKeys()=isolated {store,_,alias ->
        store.replace(golden());val expense=store.all().first();val before=sealedState(store)
        store.writableDatabase.execSQL("UPDATE metadata SET value='damaged' WHERE key='activeState'")
        val damaged=sealedState(store)
        assertTrue(runCatching {store.save(expense)}.isFailure)
        assertTrue(runCatching {store.delete(expense.id)}.isFailure);assertEquals(damaged,sealedState(store))
        store.writableDatabase.execSQL("UPDATE metadata SET value=? WHERE key='activeState'",arrayOf(before.getValue("metadata/activeState")))
        val keys=KeyStore.getInstance("AndroidKeyStore").apply {load(null);deleteEntry(alias)}
        assertTrue(runCatching {store.save(expense)}.isFailure)
        assertTrue(runCatching {store.delete(expense.id)}.isFailure)
        assertEquals(before,sealedState(store));assertFalse(keys.containsAlias(alias))
    }
    @Test fun viewModelPublishesOnlyAfterSuccessfulCommit()=isolated {store,_,_ ->
        store.replace(golden())
        val fake=object:ReceiptIntelligence {
            override suspend fun status()=NanoState.UNAVAILABLE
            override suspend fun text(bytes:ByteArray):String=error("unused")
            override suspend fun proposal(draft:ReceiptDraft):ReceiptDraft=error("unused")
            override fun close() {}
        }
        val owner=ViewModelStore();lateinit var model:PennyViewModel
        instrumentation.runOnMainSync {model=PennyViewModel(context.applicationContext as Application,fake,store);owner.put("test",model)}
        fun settled()=runBlocking {withTimeout(15000) {model.state.first {it.ready && !it.busy && it.message!=null}}}
        try {
            val initial=runBlocking {withTimeout(15000) {model.state.first {it.ready && !it.busy}}}
            val changed=initial.expenses.first().copy(merchant="UI committed")
            store.writableDatabase.execSQL("CREATE TEMP TRIGGER fail_revision BEFORE INSERT ON metadata WHEN NEW.key='revision' BEGIN SELECT RAISE(ABORT,'injected late write'); END")
            val callback=AtomicBoolean(false)
            instrumentation.runOnMainSync {model.save(changed) {callback.set(true)}}
            val failed=settled();assertEquals(initial.expenses,failed.expenses);assertEquals(initial.attachments,failed.attachments)
            assertFalse(callback.get());assertFalse(failed.message=="Saved on this device")
            instrumentation.runOnMainSync {model.clearMessage();model.delete(initial.expenses.first())}
            assertEquals(initial.expenses,settled().expenses)
            store.writableDatabase.execSQL("DROP TRIGGER fail_revision")
            instrumentation.runOnMainSync {model.clearMessage();model.save(changed) {callback.set(true)}}
            val saved=settled();assertTrue(callback.get());assertEquals(store.all(),saved.expenses)
            assertEquals("Saved on this device",saved.message)
        } finally {instrumentation.runOnMainSync {owner.clear()}}
    }
}
