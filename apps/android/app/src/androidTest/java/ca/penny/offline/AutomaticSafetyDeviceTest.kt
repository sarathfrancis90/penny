package ca.penny.offline

import androidx.test.platform.app.InstrumentationRegistry
import kotlinx.coroutines.*
import org.junit.Assert.*
import org.junit.Test
import java.io.File
import java.security.KeyStore
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

class AutomaticSafetyDeviceTest {
    private val context get()=InstrumentationRegistry.getInstrumentation().targetContext.also {check(it.packageName=="ca.penny.offline.dev.test")}
    @Test fun failedOptOutRetryAndAttentionWritesRemainStoppedAfterReopen() = runBlocking {
        CloudCoordinator.cancel();val id=Wire.id();val name="auto-safe-$id";val alias="penny.auto.safe.$id";val vault=VaultStore(context,"$name.db",alias);val recovery=RecoveryKeyStore(context,"$name.key","$alias.key")
        var writes=0;var failOn=Int.MAX_VALUE
        val settings=CloudSettingsStore(context,name,"$alias.state") {writes++;if(writes==failOn) error("synthetic post-write readback failure")}
        val key=Backup.recoveryKey();var authCalls=0;val tag=CloudContract.accountTag("drive","safe-synthetic")
        val provider=object: CloudTransport {
            override suspend fun accountTag()=tag
            override suspend fun page(token: String?)=CloudPage(emptyList(),null)
            override suspend fun download(item: CloudItem,maxBytes: Int): ByteArray=error("No download")
            override suspend fun upload(name: String,bytes: ByteArray): CloudItem=throw java.io.IOException("synthetic transient")
        }
        val runner=AutomaticBackupRunner(vault,settings,recovery,{true},{authCalls++;"synthetic"},{_,_->provider},{})
        try {
            recovery.confirm(key,key);val schedule=Wire.id()
            val initial=CloudSettings(true,Wire.id(),vault.incarnation(),CloudBinding("drive",tag,CloudContract.vaultTag(vault.vaultId())),keyTag=AutomaticBackup.keyTag(key),automaticEnabled=true,scheduleId=schedule,automaticStatus="waiting")
            settings.save(initial);settings.stopAutomatic();failOn=writes+1
            assertTrue(runCatching {settings.save(initial.copy(automaticEnabled=false,automaticStatus="off"))}.isFailure)
            val reopened=CloudSettingsStore(context,name,"$alias.state")
            assertTrue(reopened.automaticStopped());assertTrue(reopened.load().automaticEnabled)
            assertEquals(AutomaticOutcome.ATTENTION,runner.run(schedule,0));assertEquals(0,authCalls)
            for(attempt in listOf(0,2)) {
                failOn=Int.MAX_VALUE;settings.save(initial);settings.allowAutomatic();writes=0;failOn=2
                assertTrue("A failed retry-state write must propagate, never return RETRY",runCatching {runner.run(schedule,attempt)}.isFailure)
                assertTrue(reopened.automaticStopped());assertTrue(reopened.load().publicationRevision>initial.publicationRevision)
                val before=authCalls;assertEquals(AutomaticOutcome.ATTENTION,runner.run(schedule,0));assertEquals(before,authCalls)
            }
            failOn=Int.MAX_VALUE;settings.allowAutomatic()
            KeyStore.getInstance("AndroidKeyStore").apply {load(null);deleteEntry("$alias.state")}
            assertTrue(runCatching {runner.run(schedule,0)}.isFailure)
            assertTrue("Protected settings read failure must persist independent stop state",reopened.automaticStopped())
        } finally {CloudCoordinator.cancel();vault.close();settings.disable();listOf(name,"$name.unverified","$name.automatic-stop","$name.key").forEach {File(context.noBackupFilesDir,it).delete()};android.database.sqlite.SQLiteDatabase.deleteDatabase(File(context.noBackupFilesDir,"$name.db"));KeyStore.getInstance("AndroidKeyStore").apply {load(null);listOf(alias,"$alias.key","$alias.state").forEach(::deleteEntry)}}
    }
    @Test fun checkpointKeepsDataAndRevisionAtomicAcrossTwoConnections() {
        val id=Wire.id();val name="checkpoint-$id.db";val alias="penny.checkpoint.$id";val first=VaultStore(context,name,alias);val second=VaultStore(context,name,alias)
        val started=CountDownLatch(1);val completed=CountDownLatch(1);val writer=java.util.concurrent.Executors.newSingleThreadExecutor()
        try {
            val old=first.revision();val expense=Expense(merchant="Concurrent checkpoint write",amountMinor=10,category=Categories.all.first(),expenseDate="2026-09-13")
            var pending: java.util.concurrent.Future<*>?=null
            val checkpoint=first.cloudCheckpoint {
                pending=writer.submit {started.countDown();second.save(expense);completed.countDown()}
                assertTrue(started.await(2,TimeUnit.SECONDS))
                assertFalse("Concurrent writer must remain outside the checkpoint transaction",completed.await(100,TimeUnit.MILLISECONDS))
            }
            pending!!.get(5,TimeUnit.SECONDS)
            assertTrue(checkpoint.first.expenses.isEmpty());assertEquals(old,checkpoint.second)
            assertEquals(old+1,second.revision());assertEquals(listOf(expense),second.all())
        } finally {writer.shutdownNow();first.close();second.close();android.database.sqlite.SQLiteDatabase.deleteDatabase(File(context.noBackupFilesDir,name));KeyStore.getInstance("AndroidKeyStore").apply {load(null);deleteEntry(alias)}}
    }
}
