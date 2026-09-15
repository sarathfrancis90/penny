package ca.penny.offline

import android.content.Context
import androidx.work.*
import com.google.android.gms.auth.api.identity.AuthorizationRequest
import com.google.android.gms.auth.api.identity.ClearTokenRequest
import com.google.android.gms.auth.api.identity.Identity
import com.google.android.gms.common.api.Scope
import kotlinx.coroutines.*
import kotlinx.coroutines.tasks.await
import java.util.concurrent.TimeUnit

object AutomaticBackup {
    const val workName="penny-private-drive-backup"
    fun schedule(context: Context,id: String) {
        Wire.requireId(id)
        val work=PeriodicWorkRequestBuilder<DriveBackupWorker>(24,TimeUnit.HOURS,6,TimeUnit.HOURS)
            .setInitialDelay(15,TimeUnit.MINUTES)
            .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).setRequiresBatteryNotLow(true).build())
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL,30,TimeUnit.MINUTES)
            .setInputData(workDataOf("scheduleId" to id)).build()
        WorkManager.getInstance(context).enqueueUniquePeriodicWork(workName,ExistingPeriodicWorkPolicy.UPDATE,work)
    }
    fun cancel(context: Context) {WorkManager.getInstance(context).cancelUniqueWork(workName)}
    fun keyTag(key: String)=CloudContract.sha256("PENNY-DRIVE-RECOVERY:1\u0000${key.trim()}".toByteArray())
    fun transient(error: Exception)=error is java.io.IOException && error !is javax.net.ssl.SSLException || error is DriveFailure && error.reason=="transient"
}

enum class AutomaticOutcome { DONE, RETRY, ATTENTION, DEFERRED }
/** All dependencies can be synthetic. The production worker never launches an authorization UI. */
class AutomaticBackupRunner(private val vault: VaultStore,private val settings: CloudSettingsStore,private val recovery: RecoveryKeyStore,
    private val configured: ()->Boolean,private val authorize: suspend ()->String?,private val transport: (String,()->Unit)->CloudTransport,
    private val clear: (String)->Unit,private val elapsed: ()->Long=android.os.SystemClock::elapsedRealtime) {
    suspend fun run(scheduleId: String,attempt: Int): AutomaticOutcome {
        val id=CloudCoordinator.background() ?: return AutomaticOutcome.DEFERRED
        currentCoroutineContext()[Job]?.let {CloudCoordinator.attach(id,it)}
        var token: String?=null;var base: CloudSettings?=null
        val start=elapsed()
        fun active() {CloudCoordinator.check(id);check(!settings.automaticStopped()) {"automatic_stopped"};check(elapsed()-start<8*60*1000) {"expired"};currentCheck(base)}
        try { return withTimeout(8*60*1000L) {
            val initial=synchronized(CloudCoordinator.lock) {CloudCoordinator.check(id);settings.load()}
            base=initial
            if(settings.automaticStopped()) return@withTimeout AutomaticOutcome.ATTENTION
            if(!initial.automaticEnabled || initial.scheduleId!=scheduleId) return@withTimeout AutomaticOutcome.DONE
            check(configured()) {"configuration"}
            val key=checkNotNull(recovery.load()) {"recovery_key"}
            val keyBinding=recovery.bindingToken();val snapshot=vault.cloudCheckpoint()
            check(initial.enabled && initial.incarnation==snapshot.third && initial.keyTag==AutomaticBackup.keyTag(key) && initial.binding?.vaultTag==CloudContract.vaultTag(snapshot.first.vaultId)) {"binding_changed"}
            if(initial.lastGoodDataRevision==snapshot.second) {update(initial.copy(automaticStatus="unchanged"),id);return@withTimeout AutomaticOutcome.DONE}
            fun guard() {active();check(vault.incarnation()==snapshot.third && recovery.bindingToken()==keyBinding) {"binding_changed"}}
            guard();token=authorize();guard();val access=checkNotNull(token) {"authorization_required"}
            val provider=transport(access,::guard);val tag=provider.accountTag();guard();check(tag==initial.binding.accountTag) {"account_changed"}
            CloudOperations(provider,{CloudContext(initial.binding,id,vault.revision(),false)},::guard) {}.requirePublicationCapacity()
            val reserved=synchronized(CloudCoordinator.lock) {
                guard();check(settings.load()==initial)
                val next=maxOf(Math.addExact(initial.publicationRevision,1),snapshot.second);require(next<=CloudContract.maxRevision)
                initial.copy(publicationRevision=next).also {settings.save(it);base=it}
            }
            val ops=CloudOperations(provider,{CloudContext(initial.binding,id,Math.addExact(reserved.publicationRevision,vault.revision()-snapshot.second))},::guard) {ReceiptImage.validate(it.attachments)}
            val good=ops.publish(snapshot.first,reserved.publicationRevision,key,reserved.writerId,reserved.lastGood) {CloudCoordinator.progress(id,if(it.endsWith("Upload")) "Uploading an encrypted automatic backup…" else "Downloading and verifying the automatic backup…")}
            synchronized(CloudCoordinator.lock) {guard();check(settings.load()==reserved);settings.save(reserved.copy(lastGood=good,lastGoodDataRevision=snapshot.second,automaticStatus="verified"));base=null}
            return@withTimeout AutomaticOutcome.DONE
        }        } catch(error: Exception) {
            if(error is CancellationException && error !is TimeoutCancellationException) throw error
            if(CloudCoordinator.epoch.get()!=id) return AutomaticOutcome.DONE
            val retry=attempt<2 && AutomaticBackup.transient(error) && elapsed()-start<8*60*1000
            synchronized(CloudCoordinator.lock) {
                CloudCoordinator.check(id)
                settings.stopAutomatic()
                val current=settings.load()
                if(current.scheduleId==scheduleId) {
                    settings.save(current.copy(automaticEnabled=retry,automaticStatus=if(retry) "retry" else "attention"))
                    if(retry) settings.allowAutomatic()
                }
            }
            return if(retry) AutomaticOutcome.RETRY else AutomaticOutcome.ATTENTION
        } finally {token?.let(clear);CloudCoordinator.finish(id)}
    }
    private fun currentCheck(expected: CloudSettings?) {
        expected?.let {check(settings.load()==it) {"settings_changed"}}
    }
    private fun update(value: CloudSettings,id: Long) = synchronized(CloudCoordinator.lock) {CloudCoordinator.check(id);settings.save(value)}
}

