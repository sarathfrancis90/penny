package ca.penny.offline

import androidx.test.platform.app.InstrumentationRegistry
import kotlinx.coroutines.*
import org.junit.Assert.*
import org.junit.Test
import java.io.File
import java.security.KeyStore

class CloudDeviceTest {
    private val instrumentation=InstrumentationRegistry.getInstrumentation()
    private val context get()=instrumentation.targetContext.also {check(it.packageName=="ca.penny.offline.dev.test")}
    private fun fixture(name: String)=instrumentation.context.assets.open(name).use {it.readBytes()}
    private val key get()=StrictJson.objectFrom(fixture("cloud-golden-vector-v1.json")).getString("recoveryKey")
    private fun await(predicate: ()->Boolean) {val until=System.nanoTime()+15_000_000_000;while(!predicate()) {check(System.nanoTime()<until) {"Timed out waiting for cloud state"};Thread.sleep(20)}}
    private inner class Fake: CloudTransport {
        val objects=linkedMapOf<String,Pair<CloudItem,ByteArray>>()
        var tag=CloudContract.accountTag("drive","synthetic-opaque-account-01")
        var failDownload=false
        var gate: CompletableDeferred<Unit>?=null
        var entered: CompletableDeferred<Unit>?=null
        override suspend fun accountTag()=tag
        override suspend fun page(token: String?)=CloudPage(objects.values.map {it.first},null)
        override suspend fun upload(name: String,bytes: ByteArray): CloudItem {
            entered?.complete(Unit);gate?.await()
            return CloudItem(Wire.id(),name).also {objects[it.id]=it to bytes.copyOf()}
        }
        override suspend fun download(item: CloudItem,maxBytes: Int): ByteArray {check(!failDownload) {"quota"};return checkNotNull(objects[item.id]).second.copyOf().also {require(it.size<=maxBytes)}}
    }
    @Test fun encryptedStateRollbackReopenAndMissingKeyFailClosed() {
        val binding=CloudBinding("drive",CloudContract.accountTag("drive","synthetic-opaque-account-01"))
        val ios=CloudContract.open(fixture("native-exports/ios-cloud-v1.pennymanifest"),key,binding)
        val imported=CloudContract.verifySnapshot(fixture("native-exports/ios-cloud-v1.pennybackup"),key,ios);ReceiptImage.validate(imported.attachments)
        val reference=Backup.decrypt(fixture("cloud-snapshot-v1.pennybackup"),key)
        assertEquals(reference.expenses.toSet(),imported.expenses.toSet());assertEquals(reference.attachments.toSet(),imported.attachments.toSet())
        reference.finance.domains().forEach {(domain,rows)->assertEquals(rows.toSet(),imported.finance.domains().getValue(domain).toSet())}
        val id=Wire.id();val name="cloud-state-$id";val alias="penny.cloud.test.$id";var fail=false
        val settings=CloudSettingsStore(context,name,alias) {if(fail) error("synthetic readback failure")}
        try {
            val golden=CloudManifest.decode(StrictJson.objectFrom(fixture("cloud-manifest-v1.json")))
            val old=CloudSettings(true,golden.writerId,Wire.id(),golden.binding,golden,42,7,"a".repeat(64))
            settings.save(old)
            assertEquals(old,CloudSettingsStore(context,name,alias).load())
            val ciphertext=File(context.noBackupFilesDir,name).readBytes();assertFalse(ciphertext.toString(Charsets.ISO_8859_1).contains(golden.writerId))
            fail=true;assertTrue(runCatching {settings.save(old.copy(publicationRevision=43))}.isFailure)
            assertEquals(old,CloudSettingsStore(context,name,alias).load());assertArrayEquals(ciphertext,File(context.noBackupFilesDir,name).readBytes())
            KeyStore.getInstance("AndroidKeyStore").apply {load(null);deleteEntry(alias)}
            assertTrue(runCatching {CloudSettingsStore(context,name,alias).load()}.isFailure)
            assertFalse(KeyStore.getInstance("AndroidKeyStore").apply {load(null)}.containsAlias(alias))
        } finally {settings.disable();KeyStore.getInstance("AndroidKeyStore").apply {load(null);deleteEntry(alias)}}
    }
    @Test fun controllerPublicationRetryKeyRotationAndGuardedRestore() = runBlocking {
        val id=Wire.id();val dbName="cloud-vault-$id.db";val vaultAlias="penny.cloud.vault.$id";val stateAlias="penny.cloud.state.$id";val keyAlias="penny.cloud.recovery.$id"
        val vault=VaultStore(context,dbName,vaultAlias);val settings=CloudSettingsStore(context,"cloud-$id",stateAlias);val recovery=RecoveryKeyStore(context,"cloud-key-$id",keyAlias)
        val worker=CoroutineScope(SupervisorJob()+Dispatchers.Default);val fake=Fake();var clock=0L;var commit: (suspend (RestoreOperation)->Unit)?=null;var selected: Snapshot?=null
        val controller=DriveController(context,vault,worker,{s,_,action->selected=s;commit=action},{_,_->fake},true,settings,recovery,{}, {clock})
        try {
            val original=Backup.decrypt(fixture("cloud-snapshot-v1.pennybackup"),key);ReceiptImage.validate(original.attachments);vault.replace(original)
            recovery.confirm(key,key);await {controller.state.value.ready}
            fun action(mode: String,recoveryKey: String?=null) {controller.authorized(controller.begin(),"synthetic-token-never-sent",mode,recoveryKey)}
            action("enable");await {!controller.state.value.busy};assertTrue(controller.state.value.enabled)
            action("publish");await {!controller.state.value.busy};val first=checkNotNull(settings.load().lastGood)
            action("publish");await {!controller.state.value.busy};val second=checkNotNull(settings.load().lastGood);assertTrue(second.localRevision>first.localRevision)
            assertFalse(CloudContract.history(listOf(first,second),first.binding).revisionConflict)
            fake.failDownload=true;action("publish");await {!controller.state.value.busy};val failed=settings.load();assertEquals(second,failed.lastGood);assertTrue(failed.publicationRevision>second.localRevision)
            fake.failDownload=false;action("publish");await {!controller.state.value.busy};assertTrue(settings.load().lastGood!!.localRevision>failed.publicationRevision)
            val last=checkNotNull(settings.load().lastGood)
            File(context.filesDir,"android-cloud-runtime.pennymanifest").writeBytes(fake.objects.values.single {it.first.name==last.manifestName}.second)
            File(context.filesDir,"android-cloud-runtime.pennybackup").writeBytes(fake.objects.values.single {it.first.name==last.snapshotName}.second)
            action("discover",key);await {!controller.state.value.busy};assertEquals(3,controller.state.value.candidates.size)
            controller.select(last);await {commit!=null && !controller.state.value.busy};assertEquals(original.expenses.toSet(),selected!!.expenses.toSet())
            fake.tag=CloudContract.accountTag("drive","different-account")
            assertTrue(runCatching {commit!!.invoke(RestoreOperation())}.isFailure);assertEquals(original.expenses.toSet(),vault.all().toSet())
            fake.tag=last.accountTag;controller.cancel();commit=null
            action("discover",key);await {!controller.state.value.busy};controller.select(last);await {commit!=null && !controller.state.value.busy}
            val rotatedKey=Backup.recoveryKey();recovery.confirm(rotatedKey,rotatedKey)
            assertTrue(runCatching {commit!!.invoke(RestoreOperation())}.isFailure)
            controller.cancel();val rotated=DriveController(context,vault,worker,{_,_,_->},{_,_->fake},true,settings,recovery,{})
            await {rotated.state.value.ready};assertFalse(rotated.state.value.enabled);assertNull(rotated.state.value.lastGood);rotated.cancel()
            recovery.confirm(key,key);commit=null;action("discover",key);await {!controller.state.value.busy};controller.select(last);await {commit!=null && !controller.state.value.busy}
            val changed=original.expenses.first().copy(merchant="New local data after preview",updatedAt=Wire.now());vault.save(changed)
            assertTrue(runCatching {commit!!.invoke(RestoreOperation())}.isFailure);assertEquals(changed,vault.all().single {it.id==changed.id})
            controller.cancel();commit=null;action("discover",key);await {!controller.state.value.busy};controller.select(last);await {commit!=null && !controller.state.value.busy}
            val incarnation=vault.incarnation();commit!!.invoke(RestoreOperation());assertNotEquals(incarnation,vault.incarnation());assertEquals(original.expenses.toSet(),vault.all().toSet())
            controller.vaultRestored();assertFalse(controller.state.value.enabled)
            // Actual fake-Drive discovery/preview callback receives the same cancellation
            // token used by the ViewModel. Account/session guards stay on this path.
            for(point in listOf(VaultGenerations.Point.FILES_READY,VaultGenerations.Point.POINTER_COMMITTED)) {
                controller.cancel();commit=null
                val current=original.expenses.first().copy(merchant="Current before cancellation $point")
                vault.save(current)
                action("discover",key);await {!controller.state.value.busy};controller.select(last);await {commit!=null && !controller.state.value.busy}
                val operation=RestoreOperation();val staged=CompletableDeferred<Unit>();val proceed=java.util.concurrent.CountDownLatch(1)
                vault.generations.fault={if(it==point) {staged.complete(Unit);check(proceed.await(10,java.util.concurrent.TimeUnit.SECONDS))}}
                val candidate=checkNotNull(commit)
                val result=async(Dispatchers.IO) {runCatching {candidate(operation)}}
                withTimeout(10000) {staged.await()}
                val cancelled=operation.cancel();assertEquals(point==VaultGenerations.Point.FILES_READY,cancelled)
                proceed.countDown();val outcome=withTimeout(10000) {result.await()};vault.generations.fault={}
                if(cancelled) {assertTrue(outcome.exceptionOrNull() is RestoreCancelled);controller.cancel();assertEquals(current,vault.all().first {it.id==current.id})}
                else {assertTrue(outcome.isSuccess);assertEquals(original.expenses.toSet(),vault.all().toSet());controller.vaultRestored()}
            }
            // A bounded operation expires even if a provider callback completes later.
            action("enable");await {!controller.state.value.busy};fake.gate=CompletableDeferred();fake.entered=CompletableDeferred();val beforeExpiry=settings.load().lastGood
            action("publish");fake.entered!!.await();clock+=600001;fake.gate!!.complete(Unit);await {!controller.state.value.busy}
            assertEquals(beforeExpiry,settings.load().lastGood);assertTrue(controller.state.value.message.contains("credentials_expired"))
            // Cancellation after an upload await begins must not publish a manifest or lastGood.
            action("enable");await {!controller.state.value.busy};fake.gate=CompletableDeferred();fake.entered=CompletableDeferred();val prior=settings.load().lastGood
            action("publish");fake.entered!!.await();controller.cancel();fake.gate!!.complete(Unit);delay(100);assertEquals(prior,settings.load().lastGood)
        } finally {
            controller.cancel();worker.cancel();vault.close();settings.disable();File(context.noBackupFilesDir,"cloud-key-$id").delete()
            android.database.sqlite.SQLiteDatabase.deleteDatabase(File(context.noBackupFilesDir,dbName));KeyStore.getInstance("AndroidKeyStore").apply {load(null);listOf(vaultAlias,stateAlias,keyAlias).forEach(::deleteEntry)}
        }
    }
}
