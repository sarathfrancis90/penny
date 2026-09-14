package ca.penny.offline

import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import com.google.android.gms.auth.api.identity.ClearTokenRequest
import com.google.android.gms.auth.api.identity.Identity
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import java.util.concurrent.atomic.AtomicLong

object DriveConfiguration {
    fun available(context: Context): Boolean = runCatching {
        require(Regex("[0-9]+-[a-z0-9]+\\.apps\\.googleusercontent\\.com").matches(BuildConfig.DRIVE_ANDROID_CLIENT_ID))
        CloudContract.digest(BuildConfig.DRIVE_SIGNING_SHA256)
        @Suppress("DEPRECATION") val info=context.packageManager.getPackageInfo(context.packageName,if(Build.VERSION.SDK_INT>=28) PackageManager.GET_SIGNING_CERTIFICATES else PackageManager.GET_SIGNATURES)
        @Suppress("DEPRECATION") val signatures=if(Build.VERSION.SDK_INT>=28) info.signingInfo?.apkContentsSigners else info.signatures
        require(signatures?.size==1 && CloudContract.sha256(signatures[0].toByteArray())==BuildConfig.DRIVE_SIGNING_SHA256)
        true
    }.getOrDefault(false)
}
data class DriveUiState(val configured: Boolean=false,val ready: Boolean=false,val enabled: Boolean=false,val automaticEnabled: Boolean=false,val automaticStatus: String="off",val busy: Boolean=false,val message: String="Drive backup is disabled.",val lastGood: CloudManifest?=null,val candidates: List<CloudManifest> = emptyList())

