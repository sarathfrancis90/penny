package ca.penny.v4frameprobe

import androidx.test.platform.app.InstrumentationRegistry
import java.io.*
import java.security.MessageDigest
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.After
import org.junit.Test

class LogicalCodecDeviceTest {
    private val assets get() = InstrumentationRegistry.getInstrumentation().context.assets
    private val root get() = ByteArray(32) { 7 }
    @After fun noHandles() { assertEquals(0, NativeFrames.activeHandlesForTests()) }

    @Test fun exactNumericTokensAvoidRoundedFractionsUnderflowAndExponentAllocation() {
        for ((token, expected) in listOf("1.0" to 1L, "1e0" to 1L, "-0" to 0L,
            "0e99999999999999999999" to 0L, "0e-99999999999999999999" to 0L)) {
            val value = LogicalParser.exactJson("{\"n\":$token}".toByteArray())
            assertEquals(expected, ca.penny.offline.Wire.integer(value, "n"))
        }
        for (token in listOf("1.0000000000000001", "1e-10000", "1e99999999999999999999")) {
            rejected(token) { LogicalParser.exactJson("{\"n\":$token}".toByteArray()) }
        }
    }

    @Test fun authenticatedLedgerLayoutsUseRealNativeReceiptDecoder() {
        for (name in listOf("empty-ledger", "one-receipt")) {
            val sink = ProbeSink(mutateRecord = true)
            val summary = LogicalCodec.decode(root, assets.open("$name.pennyframe"), sink)
            assertTrue(sink.begun && sink.finished && sink.closed && !sink.discarded)
            assertEquals(sink.createdAt, summary.createdAt)
            assertTrue(summary.policyMetadataBytes > summary.nonReceiptBytes)
            assertEquals(if (name == "empty-ledger") 0L else 1L, summary.counts.getValue("attachments"))
            assertEquals(summary.counts.getValue("attachments"), sink.receipts.toLong())
            assertTrue(sink.borrowed?.all { it == 0.toByte() } ?: true)
        }
    }

    @Test fun frameEofAuthenticationAndSinkFailuresDiscardBeforeReturningSuccess() {
        val original = assets.open("one-receipt.pennyframe").use { it.readBytes() }
        for (bytes in listOf(original + byteArrayOf(0), original.copyOf(original.size - 1), original.copyOf().also { it[it.lastIndex] = (it.last().toInt() xor 1).toByte() })) {
            val sink = ProbeSink()
            rejected { LogicalCodec.decode(root, ByteArrayInputStream(bytes), sink) }
            assertTrue(sink.discarded && sink.closed && !sink.finished)
        }
        for (phase in listOf("begin", "record", "receipt", "finish", "close")) {
            val sink = ProbeSink(failAt = phase)
            rejected { LogicalCodec.decode(root, ByteArrayInputStream(original), sink) }
            assertTrue(sink.discarded && sink.closed)
            assertTrue(sink.borrowed?.all { it == 0.toByte() } ?: true)
        }
        val token = FrameCancellation()
        val sink = ProbeSink(cancel = token)
        rejected { LogicalCodec.decode(root, ByteArrayInputStream(original), sink, token) }
        assertTrue(sink.discarded && sink.closed && !sink.finished)
        val prior = FrameCancellation().also { it.cancel() }
        val unused = ProbeSink()
        rejected { LogicalCodec.decode(root, ByteArrayInputStream(original), unused, prior) }
        assertTrue(unused.discarded && unused.closed && !unused.begun)
        val discardFailure = ProbeSink(failAt = "discard")
        try {
            LogicalCodec.decode(root, ByteArrayInputStream(original.copyOf(original.size - 1)), discardFailure)
            fail("must fail")
        } catch (error: Exception) { assertTrue(error.suppressed.isNotEmpty()) }
        assertTrue(discardFailure.discarded && discardFailure.closed && !discardFailure.finished)
    }

