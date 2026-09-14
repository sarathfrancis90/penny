package ca.penny.offline

import android.content.Context
import ca.penny.v4frameprobe.*
import java.io.*
import java.security.MessageDigest
import org.json.JSONObject

/** Internal worker-only export. No provider/UI publication, Snapshot hydration or plaintext spool. */
internal object V4Export {
    enum class Point { SOURCE_READY, RECEIPT_READ, WRITE, SYNCED, CLOSED, SOURCE_RELEASED, READBACK, VERIFIED }
    class VerifiedFile internal constructor(private val owned:OwnedV4Output,val summary:LogicalSummary,
        val source:VaultGenerations.VerifiedMetadata,private val operation:RestoreOperation):Closeable {
        val byteCount:Long get()=owned.size
        val sha256:String get()=owned.sha256
        private var open=true
        /** Owns/closes destination; only encrypted bytes leave this capability. */
        @Synchronized fun copyTo(destination:OutputStream) {
            destination.use {out->check(open);owned.open().use {input->val buffer=ByteArray(32768)
                try {while(true) {val n=input.read(buffer);if(n<0) break;out.write(buffer,0,n)};out.flush()}
                finally {buffer.fill(0)}
            }}
        }
        @Synchronized override fun close() {if(open) {open=false;try {owned.close()} finally {operation.finish()}}}
    }
    fun create(context:Context,store:VaultStore,root:ByteArray,operation:RestoreOperation=RestoreOperation(),
        fault:(Point,File)->Unit={_,_->}):VerifiedFile {
        val owned=OwnedV4Output(context,operation::check,fault)
        var secret=byteArrayOf()
        try {
            require(root.size==32);secret=root.copyOf();operation.check()
            lateinit var expected:LogicalSummary
            lateinit var metadata:VaultGenerations.VerifiedMetadata
            store.generations.withVerifiedExportSource {source->
                operation.check();metadata=source.metadata
                val identity=Wire.id() to Wire.now()
                val logical=LogicalInput(source,operation,identity) {fault(Point.RECEIPT_READ,context.noBackupFilesDir)}
                logical.use {
                    fault(Point.SOURCE_READY,context.noBackupFilesDir);operation.check()
                    val stats=FrameCodec.encrypt(secret,logical,owned.output())
                    expected=checkNotNull(logical.summary)
                    check(stats.plaintextBytes==logical.plaintextBytes && stats.wireBytes==owned.size)
                }
            }
            fault(Point.SOURCE_RELEASED,context.noBackupFilesDir);operation.check()
            val sink=object:LogicalValidationSink {
                override fun begin(snapshotId:String,vaultId:String,createdAt:String) {operation.check()}
                override fun record(kind:Int,value:JSONObject) {operation.check()}
                override fun receipt(descriptor:ReceiptDescriptor,bytes:ByteArray) {operation.check()}
                override fun finishUncommitted(summary:LogicalSummary) {operation.check();check(summary==expected) {"Export readback meaning changed"}}
                override fun discard() {}
                override fun close() {operation.check()}
            }
            val actual=V4BackupReader.decode(secret,owned.open(),sink)
            check(actual==expected);fault(Point.VERIFIED,context.noBackupFilesDir);operation.check()
            return VerifiedFile(owned,actual,metadata,operation)
        } catch(error:Throwable) {
            try {owned.close()} catch(cleanup:Throwable) {error.addSuppressed(cleanup)}
            operation.finish();throw error
        } finally {secret.fill(0)}
    }
    /** Same per-record encoder for counting and emission. Only current payload is retained. */
    private class LogicalInput(private val source:VaultGenerations.ExportSource,private val operation:RestoreOperation,private val identity:Pair<String,String>,
        private val receiptRead:()->Unit):InputStream() {
        private data class Record(val kind:Int,val rawSize:Long=0,val encode:()->ByteArray)
        private val records=mutableListOf<Record>()
        private val counts=linkedMapOf<String,Long>()
        private val receiptBytes=source.descriptors.sumOf {it.byteCount}
        private var nonReceiptBytes=0L
        private var policyBytes=0L
        private lateinit var begin:ByteArray
        val plaintextBytes:Long
        var summary:LogicalSummary?=null;private set
        private val transcript=MessageDigest.getInstance("SHA-256")
        private var index=-1;private var header=byteArrayOf();private var payload=byteArrayOf()
        private var offset=0;private var headerOffset=0;private var currentKind=0
        private var done=false;private var eof=false
        init {
            source.body.finance.domains().entries.forEachIndexed {i,(name,rows)->
                counts[name]=rows.size.toLong();rows.sortedBy {it.id}.forEach {row->records+=Record(i+2) {json(row.json())}}
            }
            counts["expenses"]=source.body.expenses.size.toLong()
            source.body.expenses.sortedBy {it.id}.forEach {row->records+=Record(8) {json(row.json())}}
            counts["attachments"]=source.descriptors.size.toLong()
            source.descriptors.sortedBy {it.id}.forEach {d->
                records+=Record(9) {json(JSONObject().put("id",d.id).put("expenseId",d.expenseId).put("mediaType",d.mediaType).put("byteCount",d.byteCount).put("sha256",d.sha256))}
                records+=Record(10,d.byteCount) {source.read(d).also {try {receiptRead();operation.check()} catch(error:Throwable) {it.fill(0);throw error}}}
            }
            records.forEach {record->operation.check();val n=if(record.kind==10) 0 else record.encode().let {try {it.size} finally {it.fill(0)}};nonReceiptBytes=Math.addExact(nonReceiptBytes,9L+n)}
            begin=json(JSONObject().put("schemaVersion",4).put("capacityProfile","A").put("snapshotId",identity.first).put("vaultId",source.body.vaultId).put("createdAt",identity.second)
                .put("counts",JSONObject(counts as Map<*,*>)).put("receiptBytes",receiptBytes).put("nonReceiptBytes",nonReceiptBytes))
            val endSize=end("0".repeat(64)).let {try {it.size} finally {it.fill(0)}}
            policyBytes=Math.addExact(nonReceiptBytes,18L+begin.size+endSize)
            V4BackupReader.requirePolicyMetadata(policyBytes)
            plaintextBytes=Math.addExact(policyBytes,receiptBytes)
            val frames=(plaintextBytes+FrameCodec.CHUNK-1)/FrameCodec.CHUNK
            require(70+plaintextBytes+frames*33<=Backup.maxEnvelopeBytes) {"Encrypted backup exceeds 20 MiB"}
        }
        private fun json(value:JSONObject)=StrictJson.bytes(value).also {require(it.size in 1..65536) {"Logical JSON record exceeds 64 KiB"}}
        private fun end(hash:String)=json(JSONObject().put("snapshotId",identity.first).put("counts",JSONObject(counts as Map<*,*>))
            .put("receiptBytes",receiptBytes).put("nonReceiptBytes",nonReceiptBytes).put("recordCount",records.size+1L).put("streamSha256",hash))
        private fun next():Boolean {
            payload.fill(0);header.fill(0);offset=0;headerOffset=0;operation.check()
            index++
            if(index>records.size+1) {eof=true;return false}
            when(index) {
                0->{currentKind=1;payload=begin;begin=byteArrayOf()}
                records.size+1->{currentKind=11;val hash=transcript.digest().joinToString("") {"%02x".format(it.toInt() and 255)}
                    payload=end(hash);summary=LogicalSummary(identity.first,source.body.vaultId,identity.second,java.util.Collections.unmodifiableMap(counts.toMap()),receiptBytes,nonReceiptBytes,policyBytes,records.size+1L,hash)}
                else->{val record=records[index-1];currentKind=record.kind;payload=record.encode();if(currentKind==10) check(payload.size.toLong()==record.rawSize)}
            }
            header=ByteArray(9).also {it[0]=currentKind.toByte();FrameCodec.putU64(it,1,payload.size.toLong())};return true
        }
        override fun read():Int {val b=ByteArray(1);return if(read(b,0,1)<0) -1 else b[0].toInt() and 255}
        override fun read(b:ByteArray,off:Int,len:Int):Int {
            check(!done);require(off>=0 && len>=0 && off<=b.size-len);if(len==0) return 0;operation.check()
            if(headerOffset==header.size && offset==payload.size && !next()) return -1
            val fromHeader=headerOffset<header.size;val bytes=if(fromHeader) header else payload;val start=if(fromHeader) headerOffset else offset
            val n=minOf(len,bytes.size-start);bytes.copyInto(b,off,start,start+n)
            if(currentKind!=11) transcript.update(bytes,start,n)
            if(fromHeader) headerOffset+=n else offset+=n
            return n
        }
        override fun close() {if(!done) {done=true;payload.fill(0);header.fill(0);begin.fill(0);operation.check();check(eof) {"Logical export input incomplete"}}}
    }
}
