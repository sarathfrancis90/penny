package ca.penny.v4frameprobe

import ca.penny.offline.*
import java.io.Closeable
import java.io.InputStream
import java.io.OutputStream
import java.math.BigDecimal
import java.security.MessageDigest
import org.json.JSONObject

data class LogicalSummary(val snapshotId: String, val vaultId: String, val createdAt: String, val counts: Map<String, Long>,
    val receiptBytes: Long, val nonReceiptBytes: Long, val policyMetadataBytes: Long, val recordCount: Long, val transcriptSha256: String)
data class ReceiptDescriptor(val id: String, val expenseId: String, val mediaType: String, val byteCount: Long, val sha256: String)

/** Required isolated sink. Never mutate a live vault or publish a preview here.
 * Consume values synchronously; receipt storage must be device-encrypted. Receipt
 * buffers are borrowed and wiped immediately after the call. finishUncommitted
 * must validate/reopen staged storage; it must not commit, publish or expose it.
 * discard must invalidate/remove all staged state, including after close fails. */
interface LogicalValidationSink : Closeable {
    fun begin(snapshotId: String, vaultId: String, createdAt: String)
    fun record(kind: Int, value: JSONObject)
    fun receipt(descriptor: ReceiptDescriptor, bytes: ByteArray)
    fun finishUncommitted(summary: LogicalSummary)
    fun discard()
}

/** Experimental logical admission only. No production candidate or restore API. */
object LogicalCodec {
    fun decode(root: ByteArray, input: InputStream, sink: LogicalValidationSink,
               cancellation: FrameCancellation = FrameCancellation()): LogicalSummary {
        var success = false
        var failure: Throwable? = null
        try {
            val parser = LogicalParser(sink, cancellation)
            FrameCodec.decrypt(root, input, parser, cancellation) // Includes FINAL, true EOF and stream close.
            val summary = parser.result()
            cancellation.check(); sink.finishUncommitted(summary); cancellation.check()
            sink.close(); cancellation.check()
            success = true
            return summary
        } catch (error: Throwable) { failure = error; throw error }
        finally {
            if (!success) {
                try { input.close() } catch (error: Throwable) { failure?.addSuppressed(error) }
                try { sink.discard() } catch (error: Throwable) { failure?.addSuppressed(error) }
                try { sink.close() } catch (error: Throwable) { failure?.addSuppressed(error) }
            }
        }
    }
}

internal class LogicalParser(private val sink: LogicalValidationSink, private val cancellation: FrameCancellation) : OutputStream(), AuthenticatedFrameBoundary {
    companion object {
        val limits = linkedMapOf("budgets" to 1200L, "incomeSources" to 1000L, "incomeEntries" to 10000L,
            "savingsGoals" to 1000L, "savingsEntries" to 10000L, "recurringExpenses" to 1000L,
            "expenses" to 50000L, "attachments" to 5000L)
        const val MAX_METADATA = 134217728L
        const val MAX_RECEIPTS = 536870912L
        private val hashShape = Regex("[0-9a-f]{64}")
        private fun hash(bytes: ByteArray) = bytes.joinToString("") { "%02x".format(it.toInt() and 255) }
        internal fun exactJson(bytes: ByteArray): JSONObject {
            StrictJson.objectFrom(bytes)
            // JSONObject rounds decimal/exponent tokens through Double. Reject
            // fractional or overflowing mathematical values before those can be admitted.
            val text = bytes.toString(Charsets.UTF_8)
            val normalized = StringBuilder(text.length)
            var i = 0
            while (i < text.length) {
                if (text[i] == '"') {
                    val start = i
                    i++
                    while (i < text.length && text[i] != '"') { if (text[i] == '\\') i++; i++ }
                    i++
                    normalized.append(text, start, i)
                } else if (text[i] == '-' || text[i] in '0'..'9') {
                    val start = i++
                    while (i < text.length && text[i] in "0123456789.eE+-") i++
                    val token = text.substring(start, i)
                    val mantissa = token.takeWhile { it != 'e' && it != 'E' }
                    val zero = mantissa.none { it in '1'..'9' }
                    val value = if (zero) 0L else {
                        val number = BigDecimal(token).stripTrailingZeros()
                        require(number.scale() <= 0 && number.precision().toLong() - number.scale() <= 19) { "Inexact or excessive JSON integer" }
                        number.longValueExact()
                    }
                    normalized.append(value)
                } else normalized.append(text[i++])
            }
            // Hashing always uses original bytes; normalization only prevents
            // JSONObject's Double conversion from changing a validated integer.
            return JSONObject(normalized.toString())
        }
    }
    private val header = ByteArray(9)
    private var headerUsed = 0
    private var kind = 0
    private var payload: ByteArray? = null
    private var used = 0
    private var domain = 1
    private var records = 0L
    private var metadata = 0L
    private var bodyMetadata = 0L
    private var receiptBytes = 0L
    private var declaredMetadata = 0L
    private var declaredReceipts = 0L
    private var expectedCounts = emptyMap<String, Long>()
    private val counts = limits.mapValues { 0L }.toMutableMap()
    private var snapshotId = ""
    private var vaultId = ""
    private var createdAt = ""
    private var pending: ReceiptDescriptor? = null
    private var receiptDigest: MessageDigest? = null
    private val lastId = arrayOfNulls<String>(12)
    private val transcript = MessageDigest.getInstance("SHA-256")
    private var summary: LogicalSummary? = null
    private var finalBoundary = false
    private var closed = false
    private val sources = mutableSetOf<String>()
    private val goals = mutableMapOf<String, Long>()
    private val templates = mutableSetOf<String>()
    private val expenses = mutableSetOf<String>()
    private val budgetPairs = mutableSetOf<String>()
    private val incomeOccurrences = mutableSetOf<String>()
    private val expenseOccurrences = mutableSetOf<String>()
    private val sums = mutableMapOf<String, Long>()

