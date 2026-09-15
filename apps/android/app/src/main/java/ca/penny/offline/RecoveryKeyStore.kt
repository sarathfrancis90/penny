package ca.penny.offline

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.AtomicFile
import java.io.File
import java.security.KeyStore
import java.security.MessageDigest
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/** Confirmed portable key, sealed with a distinct device key; never backed up by Android. */
class RecoveryKeyStore(context: Context, name: String = "confirmed-recovery", private val alias: String = "penny.offline.recovery.v1") {
    private val file = AtomicFile(File(context.noBackupFilesDir,name))
    private val aad = "PENNY-CONFIRMED-RECOVERY:1".toByteArray()
    private fun deviceKey(create: Boolean): SecretKey {
        val keys = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (keys.getKey(alias,null) as? SecretKey)?.let { return it }
        check(create) { "Confirmed recovery key is unavailable. Use the separately saved recovery key." }
        return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES,"AndroidKeyStore").apply {
            init(KeyGenParameterSpec.Builder(alias,KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256).setRandomizedEncryptionRequired(true).build())
        }.generateKey()
    }
    fun bindingToken(): String = synchronized(CloudCoordinator.lock) { if(!file.baseFile.exists() && !File(file.baseFile.path+".bak").exists()) "absent" else file.openRead().use { CloudContract.sha256(BackupExporter.readBounded(it,256)) } }
    fun load(): String? = synchronized(CloudCoordinator.lock) {
        if(!(file.baseFile.exists() || File(file.baseFile.path+".bak").exists())) return null
        val data = file.openRead().use { it.readBytes() }; require(data.size in 28..256)
        val cipher = Cipher.getInstance("AES/GCM/NoPadding").apply { init(Cipher.DECRYPT_MODE,deviceKey(false),GCMParameterSpec(128,data.copyOfRange(0,12))); updateAAD(aad) }
        val plain = cipher.doFinal(data.copyOfRange(12,data.size))
        try { return String(plain,Charsets.UTF_8).also { Backup.key(it).fill(0) } } finally { plain.fill(0) }
    }
    fun confirm(expected: String, entered: String): Unit = synchronized(CloudCoordinator.lock) {
        val first = Backup.key(expected); val second = Backup.key(entered)
        try { require(MessageDigest.isEqual(first,second)) { "Recovery keys do not match. Re-enter the key you saved." } } finally { first.fill(0); second.fill(0) }
        val plain = expected.trim().toByteArray()
        val cipher = Cipher.getInstance("AES/GCM/NoPadding").apply { init(Cipher.ENCRYPT_MODE,deviceKey(true)); updateAAD(aad) }
        val sealed = try { cipher.iv+cipher.doFinal(plain) } finally { plain.fill(0) }
        val output = file.startWrite()
        try { output.write(sealed); file.finishWrite(output) } catch(e: Exception) { file.failWrite(output); throw e }
        check(load() == expected.trim()) { "Unable to verify protected recovery key" }
    }
    fun requireConfirmed(value: String) { check(load() == value.trim()) { "Verify your recovery key before exporting" } }
}
