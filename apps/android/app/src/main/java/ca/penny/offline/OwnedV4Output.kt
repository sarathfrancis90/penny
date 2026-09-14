package ca.penny.offline

import android.content.Context
import android.system.Os
import android.system.OsConstants
import java.io.*
import java.security.MessageDigest

/** Private ciphertext only. Real sync/close precedes readers; cleanup checks original inode. */
internal class OwnedV4Output(private val context:Context,private val checkCancelled:()->Unit,
    private val fault:(V4Export.Point,File)->Unit):Closeable {
    private val directory=CiphertextDirectory.get(context)
    private val name="v4-export-${Wire.id()}.ciphertext"
    private var parent:android.os.ParcelFileDescriptor?=null
    private var writer:FileDescriptor?=null
    private var pin:FileDescriptor?=null
    private var rootIdentity:Pair<Long,Long>?=null
    private var identity:Pair<Long,Long>?=null
    private var closed=false
    private var sealed=false
    var size=0L; private set
    var sha256=""; private set
    private val digest=MessageDigest.getInstance("SHA-256")
    private fun id(fd:FileDescriptor)=Os.fstat(fd).let {it.st_dev to it.st_ino}
    private fun path()="/proc/self/fd/${checkNotNull(parent).fd}/$name"
    private fun rootCheck() {
        val s=Os.lstat(directory.absolutePath)
        check(OsConstants.S_ISDIR(s.st_mode) && s.st_uid==android.os.Process.myUid() && s.st_mode and 63==0 && (s.st_dev to s.st_ino)==rootIdentity)
    }
    private fun fileCheck() {
        check(!closed && sealed);rootCheck()
        val s=Os.lstat(path())
        check(OsConstants.S_ISREG(s.st_mode) && s.st_uid==android.os.Process.myUid() && s.st_nlink==1L && s.st_mode and 511==256 && (s.st_dev to s.st_ino)==identity && s.st_size==size && id(checkNotNull(pin))==identity) {"Export ciphertext changed"}
    }
    fun output():OutputStream {
        check(parent==null && !closed);checkCancelled()
        val fd=Os.open(directory.absolutePath,OsConstants.O_RDONLY or OsConstants.O_NOFOLLOW or OsConstants.O_NONBLOCK,0)
        try {rootIdentity=id(fd);rootCheck();parent=android.os.ParcelFileDescriptor.dup(fd)} finally {Os.close(fd)}
        writer=Os.open(path(),OsConstants.O_WRONLY or OsConstants.O_CREAT or OsConstants.O_EXCL or OsConstants.O_NOFOLLOW,384)
        identity=id(checkNotNull(writer));pin=Os.open(path(),OsConstants.O_RDONLY or OsConstants.O_NOFOLLOW,0);check(id(checkNotNull(pin))==identity)
        return object:OutputStream() {
            private var done=false
            override fun write(value:Int)=write(byteArrayOf(value.toByte()),0,1)
            override fun write(b:ByteArray,off:Int,len:Int) {
                check(!done);require(off>=0 && len>=0 && off<=b.size-len);checkCancelled();rootCheck()
                require(size+len<=Backup.maxEnvelopeBytes) {"Encrypted backup exceeds 20 MiB"}
                var used=0
                while(used<len) {checkCancelled();val n=Os.write(checkNotNull(writer),b,off+used,minOf(32768,len-used));check(n>0);digest.update(b,off+used,n);size+=n;used+=n;fault(V4Export.Point.WRITE,File(path()))}
            }
            override fun close() {
                if(done) return;done=true
                val current=writer;writer=null
                try {checkCancelled();Os.fchmod(checkNotNull(current),256);Os.fsync(current);fault(V4Export.Point.SYNCED,File(path()))}
                finally {current?.let(Os::close)}
                sha256=digest.digest().joinToString("") {"%02x".format(it.toInt() and 255)}
                Os.fsync(checkNotNull(parent).fileDescriptor);sealed=true;fileCheck();fault(V4Export.Point.CLOSED,File(path()));checkCancelled()
            }
        }
    }
    fun open():InputStream {
        fileCheck();checkCancelled()
        val fd=Os.open(path(),OsConstants.O_RDONLY or OsConstants.O_NOFOLLOW,0)
        try {check(id(fd)==identity)} catch(error:Throwable) {Os.close(fd);throw error}
        return object:InputStream() {
            private val hash=MessageDigest.getInstance("SHA-256")
            private var count=0L;private var eof=false;private var done=false
            override fun read():Int {val b=ByteArray(1);return if(read(b,0,1)<0) -1 else b[0].toInt() and 255}
            override fun read(b:ByteArray,off:Int,len:Int):Int {
                check(!done);require(off>=0 && len>=0 && off<=b.size-len);if(len==0) return 0
                checkCancelled();fileCheck();val n=Os.read(fd,b,off,minOf(32768,len))
                if(n==0) {if(!eof) {check(count==size && hash.digest().joinToString("") {"%02x".format(it.toInt() and 255)}==sha256);eof=true};return -1}
                count+=n;check(count<=size);hash.update(b,off,n);fault(V4Export.Point.READBACK,File(path()));checkCancelled();return n
            }
            override fun close() {if(!done) {done=true;try {check(eof);fileCheck();checkCancelled()} finally {Os.close(fd)}}}
        }
    }
    override fun close() {
        if(closed) return;closed=true
        var failure:Throwable?=null
        fun attempt(block:()->Unit) {try {block()} catch(error:Throwable) {if(failure==null) failure=error else failure!!.addSuppressed(error)}}
        if(parent!=null) attempt {rootCheck()}
        if(identity!=null && parent!=null) attempt {val s=Os.lstat(path());check(OsConstants.S_ISREG(s.st_mode) && (s.st_dev to s.st_ino)==identity) {"Export cleanup ownership changed"};Os.remove(path());Os.fsync(checkNotNull(parent).fileDescriptor)}
        attempt {writer?.let(Os::close)};attempt {pin?.let(Os::close)};attempt {parent?.close()}
        writer=null;pin=null;parent=null;failure?.let {throw it}
    }
}
