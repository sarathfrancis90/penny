package ca.penny.offline

import org.json.JSONObject
import java.security.MessageDigest
import java.util.Base64

data class Attachment(val id: String, val expenseId: String, val mediaType: String, val byteCount: Long, val sha256: String, val dataBase64: String) {
    fun bytes(): ByteArray {
        Wire.requireId(id); Wire.requireId(expenseId)
        require(byteCount in 1..maxBytes.toLong() && dataBase64.length <= 4 * ((maxBytes + 2) / 3)) { "Receipt exceeds 2 MiB" }
        val bytes = Base64.getDecoder().decode(dataBase64)
        require(bytes.size.toLong() == byteCount && Base64.getEncoder().encodeToString(bytes) == dataBase64) { "Receipt encoding or length mismatch" }
        require(Regex("[0-9a-f]{64}").matches(sha256) && digest(bytes) == sha256) { "Receipt digest mismatch" }
        require(mediaType == mediaType(bytes)) { "Receipt must be a PNG or JPEG image" }
        return bytes
    }
    fun json(): JSONObject = JSONObject().put("id", id).put("expenseId", expenseId).put("mediaType", mediaType)
        .put("byteCount", byteCount).put("sha256", sha256).put("dataBase64", dataBase64)
    companion object {
        const val maxBytes = 2 * 1024 * 1024
        const val maxTotalBytes = 8 * 1024 * 1024
        fun digest(bytes: ByteArray): String = MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02x".format(it.toInt() and 255) }
        fun mediaType(bytes: ByteArray): String {
            if (bytes.size >= 45 && bytes.take(8) == listOf(137,80,78,71,13,10,26,10).map { it.toByte() } && java.nio.ByteBuffer.wrap(bytes,8,4).int == 13 && bytes.copyOfRange(12,16).contentEquals("IHDR".toByteArray())) {
                val dims = java.nio.ByteBuffer.wrap(bytes,16,8)
                val width = dims.int.toLong(); val height = dims.int.toLong()
                require(width in 1..4096 && height in 1..4096 && width * height <= 16_000_000) { "Receipt image dimensions exceed limits" }
                var offset = 8
                var sawData = false
                var ended = false
                while (offset < bytes.size) {
                    require(bytes.size - offset >= 12) { "Truncated PNG chunk" }
                    val length = java.nio.ByteBuffer.wrap(bytes, offset, 4).int
                    require(length >= 0 && length.toLong() + 12 <= bytes.size - offset) { "Truncated PNG chunk" }
                    val type = String(bytes, offset + 4, 4, Charsets.US_ASCII)
                    require(type != "acTL" && (type != "IHDR" || offset == 8)) { "Animated or invalid PNG" }
                    offset += length + 12
                    if (type == "IDAT") sawData = true
                    if (type == "IEND") { require(length == 0 && offset == bytes.size); ended = true; break }
                }
                require(sawData && ended) { "Incomplete PNG" }
                return "image/png"
            }
            require(bytes.size >= 5 && bytes[0] == 0xff.toByte() && bytes[1] == 0xd8.toByte() && bytes[2] == 0xff.toByte() && bytes[bytes.size-2] == 0xff.toByte() && bytes.last() == 0xd9.toByte()) { "Unsupported receipt image" }
            var offset = 2
            var dimensions = false
            while (offset < bytes.size - 2) {
                require(bytes[offset] == 0xff.toByte()) { "Invalid JPEG marker" }
                while (offset < bytes.size && bytes[offset] == 0xff.toByte()) offset++
                require(offset < bytes.size)
                val marker = bytes[offset++].toInt() and 255
                if (marker == 0xda || marker == 0xd9) break
                if (marker == 1 || marker in 0xd0..0xd7) continue
                require(offset + 2 <= bytes.size)
                val length = ((bytes[offset].toInt() and 255) shl 8) or (bytes[offset + 1].toInt() and 255)
                require(length >= 2 && offset + length <= bytes.size) { "Truncated JPEG" }
                if (marker in listOf(0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf)) {
                    require(length >= 7)
                    val height = ((bytes[offset + 3].toInt() and 255) shl 8) or (bytes[offset + 4].toInt() and 255)
                    val width = ((bytes[offset + 5].toInt() and 255) shl 8) or (bytes[offset + 6].toInt() and 255)
                    require(width in 1..4096 && height in 1..4096 && width.toLong() * height <= 16_000_000)
                    dimensions = true
                }
                offset += length
            }
            require(dimensions) { "Missing JPEG dimensions" }
            return "image/jpeg"
        }
        fun fromBytes(expenseId: String, bytes: ByteArray): Attachment = Attachment(Wire.id(), expenseId, mediaType(bytes), bytes.size.toLong(), digest(bytes), Base64.getEncoder().encodeToString(bytes)).also { it.bytes() }
        fun decode(json: JSONObject): Attachment {
            Wire.exactKeys(json, "id", "expenseId", "mediaType", "byteCount", "sha256", "dataBase64")
            return Attachment(Wire.string(json,"id"), Wire.string(json,"expenseId"), Wire.string(json,"mediaType"), Wire.integer(json,"byteCount"), Wire.string(json,"sha256"), Wire.string(json,"dataBase64")).also { it.bytes() }
        }
    }
}
