package ca.penny.v4frameprobe

import android.os.Build
import android.system.Os
import android.system.OsConstants
import androidx.test.platform.app.InstrumentationRegistry
import java.io.*
import java.lang.reflect.InvocationTargetException
import java.security.MessageDigest
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import org.json.JSONArray
import org.json.JSONObject
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test

/** Separate application identity; no vault, account, network, or normal app access. */
class FrameCodecDeviceTest {
    private val instrumentation = InstrumentationRegistry.getInstrumentation()
    private val assets get() = instrumentation.context.assets
    private val root get() = ByteArray(32) { 7 } // PUBLIC fixture key, never user material.
    private val fixtures get() = assets.open("fixture-manifest.json").bufferedReader().use { JSONObject(it.readText()).getJSONArray("positives") }

    @Before fun noExistingState() { assertEquals(0, NativeFrames.activeHandlesForTests()) }
    @After fun noLeakedState() { assertEquals(0, NativeFrames.activeHandlesForTests()) }

    @Test fun readsAllIndependentPositiveFixturesWithBoundedIo() {
        val cases = fixtures
        assertEquals(4, cases.length())
        repeat(cases.length()) { index ->
            val case = cases.getJSONObject(index)
            verifyFixtureBytes(case)
            val source = TrackedInput(assets.open(case.getString("file")))
            val sink = DigestSink()
            val key = publicKey(case.getString("recoveryKey"))
            val stats = FrameCodec.decrypt(key, source, sink)
            assertEquals(case.getLong("plaintextBytes"), sink.count)
            assertEquals(case.getString("plaintextSha256"), sink.hash())
            assertEquals(FrameStats(case.getLong("frames"), sink.count, case.getLong("ciphertextBytes")), stats)
            assertTrue(source.closed && sink.closed)
            assertTrue(source.maxRequest <= 32768 && sink.maxRequest <= 32768)
            assertArrayEquals(root, key) // Caller ownership: codec wipes only its copies.
            assertEquals(0, NativeFrames.activeHandlesForTests())
        }
    }

    @Test fun readsExactSwiftNativeExportsOnAndroidRuntime() {
        val cases = assets.open("native-fixture-manifest.json").bufferedReader().use { JSONObject(it.readText()).getJSONArray("positives") }
        assertEquals(2, cases.length())
        repeat(cases.length()) { index ->
            val case = cases.getJSONObject(index)
            verifyFixtureBytes(case)
            val source = TrackedInput(assets.open(case.getString("file")))
            val sink = DigestSink(checkPattern = true)
            val stats = FrameCodec.decrypt(publicKey(case.getString("recoveryKey")), source, sink)
            assertEquals(FrameStats(case.getLong("frames"), case.getLong("plaintextBytes"), case.getLong("ciphertextBytes")), stats)
            assertEquals(case.getLong("plaintextBytes"), sink.count)
            assertEquals(case.getString("plaintextSha256"), sink.hash())
            assertTrue(source.closed && sink.closed)
        }
    }

    @Test fun rejectsAllIndependentNegativeFixturesWithoutSuccessOrHandleLeak() {
        val cases = assets.open("negative-manifest.json").bufferedReader().use { JSONObject(it.readText()).getJSONArray("cases") }
        assertEquals(28, cases.length())
        val acceptedPrefix = setOf("missing-final", "duplicated", "spliced", "trailing-data", "full-message-without-final")
        repeat(cases.length()) { index ->
            val case = cases.getJSONObject(index)
            verifyFixtureBytes(case)
            val source = TrackedInput(assets.open(case.getString("file")))
            val sink = DigestSink()
            rejected(case.getString("name")) { FrameCodec.decrypt(publicKey(case.getString("recoveryKey")), source, sink) }
            if (case.getString("name") !in acceptedPrefix) assertEquals(case.getString("name"), 0, sink.count)
            assertTrue(source.closed && sink.closed)
            assertTrue(source.maxRequest <= 32768 && sink.maxRequest <= 32768)
            assertEquals(case.getString("name"), 0, NativeFrames.activeHandlesForTests())
        }
    }

