package ca.penny.offline

import android.content.ContextWrapper
import androidx.test.platform.app.InstrumentationRegistry
import java.io.File
import java.security.KeyStore
import org.junit.Assert.*
import org.junit.Test

class RawSavingsDeviceTest {
    @Test fun observedSavingsAuthenticateInstallAndReopenWithoutInventedHistory() {
        val instrumentation=InstrumentationRegistry.getInstrumentation();val target=instrumentation.targetContext
        assertEquals("ca.penny.offline.dev.test",target.packageName)
        fun fixture(name:String)=instrumentation.context.assets.open("raw-savings-v1/$name").use {it.readBytes()}
        val manifest=fixture("fixture-manifest.json")
        assertEquals("8f28d8990ebff9adb19972448789bd3ce36df223e0dfbfa5eb978e72744327e4",Attachment.digest(manifest))
        val backup=fixture("positive.pennybackup")
        assertEquals("929a4d8134ee264f8b17797174f6d8d1a1bc379b6722f367dcd08a5e72e96e80",Attachment.digest(backup))
        val expected=Snapshot.decode(StrictJson.objectFrom(fixture("positive.snapshot.json")))
        val imported=Backup.decrypt(backup,StrictJson.objectFrom(manifest).getString("recoveryKey"))
        assertEquals(expected,imported)
        val directory=File(target.noBackupFilesDir,"raw-savings-${Wire.id()}").apply {mkdir()}
        val context=object:ContextWrapper(target) {override fun getNoBackupFilesDir()=directory};val alias="penny.test.raw-savings.${Wire.id()}"
        try {
            VaultStore(context,"vault.db",alias).use {it.replace(imported)}
            VaultStore(context,"vault.db",alias).use {store->
                val actual=store.snapshot();assertEquals(expected.vaultId,actual.vaultId);assertEquals(expected.snapshotId,actual.snapshotId);assertEquals(expected.createdAt,actual.createdAt)
                assertEquals(expected.expenses.toSet(),actual.expenses.toSet());assertEquals(expected.attachments.toSet(),actual.attachments.toSet())
                expected.finance.domains().forEach {(name,rows)->assertEquals(name,rows.toSet(),actual.finance.domains().getValue(name).toSet())}
                expected.attachments.forEach {receipt->assertArrayEquals(receipt.bytes(),actual.attachments.single {it.id==receipt.id}.bytes())}
                assertEquals(listOf(0L,1234L,12500L),actual.finance.savingsGoals.map {it.openingMinor}.sorted())
                assertEquals(13734L,actual.finance.savingsGoals.sumOf {it.openingMinor})
                assertTrue(actual.finance.savingsEntries.isEmpty());assertTrue(actual.finance.incomeEntries.isEmpty())
                assertEquals(0L,FinanceMath.report(actual,"2026-09").getLong("receivedMinor"))
                assertEquals(0L,FinanceMath.report(actual,"2026-09").getLong("savingsContributionMinor"))
            }
        } finally {directory.deleteRecursively();KeyStore.getInstance("AndroidKeyStore").apply {load(null);deleteEntry(alias)}}
    }
}
