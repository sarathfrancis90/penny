package ca.penny.offline

import org.json.JSONObject
import java.security.MessageDigest
import java.security.SecureRandom
import java.util.Base64
import javax.crypto.Cipher
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec

data class CloudBinding(val provider: String, val accountTag: String, val vaultTag: String? = null)
data class CloudDescriptor(val objectId: String, val snapshotId: String, val envelopeVersion: Int, val snapshotSchemaVersion: Int, val sha256: String, val byteCount: Int, val createdAt: String) {
    fun json() = JSONObject().put("objectId",objectId).put("snapshotId",snapshotId).put("envelopeVersion",envelopeVersion).put("snapshotSchemaVersion",snapshotSchemaVersion).put("sha256",sha256).put("byteCount",byteCount).put("createdAt",createdAt)
}
data class CloudManifest(val manifestId: String, val provider: String, val accountTag: String, val vaultTag: String, val writerId: String, val localRevision: Long, val createdAt: String, val verifiedAt: String, val previousManifestId: String?, val snapshot: CloudDescriptor) {
    val binding get() = CloudBinding(provider,accountTag,vaultTag)
    val manifestName get() = "manifest-$manifestId.pennymanifest"
    val snapshotName get() = "snapshot-${snapshot.objectId}.pennybackup"
    fun json() = JSONObject().put("schemaVersion",1).put("manifestId",manifestId).put("provider",provider).put("accountTag",accountTag).put("vaultTag",vaultTag).put("writerId",writerId).put("localRevision",localRevision).put("createdAt",createdAt).put("verifiedAt",verifiedAt).put("previousManifestId",previousManifestId ?: JSONObject.NULL).put("snapshot",snapshot.json())
    fun validate(): CloudManifest {
        Wire.requireId(manifestId); Wire.requireId(writerId)
        require(provider in listOf("drive","icloud")); CloudContract.digest(accountTag); CloudContract.digest(vaultTag)
        require(localRevision in 0..CloudContract.maxRevision); Wire.requireInstant(createdAt); Wire.requireInstant(verifiedAt)
        previousManifestId?.let { Wire.requireId(it); require(it != manifestId) }
        Wire.requireId(snapshot.objectId); Wire.requireId(snapshot.snapshotId)
        require(snapshot.envelopeVersion == 1 && snapshot.snapshotSchemaVersion in 1..3)
        CloudContract.digest(snapshot.sha256); require(snapshot.byteCount in 1..Backup.maxEnvelopeBytes); Wire.requireInstant(snapshot.createdAt)
        require(StrictJson.bytes(json()).size <= 8192)
        return this
    }
    fun requireBinding(binding: CloudBinding) { require(provider == binding.provider && accountTag == binding.accountTag && (binding.vaultTag == null || vaultTag == binding.vaultTag)) { "cloud_binding_mismatch" } }
    companion object {
        fun decode(j: JSONObject): CloudManifest {
            Wire.exactKeys(j,"schemaVersion","manifestId","provider","accountTag","vaultTag","writerId","localRevision","createdAt","verifiedAt","previousManifestId","snapshot")
            require(Wire.integer(j,"schemaVersion") == 1L)
            val s=j.getJSONObject("snapshot")
            Wire.exactKeys(s,"objectId","snapshotId","envelopeVersion","snapshotSchemaVersion","sha256","byteCount","createdAt")
            fun small(name: String): Int = Wire.integer(s,name).also { require(it in 0..Int.MAX_VALUE.toLong()) }.toInt()
            return CloudManifest(Wire.string(j,"manifestId"),Wire.string(j,"provider"),Wire.string(j,"accountTag"),Wire.string(j,"vaultTag"),Wire.string(j,"writerId"),Wire.integer(j,"localRevision"),Wire.string(j,"createdAt"),Wire.string(j,"verifiedAt"),if(j.isNull("previousManifestId")) null else Wire.string(j,"previousManifestId"),CloudDescriptor(Wire.string(s,"objectId"),Wire.string(s,"snapshotId"),small("envelopeVersion"),small("snapshotSchemaVersion"),Wire.string(s,"sha256"),small("byteCount"),Wire.string(s,"createdAt"))).validate()
        }
    }
}
data class CloudItem(val id: String,val name: String)
data class CloudPage(val items: List<CloudItem>, val nextPageToken: String?)
data class CloudHistory(val writers: Map<String,List<CloudManifest>>,val revisionConflict: Boolean) { val multipleWriters get()=writers.size>1 }

