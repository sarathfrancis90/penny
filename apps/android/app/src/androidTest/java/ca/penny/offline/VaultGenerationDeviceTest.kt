package ca.penny.offline

import android.content.Context
import android.content.ContextWrapper
import android.database.sqlite.SQLiteDatabase
import androidx.test.platform.app.InstrumentationRegistry
import java.io.File
import java.security.KeyStore
import org.junit.Assert.*
import org.junit.Test

class VaultGenerationDeviceTest {
    private val instrumentation=InstrumentationRegistry.getInstrumentation()
    private fun fixture(name: String)=instrumentation.context.assets.open("local-generation-v1/$name.json").use {Snapshot.decode(StrictJson.objectFrom(it.readBytes()))}
    private fun equal(expected: Snapshot, actual: Snapshot) {assertEquals(expected.vaultId,actual.vaultId);assertEquals(expected.expenses.toSet(),actual.expenses.toSet());assertEquals(expected.attachments.toSet(),actual.attachments.toSet());assertEquals(expected.finance,actual.finance)}
    private fun fails(block: ()->Unit) {assertTrue(runCatching(block).isFailure)}
    private fun isolated(block: (Context,String)->Unit) {
        assertEquals("ca.penny.offline.dev.test",instrumentation.targetContext.packageName)
        val directory=File(instrumentation.targetContext.noBackupFilesDir,"generation-test-${Wire.id()}").apply {mkdir()}
        val context=object:ContextWrapper(instrumentation.targetContext) {override fun getNoBackupFilesDir()=directory}
        val alias="penny.generations.test.${Wire.id()}"
        try {block(context,alias)} finally {directory.deleteRecursively();KeyStore.getInstance("AndroidKeyStore").apply {load(null);deleteEntry(alias)}}
    }
    @Test fun migratesAllLegacyDomainsAndReopensDetachedReceipts()=isolated {context,alias ->
        val previous=fixture("previous")
        LegacyVaultRows(context,"vault.db",alias).use {old->old.replace(previous);old.writableDatabase.version=3}
        VaultStore(context,"vault.db",alias).use {store->equal(previous,store.snapshot());assertEquals(4,store.readableDatabase.version)
            assertEquals(0,store.readableDatabase.rawQuery("SELECT count(*) FROM attachments",null).use {it.moveToFirst();it.getInt(0)})}
        VaultStore(context,"vault.db",alias).use {equal(previous,it.snapshot())}
    }
    @Test fun preparationFailureAndStaleRevisionPreserveOldGeneration()=isolated {context,alias ->
        val old=fixture("previous");val next=fixture("replacement")
        VaultStore(context,"vault.db",alias).use {store->store.replace(old)
            val revision=store.revision();val incarnation=store.incarnation()
            for(point in listOf(VaultGenerations.Point.FILES_READY,VaultGenerations.Point.ROWS_READY)) {
                store.generations.fault={if(it==point) error("injected $point")};fails {store.replace(next,revision)}
                store.generations.fault={};equal(old,store.snapshot());assertEquals(revision,store.revision());assertEquals(incarnation,store.incarnation())
                assertEquals(1,store.readableDatabase.rawQuery("SELECT count(*) FROM vault_generations",null).use {it.moveToFirst();it.getInt(0)})
            }
            VaultStore(context,"vault.db",alias).use {second->second.save(old.expenses.first().copy(note="second connection"))}
            fails {store.replace(next,revision)};assertTrue(store.all().any {it.note=="second connection"})
            val binding=store.restoreBinding();store.replace(old)
            // Identity binding rejects even when a caller presents the current revision.
            fails {store.replace(next,store.revision(),binding)};equal(old,store.snapshot())
        }
    }
    @Test fun pendingPublicationReopensAndInvalidPendingRollsBackOnlyRecordedPredecessor()=isolated {context,alias ->
        val old=fixture("previous");val next=fixture("replacement")
        VaultStore(context,"vault.db",alias).use {store->store.replace(old);store.generations.fault={if(it==VaultGenerations.Point.POINTER_COMMITTED) error("simulated interruption")};fails {store.replace(next)}}
        VaultStore(context,"vault.db",alias).use {store->equal(next,store.snapshot());store.replace(old)
            val incarnation=store.incarnation();val revision=store.revision()
            store.generations.fault={if(it==VaultGenerations.Point.POINTER_COMMITTED) error("simulated interruption")};fails {store.replace(next)}
            store.generations.fault={}
            // New candidate is the row generation that differs from the previous vault's source ID.
            val ids=store.readableDatabase.rawQuery("SELECT id FROM vault_generations ORDER BY rowid DESC LIMIT 1",null).use {it.moveToFirst();it.getString(0)}
            store.writableDatabase.execSQL("UPDATE vault_rows SET sealed=zeroblob(length(sealed)) WHERE generationId=?",arrayOf(ids))
            fails {store.snapshot()};equal(old,store.snapshot());assertEquals(incarnation,store.incarnation());assertEquals(revision,store.revision())
            store.writableDatabase.execSQL("UPDATE vault_rows SET sealed=zeroblob(length(sealed))")
            fails {store.snapshot()};fails {store.snapshot()}
        }
    }
    @Test fun mutationsKeepFinanceConstraintsAndRollbackFailedTransaction()=isolated {context,alias ->
        val old=fixture("previous")
        VaultStore(context,"vault.db",alias).use {store->store.replace(old)
            val revision=store.revision();val changed=old.expenses.first().copy(note="new note")
            store.writableDatabase.execSQL("CREATE TEMP TRIGGER fail_write BEFORE INSERT ON metadata WHEN NEW.key='revision' BEGIN SELECT RAISE(ABORT,'injected revision'); END")
            fails {store.save(changed)};equal(old,store.snapshot());assertEquals(revision,store.revision())
            store.writableDatabase.execSQL("DROP TRIGGER fail_write")
            store.save(changed);assertEquals(changed,store.all().first {it.id==changed.id})
            val budget=old.finance.budgets.first().copy(limitMinor=54321);store.saveFinance(budget);assertTrue(store.finance().budgets.contains(budget))
            fails {store.saveFinance(IncomeEntry(sourceId=Wire.id(),amountMinor=1))}
            store.deleteAttachment(old.attachments.single().id);assertTrue(store.attachments().isEmpty())
            store.delete(changed.id);assertFalse(store.all().any {it.id==changed.id})
        }
    }
    @Test fun keyLossRequiresVerifiedRestoreAndMissingStateNeverInitializesEmptyVault()=isolated {context,alias ->
        val old=fixture("previous")
        VaultStore(context,"vault.db",alias).use {store->store.replace(old)
            val keys=KeyStore.getInstance("AndroidKeyStore").apply {load(null);deleteEntry(alias)}
            fails {store.snapshot()};assertFalse(keys.containsAlias(alias));store.replace(old);equal(old,store.snapshot())
            store.writableDatabase.execSQL("DELETE FROM metadata WHERE key='activeState'");fails {store.snapshot()}
            store.replace(old);equal(old,store.snapshot())
            val rows=store.readableDatabase.rawQuery("SELECT count(*) FROM vault_rows",null).use {it.moveToFirst();it.getInt(0)}
            store.writableDatabase.execSQL("DELETE FROM metadata WHERE key IN ('activeState','generationFormat')")
            fails {store.snapshot()};assertEquals(rows,store.readableDatabase.rawQuery("SELECT count(*) FROM vault_rows",null).use {it.moveToFirst();it.getInt(0)})
        }
    }
}