    override fun write(value: Int) = write(byteArrayOf(value.toByte()), 0, 1)
    override fun write(bytes: ByteArray, offset: Int, length: Int) {
        require(!closed && offset >= 0 && length >= 0 && offset <= bytes.size - length)
        var cursor = offset
        val end = offset + length
        while (cursor < end) {
            cancellation.check()
            require(summary == null) { "Bytes after logical END" }
            if (payload == null) {
                val size = minOf(9 - headerUsed, end - cursor)
                bytes.copyInto(header, headerUsed, cursor, cursor + size); headerUsed += size; cursor += size
                if (headerUsed == 9) admitHeader()
            } else {
                val body = checkNotNull(payload)
                val size = minOf(body.size - used, end - cursor)
                bytes.copyInto(body, used, cursor, cursor + size)
                if (kind != 11) transcript.update(bytes, cursor, size)
                if (kind == 10) checkNotNull(receiptDigest).update(bytes, cursor, size)
                used += size; cursor += size
                if (used == body.size) {
                    try { completeRecord(body) } finally { body.fill(0); payload = null; used = 0; headerUsed = 0 }
                }
            }
        }
    }
    private fun admitHeader() {
        kind = header[0].toInt() and 255
        require(kind in 1..11 && records < 84202) { "Unknown kind or excessive records" }
        val size = FrameCodec.u64(header, 1)
        require(if (kind == 10) size in 1..Attachment.maxBytes.toLong() else size in 1..65536) { "Invalid record length" }
        require(if (records == 0L) kind == 1 else kind != 1) { "BEGIN must be exactly first" }
        if (pending != null) require(kind == 10 && size == pending!!.byteCount) { "Receipt bytes must immediately match descriptor" }
        else require(kind != 10) { "Unpaired receipt bytes" }
        if (kind in 2..9) { require(kind >= domain) { "Domain ordering" }; domain = kind }
        metadata = Math.addExact(metadata, 9 + if (kind == 10) 0 else size)
        require(metadata <= MAX_METADATA) { "Metadata policy capacity" }
        if (kind in 2..10) {
            bodyMetadata = Math.addExact(bodyMetadata, 9 + if (kind == 10) 0 else size)
            require(bodyMetadata <= declaredMetadata) { "Metadata declaration exceeded" }
        }
        if (kind == 10) {
            receiptBytes = Math.addExact(receiptBytes, size)
            require(receiptBytes <= MAX_RECEIPTS && receiptBytes <= declaredReceipts) { "Receipt capacity" }
            receiptDigest = MessageDigest.getInstance("SHA-256")
        }
        if (kind != 11) transcript.update(header)
        payload = ByteArray(size.toInt())
    }
    private fun countObject() {
        val name = limits.keys.elementAt(kind - 2)
        val count = Math.addExact(counts.getValue(name), 1)
        require(count <= limits.getValue(name) && count <= expectedCounts.getValue(name)) { "Declared object count exceeded" }
        counts[name] = count
    }
    private fun orderedId(id: String) {
        Wire.requireId(id)
        require(lastId[kind] == null || id > lastId[kind]!!) { "IDs must strictly increase within domain" }
        lastId[kind] = id
    }
    private fun declaredCounts(json: JSONObject): Map<String, Long> {
        Wire.exactKeys(json, *limits.keys.toTypedArray())
        return limits.mapValues { (name, max) -> Wire.integer(json, name).also { require(it in 0..max) } }
    }
    private fun completeRecord(bytes: ByteArray) {
        if (kind == 10) {
            val descriptor = checkNotNull(pending)
            require(hash(checkNotNull(receiptDigest).digest()) == descriptor.sha256) { "Receipt digest mismatch" }
            receiptDigest = null
            require(Attachment.mediaType(bytes) == descriptor.mediaType) { "Receipt media mismatch" }
            cancellation.check(); ReceiptImage.decode(bytes).recycle(); cancellation.check()
            sink.receipt(descriptor, bytes); pending = null
        } else {
            val json = exactJson(bytes)
            when (kind) {
                1 -> {
                    Wire.exactKeys(json, "schemaVersion", "capacityProfile", "snapshotId", "vaultId", "createdAt", "counts", "receiptBytes", "nonReceiptBytes")
                    require(Wire.integer(json, "schemaVersion") == 4L && Wire.string(json, "capacityProfile") == "A")
                    snapshotId = Wire.string(json, "snapshotId").also(Wire::requireId)
                    vaultId = Wire.string(json, "vaultId").also(Wire::requireId)
                    createdAt = Wire.string(json, "createdAt").also(Wire::requireInstant)
                    expectedCounts = declaredCounts(json.getJSONObject("counts"))
                    declaredMetadata = Wire.integer(json, "nonReceiptBytes").also { require(it in 0..MAX_METADATA) }
                    declaredReceipts = Wire.integer(json, "receiptBytes").also { require(it in 0..MAX_RECEIPTS) }
                    sink.begin(snapshotId, vaultId, createdAt)
                }
                // Finalize parser-owned indexes before handing the detached JSON to the sink.
                in 2..8 -> { orderedId(Wire.string(json, "id")); countObject(); domainObject(json); sink.record(kind, json) }
                9 -> {
                    Wire.exactKeys(json, "id", "expenseId", "mediaType", "byteCount", "sha256")
                    val id = Wire.string(json, "id"); orderedId(id); countObject()
                    val owner = Wire.string(json, "expenseId").also(Wire::requireId)
                    require(owner in expenses) { "Missing receipt owner" }
                    val type = Wire.string(json, "mediaType"); require(type in listOf("image/png", "image/jpeg"))
                    val size = Wire.integer(json, "byteCount"); require(size in 1..Attachment.maxBytes.toLong())
                    val digest = Wire.string(json, "sha256"); require(hashShape.matches(digest))
                    pending = ReceiptDescriptor(id, owner, type, size, digest)
                }
                11 -> {
                    Wire.exactKeys(json, "snapshotId", "counts", "receiptBytes", "nonReceiptBytes", "recordCount", "streamSha256")
                    require(pending == null && Wire.string(json, "snapshotId") == snapshotId)
                    require(declaredCounts(json.getJSONObject("counts")) == expectedCounts && counts == expectedCounts)
                    require(Wire.integer(json, "receiptBytes") == receiptBytes && receiptBytes == declaredReceipts)
                    require(Wire.integer(json, "nonReceiptBytes") == bodyMetadata && bodyMetadata == declaredMetadata)
                    require(Wire.integer(json, "recordCount") == records && records <= 84201)
                    val digest = Wire.string(json, "streamSha256")
                    require(hashShape.matches(digest) && digest == hash(transcript.digest())) { "Logical transcript mismatch" }
                    summary = LogicalSummary(snapshotId, vaultId, createdAt, java.util.Collections.unmodifiableMap(counts.toMap()), receiptBytes, bodyMetadata, metadata, records, digest)
                }
            }
        }
        records = Math.addExact(records, 1)
    }
    private fun add(name: String, amount: Long) {
        sums[name] = Math.addExact(sums[name] ?: 0, amount).also { require(it <= Money.maxAggregate) { "Financial aggregate exceeded" } }
    }
    private fun domainObject(json: JSONObject) {
        when (kind) {
            2 -> Budget.decode(json).let { require(budgetPairs.add("${it.category}/${it.month}")); add("budget", it.limitMinor) }
            3 -> IncomeSource.decode(json).let { sources.add(it.id); add("source", it.grossMinor) }
            4 -> IncomeEntry.decode(json).let {
                require(it.sourceId in sources); it.occurrenceDate?.let { date -> require(incomeOccurrences.add("${it.sourceId}/$date")) }
                add("income", it.amountMinor)
            }
            5 -> SavingsGoal.decode(json).let {
                goals[it.id] = it.openingMinor; add("target", it.targetMinor); add("opening", it.openingMinor)
                add("monthly", it.monthlyContributionMinor); add("allSavings", it.openingMinor)
            }
            6 -> SavingsEntry.decode(json).let {
                require(it.goalId in goals)
                goals[it.goalId] = Math.addExact(goals.getValue(it.goalId), it.amountMinor).also { value -> require(value <= Money.maxAggregate) }
                add("contribution", it.amountMinor); add("allSavings", it.amountMinor)
            }
            7 -> RecurringExpense.decode(json).let { templates.add(it.id); add("template", it.amountMinor) }
            8 -> Expense.decode(json, 3).let {
                it.recurringTemplateId?.let { id -> require(id in templates && expenseOccurrences.add("$id/${it.recurringOccurrenceDate}")) }
                expenses.add(it.id); add("expense", it.amountMinor)
            }
        }
    }
    override fun frameEnded(final: Boolean) {
        cancellation.check()
        if (final) { require(summary != null && payload == null && headerUsed == 0 && pending == null) { "FINAL before complete logical END" }; finalBoundary = true }
        else require(summary == null) { "Logical END terminated a MESSAGE frame" }
    }
    override fun close() {
        closed = true; payload?.fill(0); payload = null; header.fill(0)
        receiptDigest = null
        sources.clear(); goals.clear(); templates.clear(); expenses.clear(); budgetPairs.clear(); incomeOccurrences.clear(); expenseOccurrences.clear(); sums.clear()
    }
    fun result(): LogicalSummary { require(closed && finalBoundary); return checkNotNull(summary) }
}
