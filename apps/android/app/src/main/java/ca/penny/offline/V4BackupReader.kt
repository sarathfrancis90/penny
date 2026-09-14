package ca.penny.offline

import ca.penny.v4frameprobe.FrameCancellation
import ca.penny.v4frameprobe.LogicalCodec
import ca.penny.v4frameprobe.LogicalSummary
import ca.penny.v4frameprobe.LogicalValidationSink
import ca.penny.v4frameprobe.ReceiptDescriptor
import java.io.InputStream
import org.json.JSONObject

/** Internal logical admission only. Sink must remain isolated; no preview,
 * candidate installation or portable backup-capacity acceptance is implied.
 * Owns input/sink; caller owns and wipes the recovery root. */
internal object V4BackupReader {
    fun decode(root: ByteArray, input: InputStream, sink: LogicalValidationSink,
        cancellation: FrameCancellation = FrameCancellation()): LogicalSummary =
        LogicalCodec.decode(root,input,CurrentLimits(sink),cancellation)

    private class CurrentLimits(private val sink: LogicalValidationSink) : LogicalValidationSink {
        private val domains=FinanceData.limits.keys.toList()+"expenses"
        private val counts=mutableMapOf<String,Int>()
        private var receiptCount=0
        private var receiptBytes=0L
        private var metadataBytes=0L
        override fun begin(snapshotId: String,vaultId: String,createdAt: String)=sink.begin(snapshotId,vaultId,createdAt)
        override fun record(kind: Int,value: JSONObject) {
            val domain=domains[kind-2]
            val count=(counts[domain] ?: 0)+1
            require(count <= if(domain=="expenses") 10000 else FinanceData.limits.getValue(domain)) {"Current $domain capacity exceeded"}
            metadataBytes=Math.addExact(metadataBytes,9L+StrictJson.bytes(value).size)
            require(metadataBytes<=Backup.maxPlaintextBytes) {"Current metadata capacity exceeded"}
            counts[domain]=count // Finish all guard state before a sink may mutate the detached JSON.
            sink.record(kind,value)
        }
        override fun receipt(descriptor: ReceiptDescriptor,bytes: ByteArray) {
            require(++receiptCount<=100 && descriptor.byteCount<=Attachment.maxBytes)
            receiptBytes=Math.addExact(receiptBytes,descriptor.byteCount)
            require(receiptBytes<=Attachment.maxTotalBytes) {"Current receipt capacity exceeded"}
            sink.receipt(descriptor,bytes)
        }
        override fun finishUncommitted(summary: LogicalSummary) {
            require(summary.policyMetadataBytes<=Backup.maxPlaintextBytes && summary.receiptBytes==receiptBytes)
            require(summary.counts.getValue("attachments")==receiptCount.toLong())
            sink.finishUncommitted(summary)
        }
        override fun discard()=sink.discard()
        override fun close()=sink.close()
    }
}
