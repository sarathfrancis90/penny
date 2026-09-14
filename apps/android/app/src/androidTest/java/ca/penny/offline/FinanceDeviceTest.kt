package ca.penny.offline

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File
import java.security.KeyStore

@RunWith(AndroidJUnit4::class)
class FinanceDeviceTest {
    private val context get()=InstrumentationRegistry.getInstrumentation().targetContext
    private fun fixture(name:String)=InstrumentationRegistry.getInstrumentation().context.assets.open(name).use { it.readBytes() }
    private fun golden()=Backup.decrypt(fixture("backup-v3.pennybackup"),StrictJson.objectFrom(fixture("golden-vector-v3.json")).getString("recoveryKey"))
    private fun isolated(test:(VaultStore,String,String)->Unit) {
        val suffix=Wire.id();val name="finance-test-$suffix.db";val alias="penny.finance.test.$suffix";val store=VaultStore(context,name,alias)
        try { test(store,name,alias) } finally { store.close();android.database.sqlite.SQLiteDatabase.deleteDatabase(File(context.noBackupFilesDir,name));KeyStore.getInstance("AndroidKeyStore").apply { load(null);deleteEntry(alias) } }
    }
    @Test fun fullFinanceRestoreRoundTripAndFinanceOnlyKeyLoss() = isolated { store,name,alias ->
        val golden=golden()
        val ios=Backup.decrypt(fixture("native-exports/ios-v3.pennybackup"),StrictJson.objectFrom(fixture("golden-vector-v3.json")).getString("recoveryKey"))
        assertEquals(golden.finance,ios.finance);assertEquals(golden.expenses,ios.expenses);assertEquals(golden.attachments,ios.attachments)
        store.replace(ios)
        assertEquals(golden.finance,store.snapshot().finance)
        store.close()
        VaultStore(context,name,alias).use { reopened ->
            assertEquals(golden.finance,reopened.snapshot().finance)
            val key=StrictJson.objectFrom(fixture("golden-vector-v3.json")).getString("recoveryKey")
            val bytes=Backup.encrypt(reopened.snapshot(),key)
            File(context.filesDir,"android-runtime-v3.pennybackup").writeBytes(bytes)
            assertEquals(golden.finance,Backup.decrypt(bytes,key).finance)
            val financeOnly=golden.copy(expenses=emptyList(),attachments=emptyList())
            reopened.replace(financeOnly)
            val keys=KeyStore.getInstance("AndroidKeyStore").apply { load(null);deleteEntry(alias) }
            assertTrue(runCatching { reopened.snapshot() }.isFailure)
            assertFalse("A finance-only vault must not create a replacement key",keys.containsAlias(alias))
            reopened.replace(financeOnly);assertEquals(golden.finance,reopened.finance())
        }
    }
    @Test fun postingIsAtomicIdempotentAndRestoreRejectsFinanceEdits() = isolated { store,_,_ ->
        val initial=golden();store.replace(initial)
        val template=initial.finance.recurringExpenses.single();val source=initial.finance.incomeSources.single()
        val first=store.postRecurring(template.id,"2026-02-28")
        assertEquals(first,store.postRecurring(template.id,"2026-02-28"))
        assertEquals(initial.expenses.size+1,store.all().size)
        val income=store.postIncome(source.id,"2026-03-31","2026-03-30",12345,"actual bank receipt")
        assertEquals(income,store.postIncome(source.id,"2026-03-31","2026-03-30",12345,"retry"))
        assertEquals(12345,FinanceMath.report(store.snapshot(),"2026-03").getLong("receivedMinor").toInt())
        val before=store.snapshot();val revision=store.revision()
        store.saveFinance(initial.finance.budgets.first().copy(limitMinor=54321))
        assertTrue(runCatching { store.replace(before,expectedRevision=revision) }.isFailure)
        assertEquals(54321,store.finance().budgets.first { it.id==initial.finance.budgets.first().id }.limitMinor.toInt())
        store.writableDatabase.execSQL("CREATE TEMP TRIGGER fail_finance_post BEFORE INSERT ON vault_rows WHEN NEW.domain='expenses' BEGIN SELECT RAISE(ABORT,'injected finance write failure'); END")
        val count=store.all().size
        assertTrue(runCatching { store.postRecurring(template.id,"2026-03-31") }.isFailure)
        assertEquals(count,store.all().size)
        store.writableDatabase.execSQL("DROP TRIGGER fail_finance_post")
        store.postRecurring(template.id,"2026-03-31");assertEquals(count+1,store.all().size)
        assertTrue(runCatching { store.saveFinance(IncomeEntry(sourceId=Wire.id(),amountMinor=1)) }.isFailure)
        assertTrue(runCatching { store.saveFinance(source,true) }.isFailure)
        store.saveFinance(source.copy(isActive=false));assertFalse(store.finance().incomeSources.single().isActive)
    }
    @Test fun schemaTwoDatabaseMigratesWithoutLosingExpense() = isolated { store,name,alias ->
        val expense=Expense(merchant="Preserved old vault",amountMinor=1234,expenseDate="2026-02-28")
        val legacyStore=LegacyVaultRows(context,name,alias)
        legacyStore.save(expense)
        val legacy=expense.json().apply { remove("description");remove("recurringTemplateId");remove("recurringOccurrenceDate") }
        val secret=KeyStore.getInstance("AndroidKeyStore").apply { load(null) }.getKey(alias,null)
        val cipher=javax.crypto.Cipher.getInstance("AES/GCM/NoPadding").apply { init(javax.crypto.Cipher.ENCRYPT_MODE,secret);updateAAD(expense.id.toByteArray()) }
        val sealed=cipher.iv+cipher.doFinal(StrictJson.bytes(legacy))
        legacyStore.writableDatabase.execSQL("UPDATE expenses SET sealed=? WHERE id=?",arrayOf(sealed,expense.id))
        // A real schema-two vault predates wrapped row keys; retain its direct
        // Keystore ciphertext and remove only newer-format fixture metadata.
        legacyStore.writableDatabase.execSQL("DELETE FROM metadata WHERE key IN ('dataKey','dataKeyFormat')")
        FinanceData.limits.keys.forEach { legacyStore.writableDatabase.execSQL("DROP TABLE $it") };legacyStore.writableDatabase.version=2;legacyStore.close()
        VaultStore(context,name,alias).use { migrated -> assertEquals(expense,migrated.all().single());assertTrue(migrated.finance().domains().values.all { it.isEmpty() });migrated.saveFinance(Budget(month="2026-02",limitMinor=10000));assertEquals(expense,migrated.all().single()) }
    }
}
