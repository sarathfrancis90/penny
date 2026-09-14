package ca.penny.offline

import android.content.Context
import android.content.ContextWrapper
import android.system.Os
import android.system.OsConstants
import androidx.test.platform.app.InstrumentationRegistry
import java.io.File
import java.io.IOException
import java.nio.ByteBuffer
import java.util.zip.CRC32
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

class LocalReceiptBlobDeviceTest {
    private val instrumentation = InstrumentationRegistry.getInstrumentation()
    private val root get() = ByteArray(32) { 11 } // Public fixture root only.
    private val vault = "33333333-3333-4333-8333-333333333333"
    private val owner = "11111111-1111-4111-8111-111111111111"
    private val image get() = instrumentation.context.assets.open("local-receipt-v1/receipt.png").use { it.readBytes() }
    private fun descriptor(operation: LocalReceiptBlob.Operation, bytes: ByteArray = image, id: String = Wire.id()) =
        LocalReceiptBlob.Descriptor(vault, operation.generationId, id, owner, "image/png", bytes.size.toLong(), Attachment.digest(bytes))
    private fun decode(j: JSONObject): LocalReceiptBlob.Descriptor {
        Wire.exactKeys(j, "vaultId", "generationId", "id", "expenseId", "mediaType", "byteCount", "sha256")
        val count = j.get("byteCount"); require(count is Int || count is Long) // Strict typed metadata adapter.
        return LocalReceiptBlob.Descriptor(Wire.string(j,"vaultId"), Wire.string(j,"generationId"), Wire.string(j,"id"), Wire.string(j,"expenseId"), Wire.string(j,"mediaType"), (count as Number).toLong(), Wire.string(j,"sha256"))
    }
    private fun hex(text: String) = text.chunked(2).map { it.toInt(16).toByte() }.toByteArray()
    private fun encoded(bytes: ByteArray) = bytes.joinToString("") { "%02x".format(it.toInt() and 255) }
    private fun fails(action: () -> Unit): Throwable {
        try { action() } catch (failure: Exception) { return failure }
        throw AssertionError("Expected failure")
    }
    private fun isolated(work: (Context, File) -> Unit) {
        assertEquals("Sandbox identity required", "ca.penny.offline.dev.test", instrumentation.targetContext.packageName)
        val directory = File(instrumentation.targetContext.noBackupFilesDir, "test-receipt-" + Wire.id())
        Os.mkdir(directory.path, 448)
        val context = object : ContextWrapper(instrumentation.targetContext) { override fun getNoBackupFilesDir() = directory }
        try { work(context, directory) } finally { removeOwnedTestTree(directory) }
    }
    private fun removeOwnedTestTree(file: File) {
        val stat = Os.lstat(file.path)
        if (OsConstants.S_ISDIR(stat.st_mode)) file.listFiles().orEmpty().forEach(::removeOwnedTestTree)
        Os.remove(file.path) // Never follows a test-created symlink.
    }
    private fun namespace(directory: File) = File(directory, LocalReceiptBlob.ROOT_NAME)

    @Test fun sharedGoldenAndAllAuthenticatedMalformedFixtures() {
        val manifest = instrumentation.context.assets.open("local-receipt-v1/fixture-manifest.json").bufferedReader().use { JSONObject(it.readText()) }
        val positive = manifest.getJSONArray("positives").getJSONObject(0)
        val descriptor = decode(positive.getJSONObject("descriptor"))
        val key = LocalReceiptBlob.Codec.key(hex(positive.getString("rootHex")), descriptor.vaultId, descriptor.generationId)
        assertEquals(positive.getString("derivedKeyHex"), encoded(key))
        assertEquals(positive.getString("aadHex"), encoded(LocalReceiptBlob.Codec.aad(descriptor)))
        val sealed = instrumentation.context.assets.open("local-receipt-v1/" + positive.getString("file")).use { it.readBytes() }
        assertArrayEquals(image, LocalReceiptBlob.Codec.open(key, descriptor, sealed))
        val first = LocalReceiptBlob.Codec.seal(key, descriptor, image)
        val second = LocalReceiptBlob.Codec.seal(key, descriptor, image)
        assertFalse(first.copyOfRange(8,20).contentEquals(second.copyOfRange(8,20)))
        assertArrayEquals(image, LocalReceiptBlob.Codec.open(key, descriptor, first))
        val negatives = manifest.getJSONArray("negatives"); assertEquals(35, negatives.length())
        repeat(negatives.length()) { index ->
            val case = negatives.getJSONObject(index)
            fails {
                val d = decode(case.getJSONObject("descriptor"))
                val secret = LocalReceiptBlob.Codec.key(hex(case.getString("rootHex")), d.vaultId, d.generationId)
                try { LocalReceiptBlob.Codec.open(secret, d, hex(case.getString("envelopeHex"))) } finally { secret.fill(0) }
            }
        }
        key.fill(0)
    }

