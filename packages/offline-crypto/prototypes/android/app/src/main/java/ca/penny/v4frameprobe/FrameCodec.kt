package ca.penny.v4frameprobe

import java.io.Closeable
import java.io.IOException
import java.io.InputStream
import java.io.OutputStream
import java.util.concurrent.atomic.AtomicBoolean

/** Experimental FFI only. Handles are checked registry IDs, never native addresses. */
internal object NativeFrames {
    init { System.loadLibrary("penny_v4_frames") }
    @JvmStatic external fun initPush(root: ByteArray): Long
    @JvmStatic external fun initPull(root: ByteArray, header: ByteArray): Long
    @JvmStatic external fun header(handle: Long): ByteArray
    @JvmStatic external fun push(handle: Long, plain: ByteArray, length: Int, final: Boolean, ciphertext: ByteArray): Int
    /** Packed result: application tag in high 32 bits, admitted plaintext length in low 32. */
    @JvmStatic external fun pull(handle: Long, sequence: Long, declared: Long, ciphertext: ByteArray, plain: ByteArray): Long
    @JvmStatic external fun close(handle: Long): Boolean
    @JvmStatic external fun activeHandlesForTests(): Int
}

class FrameFailure(message: String) : IOException(message)
class FrameCancelled : IOException("Frame operation cancelled")

/** One-shot cancellation. Closing owned streams interrupts cooperative blocking IO. */
class FrameCancellation {
    private val cancelled = AtomicBoolean()
    private val lock = Any()
    private var used = false
    private var streams: Pair<Closeable, Closeable>? = null
    fun cancel() {
        cancelled.set(true)
        val current = synchronized(lock) { streams }
        current?.let { pair ->
            try { pair.first.close() } catch (_: Exception) { }
            try { pair.second.close() } catch (_: Exception) { }
        }
    }
    internal fun check() { if (cancelled.get()) throw FrameCancelled() }
    internal fun attach(input: Closeable, output: Closeable) = synchronized(lock) {
        check()
        check(!used) { "Cancellation belongs to one frame operation" }
        used = true; streams = input to output
    }
    internal fun detach() = synchronized(lock) { streams = null }
}

data class FrameStats(val frames: Long, val plaintextBytes: Long, val wireBytes: Long)

/**
 * Frame authentication only, NOT a complete backup/record validator or restore API.
 * Owns/closes both streams on return or failure. Authenticated early frames may be
 * written to output before a later failure: output must be an isolated candidate,
 * never a live vault or user-visible success. Returns only after FINAL + actual EOF.
 * Caller owns/wipes the supplied root. Native state and private buffers are wiped
 * best-effort; managed-runtime memory erasure is not guaranteed.
 */
object FrameCodec {
    const val CHUNK = 1_048_576
    const val OVERHEAD = 17
    const val MAX_PLAINTEXT = 671_088_640L
    const val MAX_WIRE = 805_306_368L
    const val MAX_FRAMES = 640L
    private const val HEADER = 70
    private const val IO_QUANTUM = 32 * 1024
    private val magic = byteArrayOf(80, 78, 89, 66, 75, 80, 52, 10)
    private fun need(ok: Boolean, why: String) { if (!ok) throw FrameFailure(why) }

    private inline fun <T> owned(input: InputStream, output: OutputStream, cancellation: FrameCancellation, work: () -> T): T {
        var attached = false
        try {
            val result = input.use { output.use {
                cancellation.attach(input, output); attached = true
                work()
            } }
            cancellation.check()
            return result
        } finally { if (attached) cancellation.detach() }
    }

    fun encrypt(root: ByteArray, input: InputStream, output: OutputStream, cancellation: FrameCancellation = FrameCancellation()): FrameStats =
        owned(input, output, cancellation) {
            need(root.size == 32, "Recovery root must be exactly 32 bytes")
            val plain = ByteArray(CHUNK)
            val ciphertext = ByteArray(CHUNK + OVERHEAD)
            val secret = root.copyOf()
            var handle = 0L
            try {
                cancellation.check()
                handle = NativeFrames.initPush(secret)
                secret.fill(0)
                val header = NativeFrames.header(handle)
                write(output, header, header.size, cancellation)
                val frameHeader = ByteArray(16)
                var sequence = 0L; var total = 0L; var wire = HEADER.toLong(); var pending = -1
                while (true) {
                    cancellation.check()
                    need(sequence < MAX_FRAMES, "Frame count exceeds profile A")
                    var count = 0
                    if (pending >= 0) { plain[0] = pending.toByte(); count = 1 }
                    var eof = false
                    while (count < CHUNK) {
                        val read = read(input, plain, count, minOf(IO_QUANTUM, CHUNK - count), cancellation)
                        if (read < 0) { eof = true; break }
                        count += read
                    }
                    need(count > 0, "Empty plaintext is not a v4 frame stream")
                    // One-byte lookahead permits a full-sized FINAL without empty trailing frames.
                    pending = if (eof) -1 else readOne(input, cancellation)
                    val final = pending < 0
                    total = Math.addExact(total, count.toLong())
                    need(total <= MAX_PLAINTEXT && (total < MAX_PLAINTEXT || final), "Plaintext capacity exceeded")
                    val encrypted = NativeFrames.push(handle, plain, count, final, ciphertext)
                    need(encrypted == count + OVERHEAD, "Unexpected native ciphertext length")
                    putU64(frameHeader, 0, sequence); putU64(frameHeader, 8, encrypted.toLong())
                    wire = Math.addExact(wire, 16L + encrypted)
                    need(wire <= MAX_WIRE, "Wire capacity exceeded")
                    write(output, frameHeader, 16, cancellation)
                    write(output, ciphertext, encrypted, cancellation)
                    sequence++
                    if (final) {
                        cancellation.check(); output.flush(); cancellation.check()
                        return@owned FrameStats(sequence, total, wire)
                    }
                }
                @Suppress("UNREACHABLE_CODE") error("Unreachable")
            } finally {
                if (handle != 0L) NativeFrames.close(handle)
                secret.fill(0); plain.fill(0); ciphertext.fill(0)
            }
        }

