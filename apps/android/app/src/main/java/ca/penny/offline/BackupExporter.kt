package ca.penny.offline

import android.content.Context
import android.net.Uri
import java.io.File
import java.io.FileOutputStream
import java.io.InputStream
import java.security.MessageDigest

/** Only encrypted bytes touch staging or the chosen destination. Success requires readback. */
class BackupExporter(private val context: Context) {
    fun export(snapshot: Snapshot, recovery: String, uri: Uri) {
        RecoveryKeyStore(context).requireConfirmed(recovery)
        exportVerified(snapshot,recovery, { data ->
            context.contentResolver.openFileDescriptor(uri,"rw").use { descriptor ->
                checkNotNull(descriptor) { "Backup destination unavailable" }
                check(descriptor.statSize == 0L) { "Choose a new empty backup file. Existing files are preserved." }
                FileOutputStream(descriptor.fileDescriptor).use { output -> output.write(data); output.flush(); output.fd.sync() }
            }
        }, { context.contentResolver.openInputStream(uri).use { readBounded(checkNotNull(it)) } })
    }
    internal fun exportVerified(snapshot: Snapshot, recovery: String, write: (ByteArray)->Unit, read: ()->ByteArray) {
        val directory = File(context.noBackupFilesDir,"encrypted-exports").apply { mkdirs() }
        val stage = File.createTempFile("backup-", ".sealed",directory)
        try {
            val bytes = Backup.encrypt(snapshot,recovery)
            FileOutputStream(stage).use { it.write(bytes); it.flush(); it.fd.sync() }
            val staged = stage.inputStream().use(::readBounded)
            check(MessageDigest.isEqual(bytes,staged) && Backup.decrypt(staged,recovery) == snapshot) { "Staged backup verification failed" }
            write(staged)
            val destination = read()
            check(MessageDigest.isEqual(staged,destination) && Backup.decrypt(destination,recovery) == snapshot) { "Destination backup verification failed. The file may be incomplete." }
        } finally { stage.delete() }
    }
    companion object {
        fun readBounded(input: InputStream, maxBytes: Int = Backup.maxEnvelopeBytes): ByteArray {
            val result = java.io.ByteArrayOutputStream(); val buffer = ByteArray(8192)
            while(true) { val size = input.read(buffer); if(size < 0) break; require(result.size().toLong()+size <= maxBytes) { "File exceeds size limit" }; result.write(buffer,0,size) }
            return result.toByteArray()
        }
    }
}
