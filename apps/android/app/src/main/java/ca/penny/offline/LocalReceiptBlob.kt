package ca.penny.offline

import android.content.Context
import android.os.ParcelFileDescriptor
import android.os.Process
import android.system.ErrnoException
import android.system.Os
import android.system.OsConstants
import android.system.StructStat
import java.io.Closeable
import java.io.File
import java.io.FileDescriptor
import java.nio.ByteBuffer
import java.security.MessageDigest
import java.security.SecureRandom
import java.util.concurrent.atomic.AtomicBoolean
import javax.crypto.Cipher
import javax.crypto.Mac
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec

/** Detached-file foundation only: no live vault, migration or activation call sites. */
internal object LocalReceiptBlob {
    const val ROOT_NAME = "detached-receipt-staging-v1"
    data class Descriptor(val vaultId: String, val generationId: String, val id: String, val expenseId: String,
                          val mediaType: String, val byteCount: Long, val sha256: String) {
        init {
            listOf(vaultId, generationId, id, expenseId).forEach(Wire::requireId)
            require(mediaType in listOf("image/png", "image/jpeg"))
            require(byteCount in 1..Attachment.maxBytes.toLong())
            require(Regex("[0-9a-f]{64}").matches(sha256))
        }
    }
    class Cancellation {
        private val cancelled = AtomicBoolean()
        fun cancel() { cancelled.set(true) }
        internal fun check() { check(!cancelled.get()) { "Receipt operation cancelled" } }
    }
    enum class Point { DIRECTORY_OPEN, CREATE, WRITE, SYNC, CLOSE, REOPEN, DIRECTORY_SYNC }
    /** Internal fault seam observes only internally selected paths, never plaintext/keys. */
    fun interface Faults { fun hit(point: Point, file: File) }
    class Handle internal constructor(val descriptor: Descriptor)

    class Operation(context: Context, rootKey: ByteArray, val vaultId: String,
                    private val cancellation: Cancellation = Cancellation(), faults: Faults = Faults { _, _ -> },
                    val generationId: String = Wire.id()) : Closeable {
        private var open = true
        private val core: Core
        init {
            Wire.requireId(vaultId); Wire.requireId(generationId); require(rootKey.size == 32); cancellation.check()
            core = Core(context, generationId, Codec.key(rootKey, vaultId, generationId), cancellation, faults)
        }
        @Synchronized fun seal(descriptor: Descriptor, bytes: ByteArray): Handle = work {
            require(descriptor.vaultId == vaultId && descriptor.generationId == generationId)
            core.seal(descriptor, bytes)
        }
        @Synchronized fun complete(): ReceiptGeneration = work {
            core.verifyAll(); cancellation.check()
            val generation = ReceiptGeneration(core)
            open = false // Ownership transfers exactly once; operation.close cannot remove it.
            generation
        }
        @Synchronized fun discard() { check(open) { "Receipt operation is closed" }; open = false; core.close() }
        @Synchronized override fun close() { if (open) { open = false; core.close() } }
        private fun <T> work(action: () -> T): T {
            check(open) { "Receipt operation is closed" }
            try { cancellation.check(); return action() }
            catch (failure: Throwable) {
                open = false
                try { core.close() } catch (cleanup: Throwable) { failure.addSuppressed(cleanup) }
                throw failure
            }
        }
    }
    /** Unactivated owned files. Closing discards them; there is no live-install API. */
    class ReceiptGeneration internal constructor(private val core: Core, private val durable: Boolean = false) : Closeable {
        private var open = true
        val handles: List<Handle> = java.util.Collections.unmodifiableList(core.handles())
        @Synchronized fun read(handle: Handle): ByteArray {
            check(open)
            try { return core.read(handle) } catch (failure: Throwable) {
                open = false
                try { if (durable) core.release() else core.close() } catch (cleanup: Throwable) { failure.addSuppressed(cleanup) }
                throw failure
            }
        }
        /** Database ownership transfer or read lease release: ciphertext stays durable. */
        @Synchronized internal fun release() { if (open) { open = false; core.release() } }
        @Synchronized internal fun discard() { if (open) { open = false; core.close() } }
        @Synchronized override fun close() { if (open) { open = false; if (durable) core.release() else core.close() } }
    }
    internal fun reopen(context: Context, root: ByteArray, vault: String, generation: String, descriptors: List<Descriptor>): ReceiptGeneration {
        require(descriptors.size <= 100 && descriptors.sumOf { it.byteCount } <= Attachment.maxTotalBytes)
        require(descriptors.all { it.vaultId == vault && it.generationId == generation })
        require(descriptors.map { it.id }.toSet().size == descriptors.size)
        return ReceiptGeneration(Core(context, generation, Codec.key(root, vault, generation), Cancellation(), Faults { _, _ -> }, descriptors), true)
    }

