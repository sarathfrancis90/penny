package ca.penny.offline

import android.content.Context
import ca.penny.v4frameprobe.LogicalSummary
import ca.penny.v4frameprobe.LogicalValidationSink
import ca.penny.v4frameprobe.ReceiptDescriptor
import java.io.File
import java.io.InputStream
import org.json.JSONArray
import org.json.JSONObject

/** Two fully validated passes over one pinned ciphertext snapshot. No plaintext files or receipt catalog hydration. */
internal object V4Restore {
    enum class Point { COPY, PASS1_READ, PASS1_CLOSED, PASS1_DONE, PASS2_READ, PASS2_CLOSED, PASS2_DONE, SOURCE_CLOSED }
    fun prepare(context: Context,store: VaultStore,input: InputStream,root: ByteArray,operation: RestoreOperation,
        fault: (Point,File)->Unit = {_,_->}): VaultGenerations.PreparedGeneration {
        var inputDelegated=false
        var secret=byteArrayOf()
        try {
            require(root.size==32);secret=root.copyOf();operation.check()
            store.generations.captureReceiptTarget(allowRepair=true).use {target->
                inputDelegated=true
                OwnedV4Input.capture(context,input,operation,fault).use {ciphertext->
                    val first=MetadataSink(operation) {fault(Point.PASS1_CLOSED,context.noBackupFilesDir)}
                    val summary=V4BackupReader.decode(secret,ciphertext.open(Point.PASS1_READ),first)
                    operation.check();fault(Point.PASS1_DONE,context.noBackupFilesDir);operation.check()
                    if(store.generations.isRepairTarget(target)) {
                        // Explicit current-cap repair compatibility: no target key or DB
                        // changes during preview. Healthy targets keep streamed preparation.
                        val attachments=mutableListOf<Attachment>()
                        val second=object:LogicalValidationSink {
                            override fun begin(snapshotId:String,vaultId:String,createdAt:String) {operation.check()}
                            override fun record(kind:Int,value:JSONObject) {operation.check()}
                            override fun receipt(descriptor:ReceiptDescriptor,bytes:ByteArray) {
                                operation.check();attachments+=Attachment(descriptor.id,descriptor.expenseId,descriptor.mediaType,descriptor.byteCount,descriptor.sha256,java.util.Base64.getEncoder().encodeToString(bytes))
                            }
                            override fun finishUncommitted(summary:LogicalSummary) {operation.check()}
                            override fun discard() {attachments.clear()}
                            override fun close() {fault(Point.PASS2_CLOSED,context.noBackupFilesDir);operation.check()}
                        }
                        val repeated=V4BackupReader.decode(secret,ciphertext.open(Point.PASS2_READ),second)
                        check(repeated==summary) {"Backup meaning changed between validation passes"}
                        operation.check();fault(Point.PASS2_DONE,context.noBackupFilesDir);operation.check()
                        ciphertext.close();operation.check()
                        return store.generations.finishRepair(target,first.snapshot().copy(attachments=attachments.toList()),operation)
                    }
                    store.generations.beginReceiptPreparation(first.snapshot(),first.receipts.toList(),operation,target).use {preparation->
                        val second=object:LogicalValidationSink {
                            override fun begin(snapshotId:String,vaultId:String,createdAt:String) {operation.check()}
                            override fun record(kind:Int,value:JSONObject) {operation.check()}
                            override fun receipt(descriptor:ReceiptDescriptor,bytes:ByteArray) {operation.check();preparation.append(descriptor.id,bytes)}
                            override fun finishUncommitted(summary:LogicalSummary) {operation.check()}
                            override fun discard() {preparation.close()}
                            override fun close() {fault(Point.PASS2_CLOSED,context.noBackupFilesDir);operation.check()}
                        }
                        val repeated=V4BackupReader.decode(secret,ciphertext.open(Point.PASS2_READ),second)
                        check(repeated==summary) {"Backup meaning changed between validation passes"}
                        operation.check();fault(Point.PASS2_DONE,context.noBackupFilesDir);operation.check()
                        // Real input closes, true EOF, both ciphertext digests, logical
                        // transcripts and original source cleanup precede candidate success.
                        ciphertext.close();operation.check()
                        return preparation.finish()
                    }
                }
            }
        } catch(error: Throwable) {
            if(!inputDelegated) try {input.close()} catch(cleanup:Throwable) {error.addSuppressed(cleanup)}
            operation.finish();throw error
        } finally {secret.fill(0)}
    }
    private class MetadataSink(private val operation: RestoreOperation,private val afterClose:()->Unit):LogicalValidationSink {
        private var snapshotId="";private var vaultId="";private var createdAt=""
        private val expenses=mutableListOf<Expense>()
        private val finance=FinanceData.limits.keys.associateWith {JSONArray()}
        val receipts=mutableListOf<VaultGenerations.ReceiptDeclaration>()
        private var complete=false
        override fun begin(snapshotId:String,vaultId:String,createdAt:String) {operation.check();this.snapshotId=snapshotId;this.vaultId=vaultId;this.createdAt=createdAt}
        override fun record(kind:Int,value:JSONObject) {
            operation.check()
            if(kind==8) expenses+=Expense.decode(value,3) else finance.getValue(FinanceData.limits.keys.elementAt(kind-2)).put(value)
        }
        override fun receipt(descriptor:ReceiptDescriptor,bytes:ByteArray) {
            operation.check();receipts+=VaultGenerations.ReceiptDeclaration(descriptor.id,descriptor.expenseId,descriptor.mediaType,descriptor.byteCount,descriptor.sha256)
        }
        override fun finishUncommitted(summary:LogicalSummary) {operation.check();complete=true}
        override fun close() {afterClose();operation.check()}
        override fun discard() {complete=false;expenses.clear();finance.values.forEach {while(it.length()>0) it.remove(it.length()-1)};receipts.clear()}
        fun snapshot():Snapshot {
            check(complete);operation.check()
            return Snapshot(vaultId,expenses.toList(),snapshotId,createdAt,finance=FinanceData.decode(JSONObject().apply {finance.forEach {(name,rows)->put(name,rows)}})).also {it.validate()}
        }
    }
}