    @Test fun exportsFreshNativeFullFinalAndMultiFrameForIndependentReaders() {
        val directory = File(instrumentation.targetContext.filesDir, "native-frame-exports").apply { mkdirs() }
        val entries = JSONArray()
        for ((name, bytes) in listOf("native-full-final" to FrameCodec.CHUNK.toLong(), "native-multi" to 2L * FrameCodec.CHUNK + 37)) {
            val target = File(directory, "$name.pennyframe")
            val source = PatternInput(bytes)
            val stats = FrameCodec.encrypt(root, source, target.outputStream())
            val sink = DigestSink()
            assertEquals(stats, FrameCodec.decrypt(root, target.inputStream(), sink))
            assertTrue(source.closed)
            val expected = fixtures.let { cases -> (0 until cases.length()).map { cases.getJSONObject(it) }.single { it.getLong("plaintextBytes") == bytes } }
            assertEquals(expected.getString("plaintextSha256"), sink.hash())
            entries.put(JSONObject().put("name", name).put("file", target.name)
                .put("recoveryKey", "pny1-" + "07".repeat(32)).put("scope", "frame-only; not logical ledger admission")
                .put("plaintext", JSONObject().put("kind", "pattern-mod-251").put("bytes", bytes))
                .put("frames", stats.frames).put("plaintextBytes", bytes).put("plaintextSha256", expected.getString("plaintextSha256"))
                .put("ciphertextBytes", target.length()).put("ciphertextSha256", hashFile(target)))
        }
        File(directory, "native-manifest.json").writeText(JSONObject().put("schemaVersion", 1)
            .put("scope", "Experimental Kotlin/JNI frame-only public-key interoperability exports")
            .put("api", Build.VERSION.SDK_INT).put("abis", JSONArray(Build.SUPPORTED_ABIS.toList()))
            .put("pageBytes", Os.sysconf(OsConstants._SC_PAGESIZE)).put("positives", entries).toString(2) + "\n")
    }

    @Test fun writerUsesFreshRandomSaltAndHeaderAndHandlesChunkEdgesAndShortReads() {
        var previous: ByteArray? = null
        for (size in listOf(1L, 1L, FrameCodec.CHUNK - 1L, FrameCodec.CHUNK.toLong(), FrameCodec.CHUNK + 1L, 2L * FrameCodec.CHUNK)) {
            val source = PatternInput(size, shortReads = true)
            val encrypted = ByteArrayOutputStream()
            val stats = FrameCodec.encrypt(root, source, encrypted)
            val bytes = encrypted.toByteArray() // Tests only, at most two chunks; codec itself never materializes an archive.
            assertEquals((size + FrameCodec.CHUNK - 1) / FrameCodec.CHUNK, stats.frames)
            assertEquals(size, stats.plaintextBytes)
            assertEquals(70L + size + stats.frames * 33, stats.wireBytes)
            if (size == 1L) {
                previous?.let {
                    assertFalse(it.copyOfRange(14, 46).contentEquals(bytes.copyOfRange(14, 46)))
                    assertFalse(it.copyOfRange(46, 70).contentEquals(bytes.copyOfRange(46, 70)))
                }
                previous = bytes
            }
            val input = TrackedInput(ByteArrayInputStream(bytes), shortReads = true)
            val sink = DigestSink(checkPattern = true)
            assertEquals(stats, FrameCodec.decrypt(root, input, sink))
            assertEquals(size, sink.count)
            assertTrue(source.closed && input.closed && sink.closed)
            assertTrue(source.maxRequest <= 32768 && input.maxRequest <= 32768 && sink.maxRequest <= 32768)
        }
        val empty = PatternInput(0); val sink = DigestSink()
        rejected("empty input") { FrameCodec.encrypt(root, empty, sink) }
        assertTrue(empty.closed && sink.closed)
    }