/** Tokens, recovery text and discovery bytes never enter SavedState, SQLite or logs. */
class DriveController(private val app: Context,private val vault: VaultStore,private val scope: CoroutineScope,private val preview: (Snapshot,Long,suspend (RestoreOperation)->Unit)->Unit,private val transportFactory: (String,()->Unit)->CloudTransport = {token,guard->DriveTransport(token,guard)},private val configured: Boolean=DriveConfiguration.available(app),private val settings: CloudSettingsStore=CloudSettingsStore(app),private val recoveryStore: RecoveryKeyStore=RecoveryKeyStore(app),private val clearCredential: (String)->Unit = { value -> Identity.getAuthorizationClient(app).clearToken(ClearTokenRequest.builder().setToken(value).build());Unit },private val elapsed: ()->Long = android.os.SystemClock::elapsedRealtime) {
    private val epoch=CloudCoordinator.epoch
    private val lock=CloudCoordinator.lock
    private var job: Job?=null
    private var reconciledSchedule: String?=null
    private var token: String?=null
    private var discoveryKey: String?=null
    private var discovery: CloudDiscovery?=null
    private var operations: CloudOperations?=null
    private val mutable=MutableStateFlow(DriveUiState(configured=configured))
    val state=mutable.asStateFlow()
    init {scope.launch {withContext(Dispatchers.IO) {reload()};CloudCoordinator.activity.collect {activity->if(activity.kind==null) withContext(Dispatchers.IO) {reload()}}}}
    private fun keyTag(key: String)=AutomaticBackup.keyTag(key)
    private fun reload() = synchronized(lock) {runCatching {settings.load()}.fold(onSuccess={s->
        val valid=s.incarnation==null || (s.incarnation==vault.incarnation() && recoveryStore.load()?.let(::keyTag)==s.keyTag)
        if(s.automaticEnabled && !settings.automaticStopped() && s.enabled && valid && configured && s.scheduleId!=reconciledSchedule) {
            AutomaticBackup.schedule(app,checkNotNull(s.scheduleId));reconciledSchedule=s.scheduleId
        } else if(!s.automaticEnabled || settings.automaticStopped() || !valid || !configured) {AutomaticBackup.cancel(app);reconciledSchedule=null}
        mutable.value=mutable.value.copy(ready=true,enabled=s.enabled && valid,automaticEnabled=s.automaticEnabled && valid && !settings.automaticStopped(),automaticStatus=if(settings.automaticStopped() && s.automaticEnabled) "attention" else s.automaticStatus,lastGood=if(valid) s.lastGood else null,message=if(mutable.value.ready && valid) mutable.value.message else if(!valid) "The vault or recovery key changed and disabled its previous Drive binding. Set up Drive again." else if(s.enabled) "Drive enabled. Choose Back up now to authorize and verify a new copy." else "Drive backup is disabled.")
    },onFailure={AutomaticBackup.cancel(app);reconciledSchedule=null;mutable.value=mutable.value.copy(ready=true,enabled=false,automaticEnabled=false,automaticStatus="attention",message="Protected Drive settings unavailable. Disable Drive to reset settings; local records and remote backups are kept.")})}
    fun isCurrent(id: Long)=epoch.get()==id
    private fun releaseToken() {val old=token;token=null;old?.let {clearCredential(it)}}
    fun cancel(message: String="Drive action cancelled. Previous verified backups are kept.") = synchronized(lock) {
        CloudCoordinator.cancel();job?.cancel();job=null;releaseToken();discoveryKey=null;discovery=null;operations=null
        mutable.value=mutable.value.copy(busy=false,candidates=emptyList(),message=message)
    }
    fun recoveryUpdated() {cancel("Recovery key verified. Checking the Drive binding…");scope.launch(Dispatchers.IO) {reload()}}
    fun vaultRestored() {AutomaticBackup.cancel(app);cancel("Restore disabled the old Drive binding. Set up Drive again.");mutable.value=mutable.value.copy(enabled=false,automaticEnabled=false,lastGood=null)}
    fun disable() = synchronized(lock) {
        cancel("Disabling Drive…");AutomaticBackup.cancel(app)
        try {settings.disable();mutable.value=mutable.value.copy(enabled=false,automaticEnabled=false,lastGood=null,message="Drive disabled. Local data and remote backups are kept.")}
        catch(_: Exception) {mutable.value=mutable.value.copy(enabled=false,automaticEnabled=false,message="Drive session cancelled, but protected settings could not be cleared. Retry Disable Drive.")}
    }
    fun begin(): Long = synchronized(lock) {
        check(mutable.value.configured && mutable.value.ready) {"Drive OAuth registration is not configured for this signed build."}
        cancel();val id=CloudCoordinator.foreground();mutable.value=mutable.value.copy(busy=true,message="Choose the Google account for this Drive action.");return id
    }
    fun authorizationFailed(id: Long) {if(isCurrent(id)) cancel("Google authorization was cancelled or unavailable. Your local vault is unchanged.")}
    fun authorized(id: Long,accessToken: String,mode: String,recovery: String?=null): Unit = synchronized(lock) {
        if(!isCurrent(id)) {clearCredential(accessToken);return}
        require(mode in listOf("enable","publish","discover"));token=accessToken
        job=scope.launch(Dispatchers.IO) {
            try {
                val started=elapsed();val incarnation=vault.incarnation();val keyBinding=recoveryStore.bindingToken()
                fun active() {check(isCurrent(id)) {"cancelled"};check(elapsed()-started<10*60*1000) {"credentials_expired"};check(vault.incarnation()==incarnation) {"vault_changed"};check(recoveryStore.bindingToken()==keyBinding) {"recovery_key_changed"}}
                active();val transport=transportFactory(accessToken,::active)
                val tag=transport.accountTag();active()
                val old=settings.load();val snapshot=vault.cloudCheckpoint();active()
                val binding=CloudBinding("drive",tag,if(mode=="discover") null else CloudContract.vaultTag(snapshot.first.vaultId))
                val key=if(mode=="discover") checkNotNull(recovery).also {Backup.key(it).fill(0)} else checkNotNull(recoveryStore.load()) {"Confirm a recovery key first"}
                if(mode=="enable") {
                    synchronized(lock) {active();settings.save(if(old.binding==binding && old.incarnation==incarnation && old.keyTag==keyTag(key)) old.copy(enabled=true) else CloudSettings(true,Wire.id(),incarnation,binding,keyTag=keyTag(key)))}
                    synchronized(lock) {active();mutable.value=mutable.value.copy(enabled=true,message="Drive enabled for the selected account. No backup has been uploaded by this action.",lastGood=settings.load().lastGood)}
                } else {
                    if(mode=="publish") check(old.enabled && old.incarnation==incarnation && old.binding==binding && old.keyTag==keyTag(key)) {"account_changed"}
                    if(mode=="publish") CloudOperations(transport,{CloudContext(binding,id,vault.revision(),!isCurrent(id))},::active) {}.requirePublicationCapacity()
                    val reserved=if(mode=="publish") synchronized(lock) {
                        active();check(settings.load()==old)
                        val next=maxOf(Math.addExact(old.publicationRevision,1),snapshot.second);require(next<=CloudContract.maxRevision)
                        old.copy(publicationRevision=next).also(settings::save)
                    } else old
                    val publicationRevision=if(mode=="publish") reserved.publicationRevision else snapshot.second
                    val ops=CloudOperations(transport,{CloudContext(binding,id,Math.addExact(publicationRevision,vault.revision()-snapshot.second),!isCurrent(id))},::active) {ReceiptImage.validate(it.attachments)}
                    if(mode=="publish") {
                        val good=ops.publish(snapshot.first,publicationRevision,key,old.writerId,old.lastGood) {phase->synchronized(lock) {active();mutable.value=mutable.value.copy(message=when(phase) {"snapshotUpload"->"Uploading encrypted snapshot…";"snapshotDownload"->"Downloading and checking the snapshot…";"manifestUpload"->"Publishing encrypted verification metadata…";else->"Downloading and checking verification metadata…"})}}
                        synchronized(lock) {active();check(settings.load()==reserved);settings.save(reserved.copy(lastGood=good,lastGoodDataRevision=snapshot.second))}
                        synchronized(lock) {active();mutable.value=mutable.value.copy(lastGood=good,message="Drive snapshot and manifest downloaded and verified. Revision ${good.localRevision} is backed up."+(if(vault.revision()!=snapshot.second) " New local changes still need a backup." else ""))}
                    } else {
                        val result=ops.discover(key);synchronized(lock) {active();discovery=result;discoveryKey=key;operations=ops
                        mutable.value=mutable.value.copy(candidates=result.manifests,message=(if(result.manifests.isEmpty()) "No authenticated Penny backups found for this key in the selected account." else "Choose a specific vault, writer and revision. Revisions from different writers cannot be compared.") + (if(result.rejectedManifests>0) " ${result.rejectedManifests} manifests could not authenticate or validate with this key and were excluded. No remote objects were removed." else ""))}
                    }
                }
            } catch(e: Exception) {synchronized(lock) {if(isCurrent(id)) {discovery=null;discoveryKey=null;operations=null;mutable.value=mutable.value.copy(candidates=emptyList(),message="Drive action failed (${safeReason(e)}). Previous verified backups and your local records are unchanged.")}}}
            finally {synchronized(lock) {if(isCurrent(id)) {mutable.value=mutable.value.copy(busy=false);if(discovery==null || discovery?.manifests.isNullOrEmpty()) {releaseToken();CloudCoordinator.finish(id)}}}}
        };CloudCoordinator.attach(id,checkNotNull(job))
    }
    fun select(manifest: CloudManifest): Unit = synchronized(lock) {
        val id=epoch.get();val ops=operations ?: return;val found=discovery ?: return;val key=discoveryKey ?: return
        if(mutable.value.busy) return
        val revision=vault.revision();val restoreBinding=vault.restoreBinding()
        mutable.value=mutable.value.copy(busy=true,message="Downloading and verifying your selected snapshot…")
        job=scope.launch(Dispatchers.IO) {
            try {val snapshot=ops.restore(found,manifest,key);check(isCurrent(id));withContext(Dispatchers.Main) {check(isCurrent(id));preview(snapshot,revision) { operation -> operation.check();ops.confirmBinding();operation.check();synchronized(lock) { check(isCurrent(id)); ops.requireActive(); vault.replace(snapshot,revision,restoreBinding,operation) } }}
                synchronized(lock) {check(isCurrent(id));discovery=null;discoveryKey=null;operations=null;mutable.value=mutable.value.copy(busy=false,candidates=emptyList(),message="Selected Drive backup verified. Review all records before replacing this vault.")}}
            catch(e: Exception) {if(isCurrent(id)) cancel("Restore preview failed (${safeReason(e)}). Your local vault is unchanged.")}
        };CloudCoordinator.attach(id,checkNotNull(job))
    }
    fun setAutomatic(enabled: Boolean) {
        cancel("Updating automatic backup…");val generation=epoch.get()
        scope.launch(Dispatchers.IO) {synchronized(lock) {
            if(!isCurrent(generation)) return@synchronized
            try {
                val current=settings.load()
                if(enabled) {check(mutable.value.configured && current.enabled && current.incarnation==vault.incarnation() && recoveryStore.load()?.let(::keyTag)==current.keyTag)}
                val updated=current.copy(automaticEnabled=enabled,scheduleId=if(enabled) Wire.id() else current.scheduleId,automaticStatus=if(enabled) "waiting" else "off")
                settings.stopAutomatic();settings.save(updated)
                if(enabled) settings.allowAutomatic()
                if(enabled) AutomaticBackup.schedule(app,checkNotNull(updated.scheduleId)) else AutomaticBackup.cancel(app)
                reload();mutable.value=mutable.value.copy(message=if(enabled) "Automatic backup enabled. Android chooses when eligible work runs." else "Automatic backup disabled. Existing backups are kept.")
            } catch(_: Exception) {AutomaticBackup.cancel(app);runCatching {settings.stopAutomatic()};mutable.value=mutable.value.copy(automaticEnabled=false,message="Automatic backup needs a valid Drive binding and confirmed key. Use the manual setup first.")}
        }}
    }
    fun localRestore(action: ()->Unit) = synchronized(lock) {cancel();AutomaticBackup.cancel(app);settings.stopAutomatic();action()}
    private fun safeReason(e: Exception)=when {
        e is DriveFailure->e.reason
        e is CancellationException->"cancelled"
        e.message in listOf("account_changed","vault_changed","recovery_key_changed","credentials_expired","cloud_capacity","listing_limit","listing_incomplete","invalid_page_token","ambiguous_remote_object")->e.message!!
        else->"verification_or_connection"
    }
}
