package ca.penny.offline

import androidx.test.platform.app.InstrumentationRegistry
import androidx.work.WorkInfo
import androidx.work.WorkManager
import kotlinx.coroutines.*
import org.junit.Assert.*
import org.junit.Test
import java.io.File
import java.security.KeyStore

class AutomaticBackupDeviceTest {
    private val instrumentation=InstrumentationRegistry.getInstrumentation()
    private val context get()=instrumentation.targetContext.also {check(it.packageName=="ca.penny.offline.dev.test")}
    @Test fun defaultOffDedupeRetryExpiryAndForegroundCancellation() = runBlocking {
        CloudCoordinator.cancel()
        val id=Wire.id();val name="auto-$id.db";val alias="penny.auto.$id";val keyAlias="$alias.key";val stateAlias="$alias.state"
        val vault=VaultStore(context,name,alias);val settings=CloudSettingsStore(context,"auto-$id",stateAlias);val recovery=RecoveryKeyStore(context,"auto-key-$id",keyAlias)
        val key=Backup.recoveryKey();val account=CloudContract.accountTag("drive","synthetic-auto-account");var authCalls=0;var uploads=0;var clock=0L;var fail: Exception?=null;var switch=false;var gate: CompletableDeferred<Unit>?=null;var entered: CompletableDeferred<Unit>?=null
        val objects=linkedMapOf<String,Pair<CloudItem,ByteArray>>()
        val provider=object: CloudTransport {
            override suspend fun accountTag()=if(switch) CloudContract.accountTag("drive","other-account") else account
            override suspend fun page(token: String?)=CloudPage(objects.values.map {it.first},null)
            override suspend fun upload(name: String,bytes: ByteArray): CloudItem {uploads++;entered?.complete(Unit);gate?.await();fail?.let {throw it};return CloudItem(Wire.id(),name).also {objects[it.id]=it to bytes.copyOf()}}
            override suspend fun download(item: CloudItem,maxBytes: Int)=checkNotNull(objects[item.id]).second.copyOf()
        }
        val runner=AutomaticBackupRunner(vault,settings,recovery,{true},{authCalls++;"synthetic"},{_,_->provider},{},{clock})
        val schedule=Wire.id()
        try {
            recovery.confirm(key,key)
            val initial=CloudSettings(true,Wire.id(),vault.incarnation(),CloudBinding("drive",account,CloudContract.vaultTag(vault.vaultId())),keyTag=AutomaticBackup.keyTag(key),scheduleId=schedule)
            settings.save(initial)
            assertEquals(AutomaticOutcome.DONE,runner.run(schedule,0));assertEquals(0,authCalls)
            settings.save(initial.copy(automaticEnabled=true,automaticStatus="waiting"))
            assertEquals(AutomaticOutcome.DONE,runner.run(schedule,0));assertEquals(2,uploads);val first=settings.load()
            assertEquals(AutomaticOutcome.DONE,runner.run(schedule,0));assertEquals(2,uploads);assertEquals(1,authCalls)
            assertEquals(AutomaticOutcome.DONE,runner.run(Wire.id(),0));assertEquals(1,authCalls)
            // Foreground lease prevents even silent authorization from starting.
            val foreground=CloudCoordinator.foreground();assertEquals(AutomaticOutcome.DEFERRED,runner.run(schedule,0));assertEquals(1,authCalls);CloudCoordinator.finish(foreground)
            fun dirty() {vault.save(Expense(merchant="Auto test",amountMinor=123,category=Categories.all.first(),expenseDate="2026-09-13"))}
            dirty();fail=java.io.IOException("synthetic network loss")
            assertEquals(AutomaticOutcome.RETRY,runner.run(schedule,0));assertTrue(settings.load().automaticEnabled);assertEquals(first.lastGood,settings.load().lastGood)
            assertEquals(AutomaticOutcome.ATTENTION,runner.run(schedule,2));assertFalse(settings.load().automaticEnabled);assertEquals(first.lastGood,settings.load().lastGood)
            fail=null;settings.save(settings.load().copy(automaticEnabled=true,automaticStatus="waiting"));settings.allowAutomatic();switch=true
            assertEquals(AutomaticOutcome.ATTENTION,runner.run(schedule,0));assertFalse(settings.load().automaticEnabled);switch=false
            settings.save(settings.load().copy(automaticEnabled=true));settings.allowAutomatic();gate=CompletableDeferred();entered=CompletableDeferred()
            val expiry=async {runner.run(schedule,0)};entered!!.await();clock+=480001;gate!!.complete(Unit);assertEquals(AutomaticOutcome.ATTENTION,expiry.await());assertEquals(first.lastGood,settings.load().lastGood)
            settings.save(settings.load().copy(automaticEnabled=true));settings.allowAutomatic();gate=CompletableDeferred();entered=CompletableDeferred()
            val active=async {runner.run(schedule,0)};entered!!.await();val next=CloudCoordinator.foreground();gate!!.complete(Unit);runCatching {active.await()};assertEquals(first.lastGood,settings.load().lastGood);CloudCoordinator.finish(next)
            gate=null;entered=null
            // Restore invalidates even a persisted schedule with the same portable vaultId.
            val before=vault.snapshot();vault.replace(before)
            assertEquals(AutomaticOutcome.ATTENTION,runner.run(schedule,0));assertFalse(settings.load().automaticEnabled)
            // Device key rotation is independently rejected before authorization.
            settings.save(settings.load().copy(incarnation=vault.incarnation(),automaticEnabled=true));settings.allowAutomatic();val other=Backup.recoveryKey();recovery.confirm(other,other)
            val beforeAuth=authCalls;assertEquals(AutomaticOutcome.ATTENTION,runner.run(schedule,0));assertEquals(beforeAuth,authCalls)
        } finally {CloudCoordinator.cancel();vault.close();settings.disable();File(context.noBackupFilesDir,"auto-key-$id").delete();android.database.sqlite.SQLiteDatabase.deleteDatabase(File(context.noBackupFilesDir,name));KeyStore.getInstance("AndroidKeyStore").apply {load(null);listOf(alias,keyAlias,stateAlias).forEach(::deleteEntry)}}
    }
    @Test fun uniquePeriodicWorkHasConstraintsAndCanBeCancelled() {
        AutomaticBackup.cancel(context)
        val first=Wire.id();AutomaticBackup.schedule(context,first);AutomaticBackup.schedule(context,Wire.id())
        val manager=WorkManager.getInstance(context)
        val rows=manager.getWorkInfosForUniqueWork(AutomaticBackup.workName).get().filter {!it.state.isFinished}
        assertEquals(1,rows.size)
        assertEquals(androidx.work.NetworkType.CONNECTED,rows.single().constraints.requiredNetworkType)
        assertTrue(rows.single().constraints.requiresBatteryNotLow())
        AutomaticBackup.cancel(context);manager.cancelUniqueWork(AutomaticBackup.workName).result.get()
        assertTrue(manager.getWorkInfosForUniqueWork(AutomaticBackup.workName).get().all {it.state==WorkInfo.State.CANCELLED || it.state.isFinished})
    }
}
