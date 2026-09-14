package ca.penny.offline

import android.content.Context
import android.os.ParcelFileDescriptor
import android.system.ErrnoException
import android.system.Os
import android.system.OsConstants
import java.io.File

/** Android owns no_backup's mode (often 0771). Only our child must be 0700. */
internal object CiphertextDirectory {
    const val NAME="v4-ciphertext-v1"
    fun get(context:Context):File {
        val root=context.noBackupFilesDir
        val fd=Os.open(root.absolutePath,OsConstants.O_RDONLY or OsConstants.O_NOFOLLOW or OsConstants.O_NONBLOCK,0)
        try {
            val parent=Os.fstat(fd)
            check(OsConstants.S_ISDIR(parent.st_mode) && parent.st_uid==android.os.Process.myUid())
            ParcelFileDescriptor.dup(fd).use {handle->
                val selected="/proc/self/fd/${handle.fd}/$NAME"
                try {Os.mkdir(selected,448);Os.fsync(fd)} catch(error:ErrnoException) {if(error.errno!=OsConstants.EEXIST) throw error}
                val child=Os.open(selected,OsConstants.O_RDONLY or OsConstants.O_NOFOLLOW or OsConstants.O_NONBLOCK,0)
                try {
                    val stat=Os.fstat(child);val named=Os.lstat(File(root,NAME).absolutePath)
                    check(OsConstants.S_ISDIR(stat.st_mode) && stat.st_uid==android.os.Process.myUid() && stat.st_mode and 511==448 && stat.st_dev==named.st_dev && stat.st_ino==named.st_ino)
                    val current=Os.lstat(root.absolutePath);check(current.st_dev==parent.st_dev && current.st_ino==parent.st_ino)
                } finally {Os.close(child)}
            }
        } finally {Os.close(fd)}
        return File(root,NAME)
    }
}
