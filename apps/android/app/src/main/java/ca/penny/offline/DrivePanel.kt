package ca.penny.offline

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.IntentSenderRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.DialogProperties
import androidx.compose.ui.window.SecureFlagPolicy
import com.google.android.gms.auth.api.identity.AuthorizationRequest
import com.google.android.gms.auth.api.identity.Identity
import com.google.android.gms.common.api.Scope
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await

private data class DriveAuthorization(val epoch: Long,val mode: String,val key: String?)
@Composable fun DrivePanel(vm: PennyViewModel) {
    val controller=vm.drive;val state by controller.state.collectAsState();val activity by CloudCoordinator.activity.collectAsState();val context=LocalContext.current;val scope=rememberCoroutineScope()
    var pending by remember {mutableStateOf<DriveAuthorization?>(null)}
    var keyMode by remember {mutableStateOf<String?>(null)}
    var key by remember {mutableStateOf("")};var repeated by remember {mutableStateOf("")};var keyError by remember {mutableStateOf<String?>(null)}
    var chooser by remember {mutableStateOf(false)}
    val launcher=rememberLauncherForActivityResult(ActivityResultContracts.StartIntentSenderForResult()) {result->
        val action=pending;pending=null
        if(action!=null) {
            val response=runCatching {Identity.getAuthorizationClient(context).getAuthorizationResultFromIntent(result.data)}.getOrNull()
            val token=response?.accessToken
            if(token==null) controller.authorizationFailed(action.epoch) else controller.authorized(action.epoch,token,action.mode,action.key)
        }
    }
    fun authorize(mode: String,recovery: String?=null) {
        val action=DriveAuthorization(controller.begin(),mode,recovery);pending=action
        scope.launch {
            try {
                val request=AuthorizationRequest.builder().setRequestedScopes(listOf(Scope(DriveTransport.scope))).setOptOutIncludingGrantedScopes(true).setPrompt(AuthorizationRequest.Prompt.SELECT_ACCOUNT).build()
                val client=Identity.getAuthorizationClient(context)
                val owner=kotlinx.coroutines.currentCoroutineContext()[kotlinx.coroutines.Job]
                val task=client.authorize(request)
                task.addOnSuccessListener {late->if(owner?.isActive==false || !controller.isCurrent(action.epoch)) late.accessToken?.let {client.clearToken(com.google.android.gms.auth.api.identity.ClearTokenRequest.builder().setToken(it).build())}}
                val result=task.await()
                if(!controller.isCurrent(action.epoch)) {pending=null;result.accessToken?.let {controller.authorized(action.epoch,it,mode)};return@launch}
                if(result.hasResolution()) launcher.launch(IntentSenderRequest.Builder(checkNotNull(result.pendingIntent)).build())
                else {pending=null;controller.authorized(action.epoch,checkNotNull(result.accessToken),mode,recovery)}
            } catch(_: Exception) {pending=null;controller.authorizationFailed(action.epoch)}
        }
    }
    Card {
        Column(Modifier.fillMaxWidth().padding(20.dp),verticalArrangement=Arrangement.spacedBy(12.dp)) {
            Text("Private Google Drive backup",style=MaterialTheme.typography.titleMedium)
            Text("Optional encrypted snapshots in Drive's private app folder. No shared folder, automatic deletion or live sync. Your Google account is only needed for these backup actions.")
            if(!state.configured) Text("Unavailable in this build: the Android OAuth client and signing certificate have not been configured. Encrypted file backup remains available.")
            Text(state.message)
            state.lastGood?.let {Text("Last verified publication: ${it.verifiedAt}\nWriter ${it.writerId}\nRevision ${it.localRevision}",style=MaterialTheme.typography.bodySmall)}
            if(state.enabled) {
                Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.SpaceBetween) {Text("Automatic backup",Modifier.weight(1f));Switch(checked=state.automaticEnabled,onCheckedChange=controller::setAutomatic,enabled=!state.busy)}
                Text("Android schedules checks when connected and battery is not low. Only changed data is uploaded; timing is not guaranteed.",style=MaterialTheme.typography.bodySmall)
                Text("Automatic status: ${state.automaticStatus}",style=MaterialTheme.typography.bodySmall)
            }
            if(activity.kind=="background") {Text(activity.message);TextButton(onClick={controller.cancel()}) {Text("Cancel current automatic backup")}}
            if(state.busy || activity.kind=="background") LinearProgressIndicator(Modifier.fillMaxWidth())
            if(!state.enabled) Button(onClick={key="";repeated="";keyError=null;keyMode="enable"},enabled=state.configured && state.ready && !state.busy && pending==null) {Text("Enable Drive backup")}
            else Button(onClick={authorize("publish")},enabled=state.configured && state.ready && !state.busy && pending==null) {Text("Back up now to Drive")}
            OutlinedButton(onClick={key="";repeated="";keyError=null;keyMode="discover"},enabled=state.configured && state.ready && !state.busy && pending==null) {Text("Find backups in Drive")}
            if(state.candidates.isNotEmpty()) OutlinedButton(onClick={chooser=true},enabled=!state.busy) {Text("Choose Drive snapshot (${state.candidates.size})")}
            if(state.busy || state.candidates.isNotEmpty()) TextButton(onClick={controller.cancel()}) {Text("Cancel Drive action")}
            TextButton(onClick={controller.disable()},enabled=!state.busy) {Text("Disable Drive")}
            Text("File export and verified private Drive backup are separate actions. Automatic backup is optional and may be delayed by Android.",style=MaterialTheme.typography.bodySmall)
        }
    }
    if(keyMode!=null) AlertDialog(properties=DialogProperties(securePolicy=SecureFlagPolicy.SecureOn),onDismissRequest={keyMode=null;key="";repeated=""},title={Text(if(keyMode=="enable") "Verify your saved recovery key" else "Find an encrypted Drive backup")},text={Column(verticalArrangement=Arrangement.spacedBy(10.dp)) {
        Text(if(keyMode=="enable") "First create an encrypted file backup to generate and confirm a recovery key. Re-enter that saved key to enable Drive." else "Choose your Google account next. The saved recovery key stays on this device and decrypts the discovered metadata. Nothing is restored automatically.")
        OutlinedTextField(key,{key=it},label={Text("Saved recovery key")},visualTransformation=PasswordVisualTransformation())
        OutlinedTextField(repeated,{repeated=it},label={Text("Re-enter recovery key")},visualTransformation=PasswordVisualTransformation())
        keyError?.let {Text(it,color=MaterialTheme.colorScheme.error)}
    }},confirmButton={TextButton(onClick={
        val mode=keyMode!!
        val valid=runCatching {val a=Backup.key(key);val b=Backup.key(repeated);try {require(java.security.MessageDigest.isEqual(a,b)) {"Recovery keys do not match"}} finally {a.fill(0);b.fill(0)};if(mode=="enable") RecoveryKeyStore(context).requireConfirmed(key)}
        if(valid.isFailure) keyError="Enter matching, complete saved keys. Enabling Drive also requires a confirmed file-backup key."
        else {val recovery=key.trim();keyMode=null;key="";repeated="";authorize(mode,if(mode=="discover") recovery else null)}
    }) {Text("Choose Google account")}},dismissButton={TextButton(onClick={keyMode=null;key="";repeated=""}) {Text("Cancel")}})
    if(chooser) AlertDialog(onDismissRequest={chooser=false},title={Text("Choose an exact backup")},text={Column(Modifier.heightIn(max=440.dp).verticalScroll(rememberScrollState()),verticalArrangement=Arrangement.spacedBy(8.dp)) {
        Text("Each writer has its own revision sequence. Dates do not establish a winner. All existing backups are kept.")
        state.candidates.groupBy {it.vaultTag}.toSortedMap().forEach {(vault,rows)->
            val history=CloudContract.history(rows,CloudBinding("drive",rows.first().accountTag,vault))
            Text("Vault $vault",style=MaterialTheme.typography.labelSmall)
            if(history.revisionConflict) Text("Conflicting snapshots share a writer revision. Select carefully.",color=MaterialTheme.colorScheme.error)
            history.writers.forEach {(writer,entries)->Text("Writer $writer",style=MaterialTheme.typography.labelSmall);entries.forEach {m->OutlinedButton(onClick={chooser=false;controller.select(m)}) {Text("Revision ${m.localRevision} · ${m.createdAt}\nSnapshot ${m.snapshot.snapshotId}\n${m.snapshot.byteCount} encrypted bytes")}} }
        }
    }},confirmButton={TextButton(onClick={chooser=false}) {Text("Close")}})
}