    @Test fun ownershipTransfersExactlyOnceAndGenerationReopens() = isolated { context, directory ->
        val operation = LocalReceiptBlob.Operation(context, root, vault)
        val d = descriptor(operation)
        val handle = operation.seal(d, image)
        val file = File(namespace(directory), "${d.generationId}/${d.id}.pennyreceipt")
        assertEquals(d.byteCount + 36, file.length())
        assertEquals(384, Os.lstat(file.path).st_mode and 511)
        assertTrue(file.readBytes().copyOfRange(0,8).contentEquals("PNYRCP01".toByteArray()))
        val generation = operation.complete()
        fails { operation.complete() }; fails { operation.seal(d, image) }; fails { operation.discard() }
        operation.close(); assertTrue(file.exists())
        assertArrayEquals(image, generation.read(handle))
        generation.close(); generation.close(); assertFalse(file.exists())
        fails { generation.read(handle) }
        assertTrue(namespace(directory).listFiles().orEmpty().isEmpty())
    }

    @Test fun currentCountAndByteCapsFailClosed() = isolated { context, directory ->
        val many = LocalReceiptBlob.Operation(context, root, vault)
        repeat(100) { many.seal(descriptor(many), image) }
        fails { many.seal(descriptor(many), image) }
        assertTrue(namespace(directory).listFiles().orEmpty().isEmpty())
        val large = paddedImage(Attachment.maxBytes)
        ReceiptImage.decode(large).recycle()
        val full = LocalReceiptBlob.Operation(context, root, vault)
        repeat(4) { full.seal(descriptor(full, large), large) }
        fails { full.seal(descriptor(full), image) }
        assertTrue(namespace(directory).listFiles().orEmpty().isEmpty())
        val duplicate = LocalReceiptBlob.Operation(context, root, vault); val d = descriptor(duplicate)
        duplicate.seal(d, image); fails { duplicate.seal(d, image) }
        assertTrue(namespace(directory).listFiles().orEmpty().isEmpty())
    }

    @Test fun boundaryFailuresAndPartialCiphertextWriteDiscardOnlyOwnedFiles() = isolated { context, directory ->
        namespace(directory).mkdir(); Os.chmod(namespace(directory).path,448)
        val sibling = File(namespace(directory), "sibling.txt").apply { writeText("untouched") }
        for (point in LocalReceiptBlob.Point.entries) {
            val failure = fails {
                LocalReceiptBlob.Operation(context, root, vault, faults = LocalReceiptBlob.Faults { at, _ -> if (at == point) throw IOException("injected $point checkpoint") }).use { operation ->
                    operation.seal(descriptor(operation), image); operation.complete().close()
                }
            }
            assertTrue(failure.message.orEmpty().contains("injected"))
            assertEquals(listOf("sibling.txt"), namespace(directory).list()!!.toList())
            assertEquals("untouched", sibling.readText())
        }
        var writes = 0; var observedPartial = false
        val large = paddedImage(65536)
        val operation = LocalReceiptBlob.Operation(context, root, vault, faults = LocalReceiptBlob.Faults { point, file ->
            if (point == LocalReceiptBlob.Point.WRITE && ++writes == 2) {
                observedPartial = file.length() == 32768L
                throw IOException("injected second-write checkpoint")
            }
        })
        fails { operation.seal(descriptor(operation, large), large) }
        assertTrue(observedPartial); assertEquals(listOf("sibling.txt"), namespace(directory).list()!!.toList())
    }