    fun decrypt(root: ByteArray, input: InputStream, output: OutputStream, cancellation: FrameCancellation = FrameCancellation()): FrameStats =
        owned(input, output, cancellation) {
            need(root.size == 32, "Recovery root must be exactly 32 bytes")
            val header = ByteArray(HEADER)
            readExactly(input, header, HEADER, cancellation)
            need(header.copyOfRange(0, 8).contentEquals(magic) && header[8] == 0.toByte() && header[9] == 4.toByte() &&
                header[10] == 0.toByte() && header[11] == 0x10.toByte() && header[12] == 0.toByte() && header[13] == 0.toByte(), "Unsupported binary frame header")
            val plain = ByteArray(CHUNK)
            val ciphertext = ByteArray(CHUNK + OVERHEAD)
            val secret = root.copyOf()
            var handle = 0L
            try {
                cancellation.check()
                handle = NativeFrames.initPull(secret, header)
                secret.fill(0)
                val frameHeader = ByteArray(16)
                var sequence = 0L; var total = 0L; var wire = HEADER.toLong()
                while (true) {
                    cancellation.check()
                    need(sequence < MAX_FRAMES, "Frame count exceeds profile A")
                    readExactly(input, frameHeader, 16, cancellation)
                    val declaredSequence = u64(frameHeader, 0)
                    val length = u64(frameHeader, 8)
                    need(declaredSequence == sequence, "Invalid frame sequence")
                    need(length in 18L..(CHUNK + OVERHEAD).toLong(), "Invalid declared frame length")
                    wire = Math.addExact(wire, Math.addExact(16L, length))
                    total = Math.addExact(total, length - OVERHEAD)
                    need(wire <= MAX_WIRE && total <= MAX_PLAINTEXT, "Frame capacity exceeded")
                    readExactly(input, ciphertext, length.toInt(), cancellation)
                    val result = NativeFrames.pull(handle, declaredSequence, length, ciphertext, plain)
                    val tag = (result ushr 32).toInt(); val count = (result and 0xffffffffL).toInt()
                    need(count.toLong() == length - OVERHEAD && tag in listOf(0, 3), "Unexpected native frame result")
                    need(tag == 3 || count == CHUNK, "MESSAGE must be a full chunk")
                    // Complete-frame authentication and tag validation happened before plaintext release.
                    write(output, plain, count, cancellation)
                    plain.fill(0); sequence++
                    if (tag == 3) {
                        need(readOne(input, cancellation) < 0, "Trailing bytes after FINAL")
                        cancellation.check(); output.flush(); cancellation.check()
                        return@owned FrameStats(sequence, total, wire)
                    }
                }
                @Suppress("UNREACHABLE_CODE") error("Unreachable")
            } finally {
                if (handle != 0L) NativeFrames.close(handle)
                secret.fill(0); plain.fill(0); ciphertext.fill(0)
            }
        }

    private fun readOne(input: InputStream, cancellation: FrameCancellation): Int {
        cancellation.check(); val result = input.read(); cancellation.check()
        need(result in -1..255, "Invalid InputStream result"); return result
    }
    private fun read(input: InputStream, bytes: ByteArray, offset: Int, count: Int, cancellation: FrameCancellation): Int {
        cancellation.check(); val result = input.read(bytes, offset, count); cancellation.check()
        need(result in -1..count, "Invalid InputStream result")
        if (result != 0) return result
        val one = readOne(input, cancellation)
        if (one < 0) return -1
        bytes[offset] = one.toByte(); return 1
    }
    private fun readExactly(input: InputStream, bytes: ByteArray, count: Int, cancellation: FrameCancellation) {
        var offset = 0
        while (offset < count) {
            val read = read(input, bytes, offset, minOf(IO_QUANTUM, count - offset), cancellation)
            need(read > 0, "Truncated frame stream or missing FINAL")
            offset += read
        }
    }
    private fun write(output: OutputStream, bytes: ByteArray, count: Int, cancellation: FrameCancellation) {
        var offset = 0
        while (offset < count) {
            cancellation.check(); val size = minOf(IO_QUANTUM, count - offset)
            output.write(bytes, offset, size); cancellation.check(); offset += size
        }
    }
    internal fun u64(bytes: ByteArray, offset: Int): Long {
        need(bytes[offset].toInt() and 0x80 == 0, "Unsigned integer exceeds signed64")
        var value = 0L
        for (i in offset until offset + 8) value = (value shl 8) or (bytes[i].toLong() and 255)
        return value
    }
    internal fun putU64(bytes: ByteArray, offset: Int, value: Long) {
        need(value >= 0, "Negative unsigned integer")
        for (i in 0..7) bytes[offset + i] = (value ushr (56 - 8 * i)).toByte()
    }
}