    @Test fun rejectsUntrustedLengthsBeforeReadingCipherBody() {
        val header = assets.open("empty-ledger.pennyframe").use { it.readN(70) }
        for ((sequence, length) in listOf(640L to 18L, 0L to 17L, 0L to FrameCodec.CHUNK + 18L, 0L to Long.MAX_VALUE)) {
            val prefix = header + ByteArray(16).also { FrameCodec.putU64(it, 0, sequence); FrameCodec.putU64(it, 8, length) }
            val input = PrefixThenTrap(prefix)
            rejected("untrusted frame header") { FrameCodec.decrypt(root, input, DigestSink()) }
            assertFalse(input.readBeyondPrefix)
        }
        for (offset in listOf(70, 78)) {
            val prefix = header + ByteArray(16).also { FrameCodec.putU64(it, 8, 18) }
            prefix[offset] = 0x80.toByte()
            val input = PrefixThenTrap(prefix)
            rejected("u64 overflow") { FrameCodec.decrypt(root, input, DigestSink()) }
            assertFalse(input.readBeyondPrefix)
        }
    }

    @Test fun fullProfileCapacityStreamsThroughBoundedPipeAndRejectsOneExtraByte() {
        // No archive file or archive-sized array: two 1 MiB codec buffers per side,
        // native per-frame temporaries, and a 64 KiB pipe, independent of 640 MiB input.
        val pipe = PipedInputStream(65536)
        val producer = PipedOutputStream(pipe)
        val executor = Executors.newSingleThreadExecutor()
        val input = ZeroInput(FrameCodec.MAX_PLAINTEXT)
        val sink = DigestSink()
        try {
            val writing = executor.submit<FrameStats> { FrameCodec.encrypt(root, input, producer) }
            val read = FrameCodec.decrypt(root, pipe, sink)
            assertEquals(writing.get(30, TimeUnit.SECONDS), read)
            assertEquals(640, read.frames)
            assertEquals(FrameCodec.MAX_PLAINTEXT, read.plaintextBytes)
            assertEquals(70L + FrameCodec.MAX_PLAINTEXT + 640L * 33, read.wireBytes)
            assertEquals(FrameCodec.MAX_PLAINTEXT, sink.count)
            assertEquals("152c359a60cc8f22238a15018e40fef383829dac2472e80da6d35cbd5ff6c4e7", sink.hash())
            assertTrue(input.closed && sink.closed)
        } finally { pipe.close(); producer.close(); executor.shutdownNow() }
        val tooLarge = ZeroInput(FrameCodec.MAX_PLAINTEXT + 1)
        val discarded = DigestSink()
        rejected("640 MiB plus one") { FrameCodec.encrypt(root, tooLarge, discarded) }
        assertTrue(tooLarge.closed && discarded.closed)
        assertEquals(70L + 639L * (FrameCodec.CHUNK + 33), discarded.count)
    }

    @Test fun invalidClosedWrongKindNullAndOversizeJniInputsFailWithoutPlaintextRelease() {
        for (id in listOf(0L, -1L, Long.MAX_VALUE)) rejected("invalid handle") { NativeFrames.header(id) }
        val closed = NativeFrames.initPush(root)
        assertTrue(NativeFrames.close(closed)); assertFalse(NativeFrames.close(closed))
        rejected("closed handle") { NativeFrames.header(closed) }
        val fresh = NativeFrames.initPush(root)
        assertTrue(fresh > closed)
        val header = NativeFrames.header(fresh)
        val plain = ByteArray(64) { 99 }
        rejected("wrong kind") { NativeFrames.pull(fresh, 0, 18, ByteArray(18), plain) }
        assertTrue(plain.all { it == 99.toByte() })
        assertFalse(NativeFrames.close(fresh))
        val decoder = NativeFrames.initPull(root, header)
        rejected("wrong kind") { NativeFrames.header(decoder) }
        for (size in listOf(0, 31, 33)) rejected("root size") { NativeFrames.initPush(ByteArray(size)) }
        for (size in listOf(0, 69, 71)) rejected("header size") { NativeFrames.initPull(root, ByteArray(size)) }
        val nullRoot = NativeFrames::class.java.getDeclaredMethod("initPush", ByteArray::class.java)
        rejected("JNI null") {
            try { nullRoot.invoke(null, null) } catch (error: InvocationTargetException) { throw error.targetException }
        }
        for (length in listOf(-1, 0, FrameCodec.CHUNK + 1)) {
            val handle = NativeFrames.initPush(root)
            rejected("length") { NativeFrames.push(handle, ByteArray(1), length, true, ByteArray(18)) }
            assertFalse(NativeFrames.close(handle))
        }
        val handle = NativeFrames.initPush(root)
        rejected("oversize JNI array") { NativeFrames.push(handle, ByteArray(FrameCodec.CHUNK + 1), 1, true, ByteArray(18)) }
        val full = NativeFrames.initPush(root)
        val encrypted = ByteArray(18)
        assertEquals(18, NativeFrames.push(full, byteArrayOf(1), 1, true, encrypted))
        rejected("use after FINAL") { NativeFrames.push(full, byteArrayOf(1), 1, true, encrypted) }
        val corrupt = NativeFrames.initPull(root, header)
        rejected("authentication") { NativeFrames.pull(corrupt, 0, 18, ByteArray(18), plain) }
        assertTrue(plain.all { it == 99.toByte() })
    }

