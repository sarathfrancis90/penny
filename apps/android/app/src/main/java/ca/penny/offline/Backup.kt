package ca.penny.offline

import org.json.JSONArray
import org.json.JSONObject
import java.security.SecureRandom
import java.util.Base64
import javax.crypto.Cipher
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec

data class Snapshot(val vaultId: String, val expenses: List<Expense>, val snapshotId: String = Wire.id(), val createdAt: String = Wire.now(), val attachments: List<Attachment> = emptyList(), val finance: FinanceData = FinanceData()) {
    fun validate() {
        Wire.requireId(vaultId); Wire.requireId(snapshotId); Wire.requireInstant(createdAt)
        require(expenses.size <= 10_000) { "The 10,000 expense limit is reached. Export and verify a backup before removing records to free space." }
        require(expenses.map { it.id }.toSet().size == expenses.size) { "Duplicate expense IDs" }
        Money.total(expenses)
        require(attachments.size <= 100) { "The 100 receipt limit is reached. Export and verify a backup before removing receipts to free space." }
        require(attachments.map { it.id }.toSet().size == attachments.size) { "Duplicate receipt IDs" }
        val owners = expenses.map { it.id }.toSet()
        require(attachments.sumOf { it.byteCount } <= Attachment.maxTotalBytes) { "Receipts exceed the 8 MiB vault limit. Export and verify a backup before removing receipts to free space." }
        attachments.forEach { require(it.expenseId in owners) { "Receipt owner is missing" }; it.bytes() }
        finance.validate(expenses)
    }
    fun json(): JSONObject {
        validate()
        return JSONObject().put("schemaVersion", 3).put("snapshotId", snapshotId).put("vaultId", vaultId)
            .put("createdAt", createdAt).put("expenses", JSONArray().apply { expenses.forEach { put(it.json()) } })
            .put("attachments", JSONArray().apply { attachments.forEach { put(it.json()) } })
            .apply { finance.domains().forEach { (name,rows) -> put(name,JSONArray().apply { rows.forEach { put(it.json()) } }) } }
    }
    companion object {
        fun decode(json: JSONObject): Snapshot {
            val version = Wire.integer(json, "schemaVersion")
            val fields = arrayOf("schemaVersion", "snapshotId", "vaultId", "createdAt", "expenses", "attachments")
            require(version in 1L..3L) { "Unsupported backup version" }
            Wire.exactKeys(json, *(if (version < 3) fields else fields + FinanceData.limits.keys.toTypedArray()))
            val attachments = json.getJSONArray("attachments")
            require(attachments.length() <= 100 && (version != 1L || attachments.length() == 0)) { "Unsupported receipt count" }
            val rows = json.getJSONArray("expenses")
            require(rows.length() <= 10_000) { "Too many expenses" }
            return Snapshot(Wire.string(json, "vaultId"), (0 until rows.length()).map { Expense.decode(rows.getJSONObject(it),version.toInt()) }, Wire.string(json, "snapshotId"), Wire.string(json, "createdAt"), (0 until attachments.length()).map { Attachment.decode(attachments.getJSONObject(it)) }, if (version < 3) FinanceData() else FinanceData.decode(json)).also { it.validate() }
        }
    }
}

/** Portable backup v1. The recovery key is never sent with the backup; confirmed keys are separately device-sealed. */
object Backup {
    const val maxEnvelopeBytes = 20 * 1024 * 1024
    const val maxPlaintextBytes = 15 * 1024 * 1024
    private val aad = "PENNY-OFFLINE-BACKUP:1".toByteArray(Charsets.UTF_8)
    fun recoveryKey(): String = "pny1-" + ByteArray(32).also { SecureRandom().nextBytes(it) }.joinToString("") { "%02x".format(it.toInt() and 0xff) }
    fun key(value: String): ByteArray {
        val text = value.trim()
        require(Regex("pny1-[0-9a-f]{64}").matches(text)) { "Enter the complete recovery key beginning pny1-" }
        return text.drop(5).chunked(2).map { it.toInt(16).toByte() }.toByteArray()
    }
    private fun b64(value: ByteArray) = Base64.getEncoder().encodeToString(value)
    private fun unb64(value: String): ByteArray = Base64.getDecoder().decode(value).also { require(b64(it) == value) { "Invalid backup encoding" } }
    fun requireCapacity(snapshot: Snapshot) {
        val size = StrictJson.bytes(snapshot.json()).size
        // Leave room for padded base64 and the entire authenticated envelope.
        require(size <= maxPlaintextBytes && 4L * ((size + 2L) / 3L) + 1024L <= maxEnvelopeBytes) { "Vault backup capacity reached (15 MiB snapshot / 20 MiB file). Export and verify a backup before removing records or receipts to free space." }
    }
    fun encrypt(snapshot: Snapshot, recovery: String): ByteArray {
        requireCapacity(snapshot)
        val plain = StrictJson.bytes(snapshot.json())
        require(plain.size <= maxPlaintextBytes) { "Vault exceeds backup size limit" }
        val secret = key(recovery)
        try {
            val cipher = Cipher.getInstance("AES/GCM/NoPadding").apply { init(Cipher.ENCRYPT_MODE, SecretKeySpec(secret, "AES")); updateAAD(aad) }
            val combined = cipher.doFinal(plain)
            return StrictJson.bytes(JSONObject().put("formatVersion", 1).put("algorithm", "AES-256-GCM")
                .put("nonce", b64(cipher.iv)).put("ciphertext", b64(combined.copyOfRange(0, combined.size - 16)))
                .put("tag", b64(combined.takeLast(16).toByteArray())))
                .also { require(it.size <= maxEnvelopeBytes) { "Backup exceeds size limit" } }
        } finally { secret.fill(0); plain.fill(0) }
    }
    fun decrypt(data: ByteArray, recovery: String): Snapshot = decryptVersioned(data,recovery).second
    internal fun decryptVersioned(data: ByteArray, recovery: String): Pair<Int,Snapshot> {
        require(data.size <= maxEnvelopeBytes) { "Backup exceeds size limit" }
        val envelope = StrictJson.objectFrom(data)
        Wire.exactKeys(envelope, "formatVersion", "algorithm", "nonce", "ciphertext", "tag")
        require(Wire.integer(envelope, "formatVersion") == 1L && Wire.string(envelope, "algorithm") == "AES-256-GCM") { "Unsupported backup format" }
        val nonce = unb64(Wire.string(envelope, "nonce")); val tag = unb64(Wire.string(envelope, "tag")); val encrypted = unb64(Wire.string(envelope, "ciphertext"))
        require(nonce.size == 12 && tag.size == 16 && encrypted.size <= maxPlaintextBytes) { "Invalid backup envelope" }
        val secret = key(recovery)
        try {
            val cipher = Cipher.getInstance("AES/GCM/NoPadding").apply {
                init(Cipher.DECRYPT_MODE, SecretKeySpec(secret, "AES"), GCMParameterSpec(128, nonce)); updateAAD(aad)
            }
            val plain = cipher.doFinal(encrypted + tag)
            try { val json=StrictJson.objectFrom(plain); return Wire.integer(json,"schemaVersion").toInt() to Snapshot.decode(json) } finally { plain.fill(0) }
        } finally { secret.fill(0) }
    }
}
