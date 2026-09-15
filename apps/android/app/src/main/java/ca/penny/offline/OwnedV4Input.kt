package ca.penny.offline

import android.content.Context
import android.os.Process
import android.system.Os
import android.system.OsConstants
import java.io.Closeable
import java.io.File
import java.io.FileDescriptor
import java.io.InputStream
import java.security.MessageDigest

/** One private ciphertext snapshot; never stores decoded plaintext. No caller path. */
internal class OwnedV4Input private constructor(private val context: Context, private val operation: RestoreOperation,
    private val fault: (V4Restore.Point,File)->Unit) : Closeable {
    private val directory=CiphertextDirectory.get(context)
    private val name="v4-input-${Wire.id()}.ciphertext"
    private var parent: FileDescriptor?=null
    private var writer: FileDescriptor?=null
    private var pin: FileDescriptor?=null
    private var identity: Pair<Long,Long>?=null
    private var rootIdentity: Pair<Long,Long>?=null
    private var closed=false
    private var size=0L
    private var hash=byteArrayOf()
    private fun identity(fd: FileDescriptor)=Os.fstat(fd).let {it.st_dev to it.st_ino}
    private var parentHandle: android.os.ParcelFileDescriptor?=null
    private fun selected()="/proc/self/fd/${checkNotNull(parentHandle).fd}/$name"
    private fun rootCheck() {
        val stat=Os.lstat(directory.absolutePath)
        check(OsConstants.S_ISDIR(stat.st_mode) && stat.st_uid==Process.myUid() && stat.st_mode and 63==0 && (stat.st_dev to stat.st_ino)==rootIdentity) {"Ciphertext namespace changed"}
    }
    private fun fileCheck() {
        check(!closed);rootCheck()
        val stat=Os.lstat(selected());check(OsConstants.S_ISREG(stat.st_mode) && stat.st_nlink==1L && stat.st_uid==Process.myUid() && stat.st_mode and 511==256 && (stat.st_dev to stat.st_ino)==identity && stat.st_size==size) {"Ciphertext snapshot changed"}
        check(identity(checkNotNull(pin))==identity)
    }
    companion object {
        fun capture(context: Context,input: InputStream,operation: RestoreOperation,fault: (V4Restore.Point,File)->Unit): OwnedV4Input {
            var owned: OwnedV4Input?=null
            try {
                input.use {source->
                    operation.check();val value=OwnedV4Input(context,operation,fault);owned=value
                    value.copy(source)
                }
                operation.check();return checkNotNull(owned)
            } catch(error: Throwable) {try {owned?.close()} catch(cleanup: Throwable) {error.addSuppressed(cleanup)};throw error}
        }
    }
    private fun copy(input: InputStream) {
        parent=Os.open(directory.absolutePath,OsConstants.O_RDONLY or OsConstants.O_NOFOLLOW or OsConstants.O_NONBLOCK,0)
        rootIdentity=identity(checkNotNull(parent));rootCheck()
        parentHandle=android.os.ParcelFileDescriptor.dup(checkNotNull(parent))
        writer=Os.open(selected(),OsConstants.O_WRONLY or OsConstants.O_CREAT or OsConstants.O_EXCL or OsConstants.O_NOFOLLOW,384)
        identity=identity(checkNotNull(writer))
        pin=Os.open(selected(),OsConstants.O_RDONLY or OsConstants.O_NOFOLLOW,0);check(identity(checkNotNull(pin))==identity)
        val digest=MessageDigest.getInstance("SHA-256");val bytes=ByteArray(32768)
        try {while(true) {
            operation.check();val count=input.read(bytes);require(count in -1..bytes.size && count!=0) {"Invalid ciphertext source read"};if(count<0) break
            size=Math.addExact(size,count.toLong());require(size<=Backup.maxEnvelopeBytes) {"Encrypted backup exceeds 20 MiB"}
            digest.update(bytes,0,count);var offset=0
            while(offset<count) {operation.check();val written=Os.write(checkNotNull(writer),bytes,offset,count-offset);check(written>0);offset+=written}
            fault(V4Restore.Point.COPY,File(selected()));operation.check()
        }} finally {bytes.fill(0)}
        require(size>0);hash=digest.digest();Os.fchmod(checkNotNull(writer),256);Os.fsync(checkNotNull(writer))
        val fd=writer;writer=null;Os.close(checkNotNull(fd));Os.fsync(checkNotNull(parent));fileCheck()
    }
    fun open(point: V4Restore.Point): InputStream {
        fileCheck();operation.check()
        val fd=Os.open(selected(),OsConstants.O_RDONLY or OsConstants.O_NOFOLLOW,0)
        try {check(identity(fd)==identity)} catch(error: Throwable) {Os.close(fd);throw error}
        return object:InputStream() {
            private val digest=MessageDigest.getInstance("SHA-256")
            private var count=0L;private var eof=false;private var done=false
            override fun read():Int {val b=ByteArray(1);return if(read(b,0,1)<0) -1 else b[0].toInt() and 255}
            override fun read(b:ByteArray,off:Int,len:Int):Int {
                check(!done);require(off>=0 && len>=0 && off<=b.size-len);if(len==0) return 0
                operation.check();fileCheck();val n=Os.read(fd,b,off,minOf(len,32768))
                if(n==0) {if(!eof) {check(count==size && MessageDigest.isEqual(digest.digest(),hash)) {"Ciphertext digest changed"};eof=true};return -1}
                count=Math.addExact(count,n.toLong());check(count<=size);digest.update(b,off,n)
                fault(point,File(selected()));operation.check();return n
            }
            override fun close() {
                if(done) return;done=true
                try {check(eof) {"Ciphertext not completely consumed"};fileCheck();operation.check()} finally {Os.close(fd)}
            }
        }
    }
    override fun close() {
        if(closed) return;closed=true
        var failure: Throwable?=null
        fun attempt(block:()->Unit) {try {block()} catch(error: Throwable) {if(failure==null) failure=error else failure!!.addSuppressed(error)}}
        if(parent!=null) attempt {rootCheck()}
        if(identity!=null && parentHandle!=null) attempt {
            val stat=Os.lstat(selected());check(OsConstants.S_ISREG(stat.st_mode) && (stat.st_dev to stat.st_ino)==identity) {"Ciphertext cleanup ownership changed"}
            Os.remove(selected());Os.fsync(checkNotNull(parent))
        }
        attempt {writer?.let(Os::close)};attempt {pin?.let(Os::close)};attempt {parentHandle?.close()};attempt {parent?.let(Os::close)}
        writer=null;pin=null;parentHandle=null;parent=null;hash.fill(0)
        failure?.let {throw it}
        fault(V4Restore.Point.SOURCE_CLOSED,File(directory,name));operation.check()
    }
}