    @Test fun nativeHandleLimitAndCrossThreadLifetimeAreSafe() {
        val handles = mutableListOf<Long>()
        try {
            repeat(64) { handles += NativeFrames.initPush(root) }
            rejected("handle limit") { NativeFrames.initPush(root) }
            assertEquals(64, NativeFrames.activeHandlesForTests())
        } finally { handles.forEach { NativeFrames.close(it) } }
        val executor = Executors.newSingleThreadExecutor()
        try {
            val handle = NativeFrames.initPush(root)
            assertTrue(executor.submit<Boolean> { rejected("thread confined") { NativeFrames.header(handle) }; true }.get(5, TimeUnit.SECONDS))
            assertFalse(NativeFrames.close(handle))
            // Close may race a use, but registry lookup/use/erase is serialized and IDs never become pointers.
            repeat(12) {
                val allocated = CountDownLatch(1); val start = CountDownLatch(1)
                var id = 0L
                val result = executor.submit<Boolean> {
                    id = NativeFrames.initPush(root); allocated.countDown(); check(start.await(5, TimeUnit.SECONDS))
                    try { NativeFrames.push(id, ByteArray(FrameCodec.CHUNK), FrameCodec.CHUNK, true, ByteArray(FrameCodec.CHUNK + 17)); true }
                    catch (_: IllegalStateException) { false }
                    finally { NativeFrames.close(id) }
                }
                assertTrue(allocated.await(5, TimeUnit.SECONDS)); start.countDown(); NativeFrames.close(id)
                result.get(5, TimeUnit.SECONDS)
                assertEquals(0, NativeFrames.activeHandlesForTests())
            }
        } finally { executor.shutdownNow() }
    }

    @Test fun ioReadWriteFlushAndCloseFailuresNeverReturnSuccess() {
        val good = assets.open("empty-ledger.pennyframe").use { it.readBytes() }
        for (mode in listOf("read", "write", "flush", "input-close", "output-close")) {
            val input = object : TrackedInput(ByteArrayInputStream(good)) {
                override fun read(b: ByteArray, off: Int, len: Int): Int {
                    if (mode == "read" && count >= 70) throw IOException("injected read")
                    return super.read(b, off, len)
                }
                override fun close() { super.close(); if (mode == "input-close") throw IOException("injected input close") }
            }
            val output = object : DigestSink() {
                override fun write(b: ByteArray, off: Int, len: Int) { if (mode == "write") throw IOException("injected write"); super.write(b, off, len) }
                override fun flush() { if (mode == "flush") throw IOException("injected flush") }
                override fun close() { super.close(); if (mode == "output-close") throw IOException("injected output close") }
            }
            rejected(mode) { FrameCodec.decrypt(root, input, output) }
            assertTrue(input.closed && output.closed)
        }
        for (encrypt in listOf(true, false)) {
            val input = TrackedInput(if (encrypt) PatternInput(37) else ByteArrayInputStream(good))
            val output = object : DigestSink() { override fun write(b: ByteArray, off: Int, len: Int) { throw IOException("injected output") } }
            rejected("output failure") { if (encrypt) FrameCodec.encrypt(root, input, output) else FrameCodec.decrypt(root, input, output) }
            assertTrue(input.closed && output.closed)
        }
    }