    @Test fun cancellationFailsBeforeHandleAndComplete() = isolated { context, directory ->
        for (point in listOf(LocalReceiptBlob.Point.WRITE, LocalReceiptBlob.Point.REOPEN, LocalReceiptBlob.Point.DIRECTORY_SYNC)) {
            val token = LocalReceiptBlob.Cancellation()
            val operation = LocalReceiptBlob.Operation(context, root, vault, token, LocalReceiptBlob.Faults { at, _ -> if (point == at) token.cancel() })
            fails { operation.seal(descriptor(operation), image); operation.complete() }
            assertTrue(namespace(directory).listFiles().orEmpty().isEmpty())
        }
        val token = LocalReceiptBlob.Cancellation().apply { cancel() }
        fails { LocalReceiptBlob.Operation(context, root, vault, token) }
    }

    @Test fun collisionsSymlinksAndUnexpectedInventoryPreserveForeignObjects() = isolated { context, directory ->
        val target = File(directory, "target").apply { mkdir(); Os.chmod(path,448) }
        val sentinel = File(target,"sentinel").apply { writeText("keep") }
        Os.symlink(target.path, namespace(directory).path)
        fails { LocalReceiptBlob.Operation(context, root, vault) }
        assertEquals("keep", sentinel.readText()); Os.remove(namespace(directory).path)
        for (symlink in listOf(false,true)) {
            var collision: File? = null
            val operation = LocalReceiptBlob.Operation(context, root, vault, faults = LocalReceiptBlob.Faults { point, file ->
                if (point == LocalReceiptBlob.Point.CREATE) {
                    collision = File(namespace(directory), file.parentFile!!.canonicalFile.name + "/" + file.name)
                    if (symlink) Os.symlink(sentinel.path, file.path) else file.writeText("preexisting")
                }
            })
            fails { operation.seal(descriptor(operation), image) }
            assertEquals("keep", sentinel.readText())
            val path = checkNotNull(collision)
            assertTrue(path.exists()); if (!symlink) assertEquals("preexisting", path.readText())
            removeOwnedTestTree(path.parentFile!!)
        }
        val operation = LocalReceiptBlob.Operation(context, root, vault)
        val d = descriptor(operation); operation.seal(d,image)
        val folder = File(namespace(directory),operation.generationId)
        val added = File(folder,"foreign").apply { writeText("do not remove") }
        fails { operation.complete() }
        assertEquals("do not remove", added.readText())
        assertFalse(File(folder,d.id+".pennyreceipt").exists())
    }

    @Test fun removedReplacedTamperedAndUnprotectedFilesFailFinalInventory() = isolated { context, directory ->
        for (mode in listOf("remove", "replace", "tamper", "trailing", "permissions", "symlink")) {
            val operation = LocalReceiptBlob.Operation(context, root, vault)
            val d=descriptor(operation); operation.seal(d,image)
            val file=File(namespace(directory),"${d.generationId}/${d.id}.pennyreceipt")
            val other=File(directory,"other-$mode").apply { writeText("foreign") }
            when(mode) {
                "remove" -> Os.remove(file.path)
                "replace" -> { Os.remove(file.path); file.writeText("replacement") }
                "symlink" -> { Os.remove(file.path); Os.symlink(other.path,file.path) }
                "permissions" -> Os.chmod(file.path,420)
                "trailing" -> file.appendBytes(byteArrayOf(0))
                else -> file.writeBytes(file.readBytes().also { it[it.lastIndex]=(it.last().toInt() xor 1).toByte() })
            }
            fails { operation.complete() }
            assertEquals("foreign",other.readText())
            if(mode=="replace") assertEquals("replacement",file.readText())
            if(mode=="replace" || mode=="symlink") removeOwnedTestTree(file.parentFile!!)
            assertTrue(namespace(directory).listFiles().orEmpty().isEmpty())
        }
    }

    private fun paddedImage(size: Int): ByteArray {
        val original=image; val count=size-original.size-12; require(count>=0)
        val type="teSt".toByteArray();val data=ByteArray(count)
        val crc=CRC32().apply { update(type); update(data) }.value
        return original.copyOfRange(0,original.size-12)+ByteBuffer.allocate(4).putInt(count).array()+type+data+ByteBuffer.allocate(4).putInt(crc.toInt()).array()+original.copyOfRange(original.size-12,original.size)
    }
}