    /** Bytes are borrowed only during the callback. The caller must keep its
     * result uncommitted until this entire inventory/close operation succeeds. */
    internal fun consumeReopened(context: Context, root: ByteArray, vault: String, generation: String,
        descriptors: List<Descriptor>, cancellation: Cancellation = Cancellation(), faults: Faults = Faults { _, _ -> },
        consume: (Descriptor, ByteArray) -> Unit) {
        require(descriptors.size <= 100 && descriptors.sumOf { it.byteCount } <= Attachment.maxTotalBytes)
        require(descriptors.all { it.vaultId == vault && it.generationId == generation })
        require(descriptors.map { it.id }.toSet().size == descriptors.size)
        Core(context, generation, Codec.key(root, vault, generation), cancellation, faults, descriptors, consume).release()
    }

    internal object Codec {
        private val magic = "PNYRCP01".toByteArray(Charsets.US_ASCII)
        private val keyDomain = "PENNY-OFFLINE-LOCAL-RECEIPT-KEY:1\u0000".toByteArray(Charsets.US_ASCII)
        private val aadDomain = "PENNY-OFFLINE-LOCAL-RECEIPT:1\u0000".toByteArray(Charsets.US_ASCII)
        private fun hex(text: String) = text.chunked(2).map { it.toInt(16).toByte() }.toByteArray()
        private fun uuid(text: String): ByteArray { Wire.requireId(text); return hex(text.replace("-", "")) }
        fun key(root: ByteArray, vault: String, generation: String): ByteArray {
            require(root.size == 32)
            return Mac.getInstance("HmacSHA256").apply { init(SecretKeySpec(root, "HmacSHA256")) }
                .doFinal(keyDomain + uuid(vault) + uuid(generation))
        }
        fun aad(d: Descriptor): ByteArray = aadDomain + magic + uuid(d.vaultId) + uuid(d.generationId) + uuid(d.id) + uuid(d.expenseId) +
            byteArrayOf(if (d.mediaType == "image/png") 1 else 2) + ByteBuffer.allocate(8).putLong(d.byteCount).array() + hex(d.sha256)
        fun validate(d: Descriptor, plain: ByteArray) {
            require(plain.size.toLong() == d.byteCount)
            require(MessageDigest.isEqual(MessageDigest.getInstance("SHA-256").digest(plain), hex(d.sha256))) { "Receipt digest mismatch" }
            require(Attachment.mediaType(plain) == d.mediaType)
            ReceiptImage.decode(plain).recycle()
        }
        fun seal(key: ByteArray, d: Descriptor, plain: ByteArray): ByteArray {
            require(key.size == 32); validate(d, plain)
            val nonce = ByteArray(12).also { SecureRandom().nextBytes(it) }
            val cipher = Cipher.getInstance("AES/GCM/NoPadding")
            cipher.init(Cipher.ENCRYPT_MODE, SecretKeySpec(key, "AES"), GCMParameterSpec(128, nonce)); cipher.updateAAD(aad(d))
            return magic + nonce + cipher.doFinal(plain)
        }
        fun open(key: ByteArray, d: Descriptor, sealed: ByteArray): ByteArray {
            require(key.size == 32 && sealed.size.toLong() == d.byteCount + 36)
            require(sealed.copyOfRange(0, 8).contentEquals(magic)) { "Unsupported local receipt version" }
            val cipher = Cipher.getInstance("AES/GCM/NoPadding")
            cipher.init(Cipher.DECRYPT_MODE, SecretKeySpec(key, "AES"), GCMParameterSpec(128, sealed, 8, 12)); cipher.updateAAD(aad(d))
            val plain = cipher.doFinal(sealed, 20, sealed.size - 20)
            try { validate(d, plain); return plain } catch (failure: Throwable) { plain.fill(0); throw failure }
        }
    }

