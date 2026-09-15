package ca.penny.offline

import android.content.ContextWrapper
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import java.io.File
import java.security.KeyStore
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class RawMigrationDeviceTest {
    private val instrumentation = InstrumentationRegistry.getInstrumentation()
    private fun fixture(name: String) = instrumentation.context.assets.open("raw-migration-v1/$name").use { it.readBytes() }
    private fun recoveryKey() = StrictJson.objectFrom(fixture("fixture-manifest.json")).getString("recoveryKey")
    private fun isolated(test: (VaultStore, android.content.Context, String) -> Unit) {
        val target = instrumentation.targetContext
        assertEquals("ca.penny.offline.dev.test", target.packageName)
        val directory = File(target.noBackupFilesDir, "raw-migration-${Wire.id()}").apply { mkdir() }
        val context = object : ContextWrapper(target) { override fun getNoBackupFilesDir() = directory }
        val alias = "penny.test.raw-migration.${Wire.id()}"
        try { VaultStore(context, "vault.db", alias).use { test(it, context, alias) } }
        finally { directory.deleteRecursively(); KeyStore.getInstance("AndroidKeyStore").apply { load(null); deleteEntry(alias) } }
    }
    @Test fun fixtureRestoresAndReopensWithoutInventingIncome() = isolated { store, context, alias ->
        val expected = Snapshot.decode(StrictJson.objectFrom(fixture("positive.snapshot.json")))
        val imported = Backup.decrypt(fixture("positive.pennybackup"), recoveryKey())
        assertEquals(expected, imported)
        assertEquals(1234L, imported.expenses.single().amountMinor)
        assertEquals("2026-09-12", imported.expenses.single().expenseDate)
        assertEquals("Public description", imported.expenses.single().description)
        assertEquals("Separate public note", imported.expenses.single().note)
        assertEquals(8050, imported.finance.budgets.single().alertThresholdBps)
        assertEquals(100000L, imported.finance.incomeSources.single().grossMinor)
        assertEquals(80000L, imported.finance.incomeSources.single().netMinor)
        assertTrue(imported.finance.incomeEntries.isEmpty() && imported.finance.savingsGoals.isEmpty() && imported.finance.savingsEntries.isEmpty() && imported.finance.recurringExpenses.isEmpty())
        store.replace(imported); store.close()
        VaultStore(context, "vault.db", alias).use { reopened ->
            assertEquals(expected, reopened.snapshot())
            val report = FinanceMath.report(reopened.snapshot(), "2026-09")
            assertEquals(1234L, report.getLong("expenseMinor")); assertEquals(0L, report.getLong("receivedMinor"))
        }
    }
    @Test fun authenticatedInvalidImageCannotReplaceVault() = isolated { store, context, alias ->
        val good = Backup.decrypt(fixture("positive.pennybackup"), recoveryKey())
        store.replace(good); val revision = store.revision()
        assertTrue(runCatching { store.replace(Backup.decrypt(fixture("invalid-image.pennybackup"), recoveryKey())) }.isFailure)
        assertEquals(revision, store.revision()); store.close()
        VaultStore(context, "vault.db", alias).use { reopened ->
            assertEquals(revision, reopened.revision()); assertEquals(good, reopened.snapshot())
        }
    }
}