object CloudContract {
    const val maxRevision=9007199254740991L
    const val maxManifest=12288
    private val aad="PENNY-OFFLINE-CLOUD-MANIFEST:1".toByteArray()
    fun sha256(bytes: ByteArray)=MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02x".format(it.toInt() and 255) }
    fun digest(value: String) { require(Regex("[0-9a-f]{64}").matches(value)) }
    fun text(value: String,min: Int,max: Int) { Wire.requireUnicode(value); require(value.codePointCount(0,value.length) in min..max) }
    fun accountTag(provider: String,identity: String): String { require(provider in listOf("drive","icloud")); text(identity,1,1024); require(identity.none { it.code<32 || it.code==127 }); return sha256("PENNY-OFFLINE-CLOUD-ACCOUNT:1\u0000$provider\u0000$identity".toByteArray()) }
    fun vaultTag(id: String): String { Wire.requireId(id); return sha256("PENNY-OFFLINE-CLOUD-VAULT:1\u0000$id".toByteArray()) }
    private fun b64(bytes: ByteArray)=Base64.getEncoder().encodeToString(bytes)
    private fun unb64(value: String)=Base64.getDecoder().decode(value).also { require(b64(it)==value) }
    fun seal(manifest: CloudManifest,key: String): ByteArray = sealPlain(StrictJson.bytes(manifest.validate().json()),key,ByteArray(12).also { SecureRandom().nextBytes(it) })
    /** Explicit nonce is internal and used only by public golden-vector tests. */
    internal fun sealPlain(plain: ByteArray,key: String,nonce: ByteArray): ByteArray {
        require(plain.size in 1..8192 && nonce.size==12); CloudManifest.decode(StrictJson.objectFrom(plain))
        val secret=Backup.key(key)
        try {
            val cipher=Cipher.getInstance("AES/GCM/NoPadding").apply { init(Cipher.ENCRYPT_MODE,SecretKeySpec(secret,"AES"),GCMParameterSpec(128,nonce));updateAAD(aad) }
            val sealed=cipher.doFinal(plain)
            return StrictJson.bytes(JSONObject().put("formatVersion",1).put("algorithm","AES-256-GCM").put("nonce",b64(nonce)).put("ciphertext",b64(sealed.copyOfRange(0,sealed.size-16))).put("tag",b64(sealed.takeLast(16).toByteArray()))).also { require(it.size<=maxManifest) }
        } finally { secret.fill(0) }
    }
    fun open(bytes: ByteArray,key: String,binding: CloudBinding): CloudManifest {
        require(bytes.size in 1..maxManifest)
        val e=StrictJson.objectFrom(bytes); Wire.exactKeys(e,"formatVersion","algorithm","nonce","ciphertext","tag")
        require(Wire.integer(e,"formatVersion")==1L && Wire.string(e,"algorithm")=="AES-256-GCM")
        val cipherText=Wire.string(e,"ciphertext");require(cipherText.length<=4*((8192+2)/3))
        val nonce=unb64(Wire.string(e,"nonce"));val tag=unb64(Wire.string(e,"tag"));val encrypted=unb64(cipherText)
        require(nonce.size==12 && tag.size==16 && encrypted.size in 1..8192)
        val secret=Backup.key(key)
        try {
            val cipher=Cipher.getInstance("AES/GCM/NoPadding").apply {init(Cipher.DECRYPT_MODE,SecretKeySpec(secret,"AES"),GCMParameterSpec(128,nonce));updateAAD(aad)}
            val plain=cipher.doFinal(encrypted+tag)
            try { return CloudManifest.decode(StrictJson.objectFrom(plain)).also { it.requireBinding(binding) } } finally { plain.fill(0) }
        } finally { secret.fill(0) }
    }
    fun verifySnapshot(bytes: ByteArray,key: String,manifest: CloudManifest): Snapshot {
        manifest.validate();require(bytes.size==manifest.snapshot.byteCount && bytes.size<=Backup.maxEnvelopeBytes);require(sha256(bytes)==manifest.snapshot.sha256)
        val decoded=Backup.decryptVersioned(bytes,key); val s=decoded.second
        require(decoded.first==manifest.snapshot.snapshotSchemaVersion && s.snapshotId==manifest.snapshot.snapshotId && s.createdAt==manifest.snapshot.createdAt && vaultTag(s.vaultId)==manifest.vaultTag) { "snapshot_descriptor_mismatch" }
        return s
    }
    fun listed(item: CloudItem,bytes: ByteArray,key: String,binding: CloudBinding)=open(bytes,key,binding).also { require(item.name==it.manifestName) }
    fun collect(pages: List<CloudPage>): List<CloudItem> {
        require(pages.size in 1..10);val tokens=mutableSetOf<String>();val ids=mutableSetOf<String>();val names=mutableSetOf<String>();val result=mutableListOf<CloudItem>();var total=0
        pages.forEachIndexed { index,page ->
            require(page.items.size<=100);total+=page.items.size;require(total<=1000)
            page.nextPageToken?.let { text(it,1,2048);require(tokens.add(it)) };require((page.nextPageToken==null)==(index==pages.lastIndex)) { "listing_incomplete" }
            page.items.forEach { item ->
                text(item.id,1,1024);text(item.name,0,256);require(ids.add(item.id)) { "ambiguous_remote_object" }
                if(recognized(item.name)) { require(names.add(item.name)) { "ambiguous_remote_object" };if(item.name.startsWith("manifest-")) {result.add(item);require(result.size<=100)} }
            }
        };return result
    }
    fun recognized(name: String)=Regex("(?:manifest-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\.pennymanifest|snapshot-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\.pennybackup)").matches(name)
    fun history(manifests: List<CloudManifest>,binding: CloudBinding): CloudHistory {
        digest(checkNotNull(binding.vaultTag));require(manifests.size<=100);require(manifests.map {it.manifestId}.toSet().size==manifests.size)
        manifests.forEach { it.validate();it.requireBinding(binding) }
        val groups=manifests.groupBy {it.writerId}.toSortedMap().mapValues {(_,v)->v.sortedWith(compareByDescending<CloudManifest> {it.localRevision}.thenBy {it.manifestId})}
        return CloudHistory(groups,groups.values.any { rows -> rows.zipWithNext().any {(a,b)->a.localRevision==b.localRevision && a.snapshot.sha256!=b.snapshot.sha256} })
    }
}