    @Test fun sharedLogicalFixturesEnforceGrammarSemanticsAndFrameBoundaries() {
        val manifest = assets.open("logical/fixture-manifest.json").bufferedReader().use { JSONObject(it.readText()) }
        for (group in listOf("positives", "negatives")) {
            val cases = manifest.getJSONArray(group)
            assertTrue(cases.length() > 0)
            repeat(cases.length()) { index ->
                val case = cases.getJSONObject(index)
                val bytes = assets.open("logical/" + case.getString("file")).use { it.readBytes() }
                require(bytes.size <= 8 * FrameCodec.CHUNK) // Bound fixture-only materialization.
                assertEquals(case.getLong("plaintextBytes"), bytes.size.toLong())
                assertEquals(case.getString("plaintextSha256"), sha(bytes))
                val framed = seal(case, bytes)
                val sink = ProbeSink()
                if (group == "positives") {
                    val result = LogicalCodec.decode(root, Fragmented(ByteArrayInputStream(framed)), sink)
                    assertTrue(case.getString("name"), sink.finished && sink.closed && !sink.discarded)
                    assertTrue(result.recordCount >= 1)
                } else {
                    rejected(case.getString("name")) { LogicalCodec.decode(root, Fragmented(ByteArrayInputStream(framed)), sink) }
                    assertTrue(case.getString("name"), sink.discarded && sink.closed && !sink.finished)
                }
                assertEquals(case.getString("name"), 0, NativeFrames.activeHandlesForTests())
            }
        }
    }

    private fun seal(case: JSONObject, bytes: ByteArray): ByteArray {
        val sizes = case.getJSONArray("frameSizes")
        require((0 until sizes.length()).sumOf { sizes.getInt(it) } == bytes.size)
        val handle = NativeFrames.initPush(root)
        val output = ByteArrayOutputStream()
        try {
            output.write(NativeFrames.header(handle))
            var offset = 0
            repeat(sizes.length()) { index ->
                val count = sizes.getInt(index)
                require(count in 1..FrameCodec.CHUNK)
                val plain = bytes.copyOfRange(offset, offset + count)
                val ciphertext = ByteArray(count + 17)
                val actual = NativeFrames.push(handle, plain, count, index == sizes.length() - 1 && case.optBoolean("finalFrame", true), ciphertext)
                val header = ByteArray(16)
                FrameCodec.putU64(header, 0, index.toLong()); FrameCodec.putU64(header, 8, actual.toLong())
                output.write(header); output.write(ciphertext)
                plain.fill(0); offset += count
            }
        } finally { NativeFrames.close(handle) }
        return output.toByteArray()
    }
    private fun sha(bytes: ByteArray) = MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02x".format(it.toInt() and 255) }
    private fun rejected(label: String = "operation", work: () -> Unit) {
        try { work() } catch (failure: Exception) { return }
        fail("$label unexpectedly succeeded")
    }
}

private class ProbeSink(private val failAt: String? = null, private val cancel: FrameCancellation? = null, private val mutateRecord: Boolean = false) : LogicalValidationSink {
    var begun = false; var finished = false; var closed = false; var discarded = false; var receipts = 0
    var borrowed: ByteArray? = null
    var createdAt = ""
    private fun fault(phase: String) { if (phase == failAt) throw IOException("injected sink $phase failure") }
    override fun begin(snapshotId: String, vaultId: String, createdAt: String) { fault("begin"); begun = true; this.createdAt = createdAt }
    override fun record(kind: Int, value: JSONObject) { fault("record"); if (mutateRecord) value.put("id", "mutated after validation") }
    override fun receipt(descriptor: ReceiptDescriptor, bytes: ByteArray) { borrowed = bytes; fault("receipt"); receipts++; cancel?.cancel() }
    override fun finishUncommitted(summary: LogicalSummary) {
        fault("finish")
        if (mutateRecord) {
            try { (summary.counts as MutableMap<String, Long>)["expenses"] = 999; error("Mutable summary") }
            catch (_: UnsupportedOperationException) { }
        }
        finished = true
    }
    override fun discard() { discarded = true; finished = false; borrowed?.fill(0); fault("discard") }
    override fun close() { closed = true; fault("close") }
}
private class Fragmented(private val input: InputStream) : InputStream() {
    override fun read() = input.read()
    override fun read(b: ByteArray, off: Int, len: Int) = input.read(b, off, minOf(len, 7))
    override fun close() = input.close()
}
