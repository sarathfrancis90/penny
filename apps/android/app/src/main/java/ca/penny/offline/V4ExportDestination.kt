package ca.penny.offline

import android.content.Context
import android.net.Uri
import android.os.ParcelFileDescriptor
import android.system.Os
import android.system.OsConstants
import ca.penny.v4frameprobe.*
import java.io.*
import java.security.MessageDigest
import org.json.JSONObject

/** Destination is never ours to delete. A partial/unknown provider object remains on failure. */
internal object V4ExportDestination {
    internal interface Destination {
        /** Must preserve an existing nonempty object; must sync and close before returning. */
        fun openEmpty():OutputStream
        fun read():InputStream
    }
    fun at(context:Context,uri:Uri)=object:Destination {
        override fun openEmpty():OutputStream {
            val descriptor=checkNotNull(context.contentResolver.openFileDescriptor(uri,"rw")) {"Backup destination unavailable"}
            try {
                val stat=Os.fstat(descriptor.fileDescriptor)
                check(OsConstants.S_ISREG(stat.st_mode) && descriptor.statSize==0L) {"Choose a new empty backup file. Existing files are preserved."}
                return object:ParcelFileDescriptor.AutoCloseOutputStream(descriptor) {
                    private var done=false
                    override fun close() {if(!done) {done=true;try {flush();fd.sync()} finally {super.close()}}}
                }
            } catch(error:Throwable) {try {descriptor.close()} catch(cleanup:Throwable) {error.addSuppressed(cleanup)};throw error}
        }
        override fun read()=checkNotNull(context.contentResolver.openInputStream(uri)) {"Backup readback unavailable"}
    }
    fun copyAndVerify(file:V4Export.VerifiedFile,root:ByteArray,destination:Destination,operation:RestoreOperation) {
        operation.check();file.copyTo(destination.openEmpty());operation.check()
        val input=object:FilterInputStream(destination.read()) {
            private val digest=MessageDigest.getInstance("SHA-256")
            private var count=0L;private var eof=false;private var done=false
            override fun read():Int {val bytes=ByteArray(1);return if(read(bytes,0,1)<0) -1 else bytes[0].toInt() and 255}
            override fun read(b:ByteArray,off:Int,len:Int):Int {
                check(!done);operation.check();require(off>=0 && len>=0 && off<=b.size-len);if(len==0) return 0
                val requested=minOf(32768,len);val n=`in`.read(b,off,requested);check(n in -1..requested && n!=0) {"Invalid destination read"}
                if(n<0) {if(!eof) {check(count==file.byteCount && digest.digest().joinToString("") {"%02x".format(it.toInt() and 255)}==file.sha256) {"Destination bytes changed"};eof=true};return -1}
                count=Math.addExact(count,n.toLong());require(count<=file.byteCount && count<=Backup.maxEnvelopeBytes);digest.update(b,off,n);operation.check();return n
            }
            override fun close() {if(!done) {done=true;try {check(eof);operation.check()} finally {super.close()}}}
        }
        val sink=object:LogicalValidationSink {
            override fun begin(snapshotId:String,vaultId:String,createdAt:String) {operation.check()}
            override fun record(kind:Int,value:JSONObject) {operation.check()}
            override fun receipt(descriptor:ReceiptDescriptor,bytes:ByteArray) {operation.check()}
            override fun finishUncommitted(summary:LogicalSummary) {operation.check();check(summary==file.summary) {"Destination meaning changed"}}
            override fun discard() {}
            override fun close() {operation.check()}
        }
        check(V4BackupReader.decode(root,input,sink)==file.summary);operation.check()
    }
}
