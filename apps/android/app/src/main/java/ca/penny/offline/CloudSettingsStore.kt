package ca.penny.offline

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.AtomicFile
import org.json.JSONObject
import java.io.File
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

data class CloudSettings(val enabled: Boolean=false,val writerId: String=Wire.id(),val incarnation: String?=null,val binding: CloudBinding?=null,val lastGood: CloudManifest?=null,val publicationRevision: Long=0,val lastGoodDataRevision: Long?=null,val keyTag: String?=null,val automaticEnabled: Boolean=false,val scheduleId: String?=null,val automaticStatus: String="off") {
    fun json()=JSONObject().put("enabled",enabled).put("writerId",writerId).put("incarnation",incarnation ?: JSONObject.NULL).put("accountTag",binding?.accountTag ?: JSONObject.NULL).put("vaultTag",binding?.vaultTag ?: JSONObject.NULL).put("lastGood",lastGood?.json() ?: JSONObject.NULL).put("publicationRevision",publicationRevision).put("lastGoodDataRevision",lastGoodDataRevision ?: JSONObject.NULL).put("keyTag",keyTag ?: JSONObject.NULL).put("automaticEnabled",automaticEnabled).put("scheduleId",scheduleId ?: JSONObject.NULL).put("automaticStatus",automaticStatus)
    companion object {
        fun decode(j: JSONObject): CloudSettings {
            // Upgrade the preceding local P5 settings shape; cloud wire is unchanged.
            val legacy=!j.has("automaticEnabled") && !j.has("scheduleId") && !j.has("automaticStatus")
            if(legacy) return decode(JSONObject(j.toString()).put("automaticEnabled",false).put("scheduleId",JSONObject.NULL).put("automaticStatus","off"))
            Wire.exactKeys(j,"enabled","writerId","incarnation","accountTag","vaultTag","lastGood","publicationRevision","lastGoodDataRevision","keyTag","automaticEnabled","scheduleId","automaticStatus");require(j.get("enabled") is Boolean)
            val writer=Wire.string(j,"writerId");Wire.requireId(writer)
            val incarnation=if(j.isNull("incarnation")) null else Wire.string(j,"incarnation").also(Wire::requireId)
            val binding=if(j.isNull("accountTag")) null else CloudBinding("drive",Wire.string(j,"accountTag").also(CloudContract::digest),Wire.string(j,"vaultTag").also(CloudContract::digest))
            val good=if(j.isNull("lastGood")) null else CloudManifest.decode(j.getJSONObject("lastGood"))
            val keyTag=if(j.isNull("keyTag")) null else Wire.string(j,"keyTag").also(CloudContract::digest)
            require(!j.getBoolean("enabled") || (incarnation!=null && binding!=null && keyTag!=null))
            good?.let {it.requireBinding(checkNotNull(binding));require(it.writerId==writer)}
            val publicationRevision=Wire.integer(j,"publicationRevision");require(publicationRevision in 0..CloudContract.maxRevision)
            val dataRevision=if(j.isNull("lastGoodDataRevision")) null else Wire.integer(j,"lastGoodDataRevision").also {require(it>=0)}
            require(good==null || good.localRevision<=publicationRevision)
            require(j.get("automaticEnabled") is Boolean)
            val automatic=j.getBoolean("automaticEnabled");val schedule=if(j.isNull("scheduleId")) null else Wire.string(j,"scheduleId").also(Wire::requireId)
            val status=Wire.string(j,"automaticStatus");require(status in setOf("off","waiting","verified","unchanged","retry","attention"))
            require(!automatic || (j.getBoolean("enabled") && schedule!=null))
            return CloudSettings(j.getBoolean("enabled"),writer,incarnation,binding,good,publicationRevision,dataRevision,keyTag,automatic,schedule,status)
        }
    }
}
/** Cloud state has a distinct device key and is excluded from all platform/portable backups. */
class CloudSettingsStore(context: Context,name: String="drive-state",private val alias: String="penny.offline.drive.v1",private val afterWrite: ()->Unit = {}) {
    private val file=AtomicFile(File(context.noBackupFilesDir,name))
    private val automaticStop=File(context.noBackupFilesDir,"$name.automatic-stop")
    private val unverified=File(context.noBackupFilesDir,"$name.unverified")
    private val aad="PENNY-DRIVE-LOCAL-STATE:1".toByteArray()
    private fun key(create: Boolean): SecretKey {
        val keys=KeyStore.getInstance("AndroidKeyStore").apply {load(null)}
        (keys.getKey(alias,null) as? SecretKey)?.let {return it}
        check(create && !file.baseFile.exists() && !File(file.baseFile.path+".bak").exists()) {"Protected Drive settings unavailable. Disable and set up Drive again."}
        return KeyGenerator.getInstance("AES","AndroidKeyStore").apply {init(KeyGenParameterSpec.Builder(alias,KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT).setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).setKeySize(256).build())}.generateKey()
    }
    fun load(): CloudSettings = synchronized(CloudCoordinator.lock) {check(!unverified.exists()) {"Protected Drive state has an incomplete write. Disable and set up again."};read()}
    private fun read(): CloudSettings {
        if(!file.baseFile.exists() && !File(file.baseFile.path+".bak").exists()) return CloudSettings()
        val bytes=file.openRead().use {BackupExporter.readBounded(it,20000)};require(bytes.size>=28)
        val c=Cipher.getInstance("AES/GCM/NoPadding").apply {init(Cipher.DECRYPT_MODE,key(false),GCMParameterSpec(128,bytes.copyOfRange(0,12)));updateAAD(aad)}
        val plain=c.doFinal(bytes.copyOfRange(12,bytes.size));try {return CloudSettings.decode(StrictJson.objectFrom(plain))} finally {plain.fill(0)}
    }
    fun save(settings: CloudSettings): Unit = synchronized(CloudCoordinator.lock) {
        CloudSettings.decode(settings.json());val plain=StrictJson.bytes(settings.json());require(plain.size<=18000)
        val c=Cipher.getInstance("AES/GCM/NoPadding").apply {init(Cipher.ENCRYPT_MODE,key(true));updateAAD(aad)}
        val bytes=try {c.iv+c.doFinal(plain)} finally {plain.fill(0)}
        val previous=if(file.baseFile.exists() || File(file.baseFile.path+".bak").exists()) file.openRead().use {BackupExporter.readBounded(it,20000)} else null
        val previousSettings=if(previous!=null) load() else null
        // A process death during write/verification fails closed on next launch.
        unverified.outputStream().use {it.write(1);it.flush();it.fd.sync()}
        fun write(value: ByteArray) {val out=file.startWrite();try {out.write(value);file.finishWrite(out)} catch(e: Exception) {file.failWrite(out);throw e}}
        try {write(bytes);afterWrite();check(read()==settings);check(unverified.delete())}
        catch(e: Exception) {
            try {if(previous==null) file.delete() else {write(previous);check(read()==previousSettings)};check(!unverified.exists() || unverified.delete())}
            catch(rollback: Exception) {e.addSuppressed(rollback)}
            throw e
        }
    }
    fun automaticStopped(): Boolean = synchronized(CloudCoordinator.lock) {automaticStop.exists()}
    fun stopAutomatic(): Unit = synchronized(CloudCoordinator.lock) {automaticStop.outputStream().use {it.write(1);it.flush();it.fd.sync()}}
    fun allowAutomatic(): Unit = synchronized(CloudCoordinator.lock) {check(!automaticStop.exists() || automaticStop.delete())}
    fun disable(): Unit = synchronized(CloudCoordinator.lock) {stopAutomatic();unverified.outputStream().use {it.write(1);it.flush();it.fd.sync()};file.delete();check(!file.baseFile.exists() && !File(file.baseFile.path+".bak").exists());check(!unverified.exists() || unverified.delete())}
}