    private data class Identity(val device: Long, val inode: Long) {
        companion object { fun of(stat: StructStat) = Identity(stat.st_dev, stat.st_ino) }
    }
    internal class Core(context: Context, private val operationName: String, private val key: ByteArray, private val cancellation: Cancellation, private val faults: Faults, existing: List<Descriptor>? = null, onVerified: ((Descriptor, ByteArray) -> Unit)? = null) : Closeable {
        // A read-only descriptor pins each inode until cleanup. Without a pin,
        // unlink/recreate can reuse st_ino and trick ownership-based deletion.
        private data class Entry(val handle: Handle, val name: String, val identity: Identity, val pin: FileDescriptor)
        private val entries = mutableListOf<Entry>()
        private var total = 0L
        private var closed = false
        private var parent: ParcelFileDescriptor? = null
        private var directory: ParcelFileDescriptor? = null
        private var directoryIdentity: Identity? = null
        init {
            try {
                Wire.requireId(operationName)
                val root = File(context.noBackupFilesDir, ROOT_NAME)
                // Root is a fixed private namespace; existing unrelated contents are never removed.
                try { Os.mkdir(root.path, 448) } catch (error: ErrnoException) { if (error.errno != OsConstants.EEXIST) throw error }
                parent = openDirectory(root.path)
                val selected = parentPath() + "/" + operationName
                if (existing == null) Os.mkdir(selected, 448) // Exclusive internally selected generation.
                directoryIdentity = Identity.of(Os.lstat(selected))
                faults.hit(Point.DIRECTORY_OPEN, File(selected)); cancellation.check()
                directory = openDirectory(selected)
                check(directoryIdentity == Identity.of(Os.fstat(checkNotNull(directory).fileDescriptor)))
                existing?.forEach { d ->
                    val name = d.id + ".pennyreceipt"
                    val pin = openFile(path(name), OsConstants.O_RDONLY or OsConstants.O_NOFOLLOW, 0)
                    try { entries += Entry(Handle(d), name, Identity.of(Os.fstat(pin)), pin) }
                    catch (failure: Throwable) { try { Os.close(pin) } catch (cleanup: Throwable) { failure.addSuppressed(cleanup) }; throw failure }
                }
                if (existing != null) verifyAll(onVerified)
            } catch (failure: Throwable) {
                key.fill(0)
                entries.forEach { try { Os.close(it.pin) } catch (cleanup: Throwable) { failure.addSuppressed(cleanup) } }; entries.clear()
                if (existing == null && parent != null && directoryIdentity != null) try {
                    val selected = parentPath() + "/" + operationName
                    val stat = Os.lstat(selected)
                    if (OsConstants.S_ISDIR(stat.st_mode) && Identity.of(stat) == directoryIdentity) Os.remove(selected)
                } catch (cleanup: Throwable) { failure.addSuppressed(cleanup) }
                try { directory?.close() } catch (cleanup: Throwable) { failure.addSuppressed(cleanup) }
                try { parent?.close() } catch (cleanup: Throwable) { failure.addSuppressed(cleanup) }
                throw failure
            }
        }
        private fun parentPath() = "/proc/self/fd/" + checkNotNull(parent).fd
        private fun path(name: String) = "/proc/self/fd/" + checkNotNull(directory).fd + "/" + name
        private fun ownedDirectory() {
            check(!closed)
            val current = Os.lstat(parentPath() + "/" + operationName)
            check(OsConstants.S_ISDIR(current.st_mode) && current.st_uid == Process.myUid() && current.st_mode and 63 == 0 && Identity.of(current) == directoryIdentity) { "Receipt directory ownership changed" }
            val root = Os.fstat(checkNotNull(parent).fileDescriptor)
            check(OsConstants.S_ISDIR(root.st_mode) && root.st_uid == Process.myUid() && root.st_mode and 63 == 0)
        }
        private fun hit(point: Point, name: String = ".") {
            cancellation.check(); faults.hit(point, File(path(name))); cancellation.check(); ownedDirectory()
        }
        fun handles() = entries.map { it.handle }
        fun seal(d: Descriptor, callerBytes: ByteArray): Handle {
            ownedDirectory()
            require(entries.size < 100 && entries.none { it.handle.descriptor.id == d.id }) { "Receipt count or duplicate ID" }
            require(callerBytes.size.toLong() == d.byteCount && Math.addExact(total, d.byteCount) <= Attachment.maxTotalBytes) { "Receipt group exceeds 8 MiB" }
            val plain = callerBytes.copyOf()
            try {
                cancellation.check()
                val sealed = Codec.seal(key, d, plain)
                try {
                    val name = d.id + ".pennyreceipt"
                    hit(Point.CREATE, name)
                    val fd = openFile(path(name), OsConstants.O_WRONLY or OsConstants.O_CREAT or OsConstants.O_EXCL or OsConstants.O_NOFOLLOW, 384)
                    val handle = Handle(d)
                    var registered = false
                    try {
                        val stat = Os.fstat(fd)
                        check(OsConstants.S_ISREG(stat.st_mode) && stat.st_uid == Process.myUid() && stat.st_nlink == 1L && stat.st_mode and 63 == 0)
                        val pin = openFile(path(name), OsConstants.O_RDONLY or OsConstants.O_NOFOLLOW, 0)
                        try {
                            check(Identity.of(Os.fstat(pin)) == Identity.of(stat))
                            entries += Entry(handle, name, Identity.of(stat), pin); registered = true
                        } catch (failure: Throwable) { Os.close(pin); throw failure }
                        var offset = 0
                        while (offset < sealed.size) {
                            hit(Point.WRITE, name)
                            val count = Os.write(fd, sealed, offset, minOf(32768, sealed.size - offset))
                            check(count > 0); offset += count
                        }
                        hit(Point.SYNC, name); Os.fsync(fd)
                    } catch (failure: Throwable) {
                        if (!registered) try {
                            val current = Os.lstat(path(name))
                            // Original creation FD is still open, so this inode cannot be reused.
                            if (OsConstants.S_ISREG(current.st_mode) && Identity.of(current) == Identity.of(Os.fstat(fd))) Os.remove(path(name))
                        } catch (cleanup: Throwable) { failure.addSuppressed(cleanup) }
                        throw failure
                    } finally { Os.close(fd) }
                    hit(Point.CLOSE, name) // Fault after the real close: no leaked descriptor on injected close failure.
                    read(handle).fill(0)
                    total = Math.addExact(total, d.byteCount)
                    return handle
                } finally { sealed.fill(0) }
            } finally { plain.fill(0) }
        }
        fun read(handle: Handle): ByteArray {
            ownedDirectory(); cancellation.check()
            val entry = entries.singleOrNull { it.handle === handle } ?: error("Foreign receipt handle")
            check(Identity.of(Os.fstat(entry.pin)) == entry.identity)
            hit(Point.REOPEN, entry.name)
            val fd = openFile(path(entry.name), OsConstants.O_RDONLY or OsConstants.O_NOFOLLOW, 0)
            var sealed: ByteArray? = null
            try {
                val stat = Os.fstat(fd)
                check(OsConstants.S_ISREG(stat.st_mode) && stat.st_uid == Process.myUid() && stat.st_nlink == 1L && stat.st_mode and 63 == 0 && Identity.of(stat) == entry.identity)
                check(stat.st_size == handle.descriptor.byteCount + 36) { "Receipt file size changed" }
                val data = ByteArray(stat.st_size.toInt()); sealed = data
                var offset = 0
                while (offset < data.size) {
                    cancellation.check()
                    val count = Os.read(fd, data, offset, minOf(32768, data.size - offset)); check(count > 0); offset += count
                }
                check(Os.read(fd, ByteArray(1), 0, 1) == 0) { "Trailing receipt bytes" }
            } finally { Os.close(fd) }
            try {
                cancellation.check()
                val plain = Codec.open(key, handle.descriptor, checkNotNull(sealed))
                try { cancellation.check(); return plain } catch (failure: Throwable) { plain.fill(0); throw failure }
            }
            finally { sealed?.fill(0) }
        }
        fun verifyAll(consume: ((Descriptor, ByteArray) -> Unit)? = null) {
            fun inventory() {
                ownedDirectory()
                val names = checkNotNull(File(path(".")).list()) { "Receipt inventory unavailable" }
                check(names.toSet() == entries.map { it.name }.toSet()) { "Receipt inventory changed" }
            }
            inventory()
            entries.forEach { entry ->
                val bytes=read(entry.handle)
                try {consume?.invoke(entry.handle.descriptor,bytes);cancellation.check()} finally {bytes.fill(0)}
            }
            hit(Point.DIRECTORY_SYNC); Os.fsync(checkNotNull(directory).fileDescriptor)
            Os.fsync(checkNotNull(parent).fileDescriptor); cancellation.check(); inventory()
        }
        fun release() = dispose(false)
        override fun close() = dispose(true)
        private fun dispose(delete: Boolean) {
            if (closed) return
            closed = true; key.fill(0)
            var failure: Throwable? = null
            fun attempt(work: () -> Unit) { try { work() } catch (error: Throwable) { if (failure == null) failure = error else failure!!.addSuppressed(error) } }
            entries.forEach { entry ->
                if (delete) attempt {
                    check(Identity.of(Os.fstat(entry.pin)) == entry.identity)
                    val file = path(entry.name)
                    val stat = try { Os.lstat(file) } catch (error: ErrnoException) { if (error.errno == OsConstants.ENOENT) return@attempt else throw error }
                    if (Identity.of(stat) == entry.identity && OsConstants.S_ISREG(stat.st_mode)) Os.remove(file)
                }
                attempt { Os.close(entry.pin) }
            }
            entries.clear()
            if (delete) attempt {
                val name = parentPath() + "/" + operationName
                val stat = Os.lstat(name)
                if (OsConstants.S_ISDIR(stat.st_mode) && Identity.of(stat) == directoryIdentity) Os.remove(name) // Empty directory only.
            }
            attempt { directory?.close() }; attempt { parent?.close() }
            directory = null; parent = null
            failure?.let { throw it }
        }
        private fun openDirectory(path: String): ParcelFileDescriptor {
            val before = Os.lstat(path)
            check(OsConstants.S_ISDIR(before.st_mode) && before.st_uid == Process.myUid() && before.st_mode and 63 == 0) { "Receipt root must be a private owned directory" }
            val fd = openFile(path, OsConstants.O_RDONLY or OsConstants.O_NOFOLLOW, 0)
            try {
                val stat = Os.fstat(fd)
                check(OsConstants.S_ISDIR(stat.st_mode) && Identity.of(stat) == Identity.of(before))
                return ParcelFileDescriptor.dup(fd)
            } finally { Os.close(fd) }
        }
        private fun openFile(path: String, flags: Int, mode: Int): FileDescriptor {
            // O_CLOEXEC became a public Android SDK constant at API27. No hidden
            // APIs/hardcoded Linux flags on API26; all descriptors are explicitly owned/closed.
            val extra = if (android.os.Build.VERSION.SDK_INT >= 27) OsConstants.O_CLOEXEC else 0
            return Os.open(path, flags or extra, mode)
        }
    }
}
