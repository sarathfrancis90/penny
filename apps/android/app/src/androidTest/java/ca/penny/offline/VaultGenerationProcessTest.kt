package ca.penny.offline

import android.content.ContextWrapper
import android.os.Process
import androidx.test.platform.app.InstrumentationRegistry
import java.io.File
import java.security.KeyStore
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

/** Two explicitly selected instrumentation invocations with a host force-stop between them. */
class VaultGenerationProcessTest {
    private val instrumentation=InstrumentationRegistry.getInstrumentation()
    private val target=instrumentation.targetContext.also {check(it.packageName=="ca.penny.offline.dev.test")}
    private val directory=File(target.noBackupFilesDir,"test-generation-process")
    private val context=object:ContextWrapper(target) {override fun getNoBackupFilesDir()=directory}
    private val alias="penny.generations.process.test"
    private fun fixture(name: String)=instrumentation.context.assets.open("local-generation-v1/$name.json").use {Snapshot.decode(StrictJson.objectFrom(it.readBytes()))}
    @Test fun seedPending() {
        org.junit.Assume.assumeTrue(InstrumentationRegistry.getArguments().getString("pennyGenerationProcess")=="true")
        directory.deleteRecursively();directory.mkdir()
        KeyStore.getInstance("AndroidKeyStore").apply {load(null);deleteEntry(alias)}
        VaultStore(context,"vault.db",alias).use {store ->
            store.replace(fixture("previous"))
            store.generations.fault={if(it==VaultGenerations.Point.POINTER_COMMITTED) error("checkpoint interruption")}
            assertTrue(runCatching {store.replace(fixture("replacement"))}.isFailure)
        }
        File(target.filesDir,"generation-process-seed.json").writeText(JSONObject().put("pid",Process.myPid()).put("phase","pending-pointer-committed").toString())
    }
    @Test fun reopenPending() {
        org.junit.Assume.assumeTrue(InstrumentationRegistry.getArguments().getString("pennyGenerationProcess")=="true")
        val seed=JSONObject(File(target.filesDir,"generation-process-seed.json").readText());assertNotEquals(seed.getInt("pid"),Process.myPid())
        VaultStore(context,"vault.db",alias).use {store ->
            val expected=fixture("replacement");val actual=store.snapshot()
            assertEquals(expected.vaultId,actual.vaultId);assertEquals(expected.snapshotId,actual.snapshotId);assertEquals(expected.expenses.toSet(),actual.expenses.toSet());assertEquals(expected.attachments.toSet(),actual.attachments.toSet());assertEquals(expected.finance,actual.finance)
        }
        File(target.filesDir,"generation-process-reopen.json").writeText(JSONObject().put("pid",Process.myPid()).put("seedPid",seed.getInt("pid")).put("phase","authenticated-new-generation").toString())
        directory.deleteRecursively();KeyStore.getInstance("AndroidKeyStore").apply {load(null);deleteEntry(alias)}
    }
}