class DriveBackupWorker(app: Context,params: WorkerParameters): CoroutineWorker(app,params) {
    override suspend fun doWork(): Result {
        val scheduleId=inputData.getString("scheduleId") ?: return Result.failure()
        return withContext(Dispatchers.IO) {
            VaultStore(applicationContext).use {vault ->
                val client=Identity.getAuthorizationClient(applicationContext)
                val runner=AutomaticBackupRunner(vault,CloudSettingsStore(applicationContext),RecoveryKeyStore(applicationContext),{DriveConfiguration.available(applicationContext)}, {
                    val request=AuthorizationRequest.builder().setRequestedScopes(listOf(Scope(DriveTransport.scope))).setOptOutIncludingGrantedScopes(true).setPrompt(AuthorizationRequest.Prompt.NOT_SET).build()
                    val owner=currentCoroutineContext()[Job]
                    val pending=client.authorize(request)
                    pending.addOnSuccessListener {late->if(owner?.isActive==false) late.accessToken?.let {client.clearToken(ClearTokenRequest.builder().setToken(it).build())}}
                    val result=pending.await()
                    if(result.hasResolution()) {result.accessToken?.let {client.clearToken(ClearTokenRequest.builder().setToken(it).build())};null} else result.accessToken
                },{token,guard->DriveTransport(token,guard)}, {token->client.clearToken(ClearTokenRequest.builder().setToken(token).build())})
                val outcome=try {runner.run(scheduleId,runAttemptCount)} catch(cancel: CancellationException) {throw cancel} catch(_: Exception) {AutomaticBackup.cancel(applicationContext);return@use Result.failure()}
                when(outcome) {
                    AutomaticOutcome.DONE->Result.success()
                    AutomaticOutcome.RETRY->Result.retry()
                    AutomaticOutcome.DEFERRED->if(runAttemptCount<2) Result.retry() else Result.success()
                    AutomaticOutcome.ATTENTION->{AutomaticBackup.cancel(applicationContext);Result.failure()}
                }
            }
        }
    }
}