    @Test fun cancellationBeforeStartAndDuringBlockingInputClosesBothStreams() {
        val cancellation = FrameCancellation().also { it.cancel() }
        val input = PatternInput(37); val output = DigestSink()
        rejected("already cancelled") { FrameCodec.encrypt(root, input, output, cancellation) }
        assertTrue(input.closed && output.closed)
        val blocking = BlockingInput()
        val sink = DigestSink()
        cancelBlocking(blocking.entered, FrameCancellation(), { blocking.closed && sink.closed }) { token ->
            FrameCodec.encrypt(root, blocking, sink, token)
        }
    }

    @Test fun cancellationDuringOutputAndFinalEofDoesNotAdmitSuccess() {
        val good = assets.open("empty-ledger.pennyframe").use { it.readBytes() }
        for (blockAt in listOf("write", "flush")) {
            val input = TrackedInput(ByteArrayInputStream(good))
            val output = BlockingOutput(blockAt)
            cancelBlocking(output.entered, FrameCancellation(), { input.closed && output.closed }) { token ->
                FrameCodec.decrypt(root, input, output, token)
            }
        }
        val tail = BlockingInput()
        val input = TrackedInput(SequenceInputStream(ByteArrayInputStream(good), tail))
        val output = DigestSink()
        cancelBlocking(tail.entered, FrameCancellation(), { input.closed && output.closed }) { token ->
            FrameCodec.decrypt(root, input, output, token)
        }
        assertEquals(716, output.count) // Authenticated prefix exists; FINAL/EOF cancellation still forbids success.
        val reusable = FrameCancellation()
        FrameCodec.encrypt(root, PatternInput(1), DigestSink(), reusable)
        val second = PatternInput(1); val sink = DigestSink()
        rejected("one-shot cancellation") { FrameCodec.encrypt(root, second, sink, reusable) }
        assertTrue(second.closed && sink.closed)
    }

    private fun cancelBlocking(entered: CountDownLatch, token: FrameCancellation, closed: () -> Boolean, operation: (FrameCancellation) -> Unit) {
        val executor = Executors.newSingleThreadExecutor()
        try {
            val result = executor.submit<Throwable?> { try { operation(token); null } catch (failure: Throwable) { failure } }
            assertTrue("operation reached blocking IO", entered.await(5, TimeUnit.SECONDS))
            token.cancel()
            val failure = result.get(5, TimeUnit.SECONDS)
            assertTrue("cancelled operation must fail", failure is IOException)
            assertTrue(closed())
            assertEquals(0, NativeFrames.activeHandlesForTests())
        } finally { token.cancel(); executor.shutdownNow() }
    }

    private fun verifyFixtureBytes(case: JSONObject) {
        val sink = DigestSink()
        assets.open(case.getString("file")).use { it.copyTo(sink, 32768) }
        assertEquals(case.getString("file"), case.getLong("ciphertextBytes"), sink.count)
        assertEquals(case.getString("ciphertextSha256"), sink.hash())
    }
    private fun publicKey(text: String): ByteArray {
        require(text.matches(Regex("pny1-[0-9a-f]{64}")))
        return ByteArray(32) { text.substring(5 + it * 2, 7 + it * 2).toInt(16).toByte() }
    }
    private fun rejected(label: String, block: () -> Unit) {
        try { block() } catch (failure: Throwable) {
            if (failure is IOException || failure is IllegalStateException) return
            throw AssertionError("$label failed with an unexpected throwable", failure)
        }
        fail("$label unexpectedly returned success")
    }
    private fun hashFile(file: File): String = DigestSink().also { sink -> file.inputStream().use { it.copyTo(sink, 32768) } }.hash()
}

private fun ByteArray.hex() = joinToString("") { "%02x".format(it.toInt() and 255) }
private fun InputStream.readN(count: Int): ByteArray = ByteArray(count).also { result ->
    var offset = 0
    while (offset < count) { val size = read(result, offset, count - offset); check(size > 0); offset += size }
}

