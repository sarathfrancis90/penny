package ca.penny.offline

import android.content.ClipData
import android.content.ClipDescription
import android.content.ClipboardManager
import android.content.Context
import android.os.Handler
import android.os.Looper
import android.os.PersistableBundle
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.DialogProperties

object SensitiveClipboard {
    fun clearIfOwned(context: Context,key: String) {
        val manager=context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
        val current=manager.primaryClip
        if(current?.description?.label == "Penny recovery key" && current.getItemAt(0).text?.toString()==key) {
            if(android.os.Build.VERSION.SDK_INT>=28) manager.clearPrimaryClip() else manager.setPrimaryClip(ClipData.newPlainText("",""))
        }
    }
    fun copy(context: Context,key: String) {
        val manager=context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
        manager.setPrimaryClip(ClipData.newPlainText("Penny recovery key",key).apply { description.extras=PersistableBundle().apply { putBoolean("android.content.extra.IS_SENSITIVE",true) } })
        Handler(Looper.getMainLooper()).postDelayed({ clearIfOwned(context,key) },60_000)
    }
}
@Composable fun RecoveryDialog(key: String,busy: Boolean,onDismiss: ()->Unit,onConfirm: (String,String,(String?)->Unit)->Unit) {
    val context=LocalContext.current
    var supplied by remember { mutableStateOf("") }
    var verifying by remember { mutableStateOf(false) }; var entered by remember { mutableStateOf("") }; var error by remember { mutableStateOf<String?>(null) }
    DisposableEffect(key) { onDispose { SensitiveClipboard.clearIfOwned(context,key) } }
    AlertDialog(onDismissRequest=onDismiss,properties=DialogProperties(securePolicy=androidx.compose.ui.window.SecureFlagPolicy.SecureOn),title={Text(if(verifying) "Verify your saved key" else "Keep your recovery key")},text={
        Column(Modifier.verticalScroll(rememberScrollState()),verticalArrangement=Arrangement.spacedBy(12.dp)) {
            if(!verifying) {
                if(key.isEmpty()) {
                    Text("The device-protected copy is unavailable. Enter your separately saved recovery key, then re-enter it to protect a new copy. Your vault and existing backup files are unchanged.")
                    OutlinedTextField(supplied,{supplied=it;error=null},label={Text("Saved recovery key")},visualTransformation=PasswordVisualTransformation())
                } else {
                Text("Save this key in a password manager. Next, re-enter it to verify your copy. Penny cannot recover this backup without the key.")
                Text(key,style=MaterialTheme.typography.bodySmall)
                TextButton(onClick={SensitiveClipboard.copy(context,key)}) { Text("Copy recovery key") }
                Text("Copied keys are marked sensitive and cleared after a minute or when this dialog closes, if the clipboard still contains this key.",style=MaterialTheme.typography.bodySmall)
                }
                error?.let { Text(it,color=MaterialTheme.colorScheme.error) }
            } else {
                Text("Enter the key from your saved copy. A confirmed copy is also encrypted on this device with a separate Android Keystore key.")
                OutlinedTextField(entered,{entered=it;error=null},label={Text("Re-enter recovery key")},visualTransformation=PasswordVisualTransformation(),modifier=Modifier.testTag("recovery-reentry"))
                error?.let { Text(it,color=MaterialTheme.colorScheme.error) }
            }
        }
    },confirmButton={TextButton(enabled=!busy,onClick={
        if(!verifying) {
            if(key.isNotEmpty() || runCatching { Backup.key(supplied).fill(0) }.isSuccess) { verifying=true; SensitiveClipboard.clearIfOwned(context,key) }
            else error="Enter the complete recovery key beginning pny1-"
        }
        else onConfirm(key.ifEmpty { supplied },entered) { error=it }
    }) { Text(if(verifying) "Verify and choose file" else "I saved my key") }},dismissButton={TextButton(onClick=onDismiss) { Text("Cancel") }})
}
