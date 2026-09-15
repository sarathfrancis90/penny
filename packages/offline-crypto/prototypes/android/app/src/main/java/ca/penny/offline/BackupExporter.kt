package ca.penny.offline

import java.io.ByteArrayOutputStream
import java.io.InputStream

/** Probe-only helper for the reused ReceiptImage preparation API. No vault/export implementation. */
internal object BackupExporter {
    fun readBounded(input: InputStream, maxBytes: Int): ByteArray {
        require(maxBytes in 1..20 * 1024 * 1024)
        val output = ByteArrayOutputStream()
        val buffer = ByteArray(8192)
        while (true) {
            val count = input.read(buffer)
            if (count < 0) break
            require(count > 0 && output.size().toLong() + count <= maxBytes)
            output.write(buffer, 0, count)
        }
        return output.toByteArray()
    }
}