private open class TrackedInput(private val delegate: InputStream, private val shortReads: Boolean = false) : InputStream() {
    @Volatile var closed = false
    var count = 0L
    var maxRequest = 0
    private var calls = 0
    override fun read(): Int = delegate.read().also { if (it >= 0) count++ }
    override fun read(b: ByteArray, off: Int, len: Int): Int {
        maxRequest = maxOf(maxRequest, len)
        if (shortReads && calls++ % 7 == 0) return 0
        return delegate.read(b, off, if (shortReads) minOf(4093, len) else len).also { if (it > 0) count += it }
    }
    override fun close() { closed = true; delegate.close() }
}

private class PatternInput(private val size: Long, private val shortReads: Boolean = false) : InputStream() {
    var position = 0L
    var closed = false
    var maxRequest = 0
    private var calls = 0
    override fun read(): Int = if (position >= size) -1 else ((position++ % 251).toInt())
    override fun read(b: ByteArray, off: Int, len: Int): Int {
        maxRequest = maxOf(maxRequest, len)
        if (shortReads && calls++ % 7 == 0) return 0
        if (position >= size) return -1
        val count = minOf(size - position, len.toLong(), if (shortReads) 4093 else 32768).toInt()
        repeat(count) { b[off + it] = (position++ % 251).toByte() }
        return count
    }
    override fun close() { closed = true }
}

private class ZeroInput(private val size: Long) : InputStream() {
    private var position = 0L
    var closed = false
    override fun read(): Int = if (position >= size) -1 else { position++; 0 }
    override fun read(b: ByteArray, off: Int, len: Int): Int {
        if (position >= size) return -1
        val count = minOf(size - position, len.toLong()).toInt()
        b.fill(0, off, off + count); position += count; return count
    }
    override fun close() { closed = true }
}

private open class DigestSink(private val checkPattern: Boolean = false) : OutputStream() {
    private val digest = MessageDigest.getInstance("SHA-256")
    var count = 0L
    var maxRequest = 0
    @Volatile var closed = false
    override fun write(value: Int) { write(byteArrayOf(value.toByte()), 0, 1) }
    override fun write(b: ByteArray, off: Int, len: Int) {
        maxRequest = maxOf(maxRequest, len)
        if (checkPattern) repeat(len) { check((b[off + it].toInt() and 255) == ((count + it) % 251).toInt()) }
        digest.update(b, off, len); count += len
    }
    fun hash(): String = digest.digest().hex()
    override fun close() { closed = true }
}

private class PrefixThenTrap(private val prefix: ByteArray) : InputStream() {
    private var offset = 0
    var readBeyondPrefix = false
    override fun read(): Int {
        if (offset == prefix.size) { readBeyondPrefix = true; throw IOException("must reject before body") }
        return prefix[offset++].toInt() and 255
    }
    override fun read(b: ByteArray, off: Int, len: Int): Int {
        if (offset == prefix.size) return read()
        val count = minOf(len, prefix.size - offset)
        prefix.copyInto(b, off, offset, offset + count); offset += count; return count
    }
}

private class BlockingInput : InputStream() {
    val entered = CountDownLatch(1)
    private val released = CountDownLatch(1)
    @Volatile var closed = false
    override fun read(): Int {
        entered.countDown(); check(released.await(10, TimeUnit.SECONDS)); throw IOException("closed blocking input")
    }
    override fun close() { closed = true; released.countDown() }
}

private class BlockingOutput(private val blockAt: String) : OutputStream() {
    val entered = CountDownLatch(1)
    private val released = CountDownLatch(1)
    @Volatile var closed = false
    private fun block() { entered.countDown(); check(released.await(10, TimeUnit.SECONDS)); throw IOException("closed blocking output") }
    override fun write(value: Int) { if (blockAt == "write") block() }
    override fun write(b: ByteArray, off: Int, len: Int) { if (blockAt == "write") block() }
    override fun flush() { if (blockAt == "flush") block() }
    override fun close() { closed = true; released.countDown() }
}
