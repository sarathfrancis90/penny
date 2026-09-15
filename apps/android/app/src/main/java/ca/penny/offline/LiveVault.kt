package ca.penny.offline

/** Display metadata only. This value grants no file or key authority. */
data class ReceiptInfo(val id:String,val expenseId:String,val mediaType:String,val byteCount:Long,val sha256:String)

/** Distinct from the portable Snapshot: cannot be supplied to a compatibility mutation. */
internal class LiveVaultState internal constructor(val expenses:List<Expense>,val finance:FinanceData,
    val receipts:List<ReceiptInfo>,internal val source:Any)

/** One selected receipt, resolved by the storage owner. Borrowed bytes are wiped on return. */
internal interface OwnedReceipt : java.io.Closeable {
    fun <T> withBytes(block:(ByteArray)->T):T
}
