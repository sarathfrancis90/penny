package ca.penny.offline

import android.content.Context
import android.database.sqlite.SQLiteDatabase
import java.io.Closeable

/** Stable app API backed by authenticated local generations and detached receipt files. */
class VaultStore(private val context: Context, databaseName: String = "penny-vault.db", alias: String = "penny.offline.vault.v1") : Closeable {
    private val legacy = LegacyVaultRows(context,databaseName,alias)
    val writableDatabase: SQLiteDatabase get() = legacy.writableDatabase
    val readableDatabase: SQLiteDatabase get() = legacy.readableDatabase
    internal val generations = VaultGenerations(context,{writableDatabase},alias,legacy::snapshot,legacy::revision,legacy::incarnation)
    fun all(): List<Expense> = snapshot().expenses
    fun attachments(): List<Attachment> = snapshot().attachments
    fun finance(): FinanceData = snapshot().finance
    fun snapshot(): Snapshot = generations.snapshot()
    fun vaultId(): String = generations.vaultId()
    fun revision(): Long = generations.revision()
    fun incarnation(): String = generations.incarnation()
    fun cloudCheckpoint(afterSnapshot: () -> Unit = {}): Triple<Snapshot,Long,String> = generations.checkpoint(afterSnapshot)
    fun restoreBinding(): String = generations.binding()
    fun replace(snapshot: Snapshot, expectedRevision: Long? = null, expectedBinding: String? = null, operation: RestoreOperation = RestoreOperation()) = generations.replace(snapshot,expectedRevision,expectedBinding,operation)
    internal fun beginReceiptPreparation(metadata: Snapshot, receipts: List<VaultGenerations.ReceiptDeclaration>, operation: RestoreOperation = RestoreOperation()) = generations.beginReceiptPreparation(metadata,receipts,operation)
    internal fun installPrepared(candidate: VaultGenerations.PreparedGeneration) = generations.installPrepared(candidate)
    internal fun exportV4(root: ByteArray, operation: RestoreOperation = RestoreOperation(),
        fault: (V4Export.Point,java.io.File)->Unit = {_,_->}) = V4Export.create(context,this,root,operation,fault)
    internal fun prepareV4(input: java.io.InputStream, root: ByteArray, operation: RestoreOperation = RestoreOperation(),
        fault: (V4Restore.Point,java.io.File)->Unit = {_,_->}): VaultGenerations.PreparedGeneration = V4Restore.prepare(context,this,input,root,operation,fault)
    internal fun restoreV4(input: java.io.InputStream, root: ByteArray, operation: RestoreOperation = RestoreOperation(),
        fault: (V4Restore.Point,java.io.File)->Unit = {_,_->}) {
        try {prepareV4(input,root,operation,fault).use {installPrepared(it)}} finally {operation.finish()}
    }
    fun save(expense: Expense, receipts: List<Attachment> = emptyList()): Snapshot = generations.mutate { current ->
        require(receipts.all {it.expenseId==expense.id})
        current.copy(expenses=current.expenses.filterNot {it.id==expense.id}+expense,attachments=current.attachments+receipts)
    }
    fun delete(id: String): Snapshot {Wire.requireId(id);return generations.mutate {it.copy(expenses=it.expenses.filterNot {row->row.id==id},attachments=it.attachments.filterNot {row->row.expenseId==id})}}
    fun deleteAttachment(id: String) {Wire.requireId(id);generations.mutate {it.copy(attachments=it.attachments.filterNot {row->row.id==id})}}
    private fun changedFinance(current: FinanceData, record: FinanceRecord, deleting: Boolean): FinanceData {
        fun <T:FinanceRecord> changed(rows: List<T>, value: T) = rows.filterNot {it.id==value.id}+if(deleting) emptyList() else listOf(value)
        return when(record) {
            is Budget -> current.copy(budgets=changed(current.budgets,record))
            is IncomeSource -> {require(!deleting);current.copy(incomeSources=changed(current.incomeSources,record))}
            is IncomeEntry -> current.copy(incomeEntries=changed(current.incomeEntries,record))
            is SavingsGoal -> {require(!deleting);current.copy(savingsGoals=changed(current.savingsGoals,record))}
            is SavingsEntry -> current.copy(savingsEntries=changed(current.savingsEntries,record))
            is RecurringExpense -> {require(!deleting);current.copy(recurringExpenses=changed(current.recurringExpenses,record))}
            else -> error("Unsupported finance record")
        }
    }
    fun saveFinance(record: FinanceRecord, deleting: Boolean = false) {generations.mutate {it.copy(finance=changedFinance(it.finance,record,deleting))}}
    fun postRecurring(templateId: String, date: String): Expense {
        Wire.requireId(templateId);Wire.requireDate(date);var result: Expense? = null
        generations.mutate {current ->
            result=current.expenses.firstOrNull {it.recurringTemplateId==templateId && it.recurringOccurrenceDate==date}
            if(result!=null) current else {
                val t=current.finance.recurringExpenses.first {it.id==templateId}
                require(t.isActive && date in FinanceMath.occurrences(t.schedule,date,date)) {"This occurrence is no longer due"}
                val row=Expense(merchant=t.merchant,amountMinor=t.amountMinor,expenseDate=date,category=t.category,note=t.note,description=t.description,recurringTemplateId=t.id,recurringOccurrenceDate=date)
                result=row;current.copy(expenses=current.expenses+row)
            }
        }
        return checkNotNull(result)
    }
    fun postIncome(sourceId: String, date: String, receivedDate: String, amount: Long, note: String): IncomeEntry {
        Wire.requireId(sourceId);Wire.requireDate(date);var result: IncomeEntry? = null
        generations.mutate {current ->
            result=current.finance.incomeEntries.firstOrNull {it.sourceId==sourceId && it.occurrenceDate==date}
            if(result!=null) current else {
                val source=current.finance.incomeSources.first {it.id==sourceId}
                require(source.isActive && date in FinanceMath.occurrences(source.schedule,date,date,source.isRecurring)) {"This income occurrence is no longer due"}
                val row=IncomeEntry(sourceId=sourceId,receivedDate=receivedDate,amountMinor=amount,note=note,occurrenceDate=date)
                result=row;current.copy(finance=changedFinance(current.finance,row,false))
            }
        }
        return checkNotNull(result)
    }
    override fun close() = legacy.close()
}
