package ca.penny.offline

import android.app.Application
import android.net.Uri
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext

data class RestorePreviewSummary(val counts: Map<String,Int>, val expenseTotalMinor: Long, val version: Int) {
    companion object {
        fun from(snapshot: Snapshot) = RestorePreviewSummary(mapOf("expenses" to snapshot.expenses.size,"attachments" to snapshot.attachments.size)+snapshot.finance.domains().mapValues {it.value.size},Money.total(snapshot.expenses),3)
    }
}

data class VaultUiState(val expenses: List<Expense> = emptyList(), val ready: Boolean = false, val busy: Boolean = false,
    val message: String? = null, val fatalError: Boolean = false, val nano: NanoState = NanoState.CHECKING, val finance: FinanceData = FinanceData(),
    val receiptLocale: String = "en-CA", val receiptOptimized: Boolean = false, val receipt: ReceiptDraft? = null, val receiptBytes: ByteArray? = null, val attachments: List<Attachment> = emptyList(), val categorySuggestion: String? = null, val restoreSummary: RestorePreviewSummary? = null, val restorePreview: Snapshot? = null, val restoreRevision: Long? = null, val restoreBinding: String? = null)

class PennyViewModel(application: Application, private val ai: ReceiptIntelligence, private val store: VaultStore = VaultStore(application), private val restoreInput: (Uri)->java.io.InputStream = {checkNotNull(application.contentResolver.openInputStream(it))}) : AndroidViewModel(application) {
    constructor(application: Application) : this(application,LocalIntelligence())
    private val mutex = Mutex()
    private val restoreOperation = java.util.concurrent.atomic.AtomicReference<RestoreOperation?>()
    private val restoreLock=Any()
    private var candidate: VaultGenerations.PreparedGeneration?=null
    private var disposed=false
    private fun closeLater(value: VaultGenerations.PreparedGeneration?) { if(value!=null) kotlinx.coroutines.CoroutineScope(Dispatchers.IO).launch {mutex.withLock {runCatching {value.close()}}} }
    private fun clearPreview() {mutable.value=mutable.value.copy(restoreSummary=null,restorePreview=null,restoreRevision=null,restoreBinding=null)}
    private val receiptGeneration = java.util.concurrent.atomic.AtomicLong()
    private val mutable = MutableStateFlow(VaultUiState())
    val state = mutable.asStateFlow()
    private var cloudRestoreGuard: (suspend (RestoreOperation) -> Unit)?=null
    val drive = DriveController(application,store,viewModelScope, { snapshot,revision,guard -> synchronized(restoreLock) {
        check(!disposed && restoreOperation.get()?.cancel()!=false)
        closeLater(candidate);candidate=null;restoreOperation.set(RestoreOperation());cloudRestoreGuard=guard
        mutable.value=mutable.value.copy(restoreSummary=RestorePreviewSummary.from(snapshot),restorePreview=snapshot,restoreRevision=revision,restoreBinding=null)
    } })
    init {
        operation { refresh() }
        viewModelScope.launch { val status = ai.status(); mutable.value = mutable.value.copy(nano = status) }
    }
    private fun operation(failureMessage: String = "Unable to complete this action. Your saved expenses have been kept. Check the file, recovery key or device storage and try again.", block: suspend () -> Unit) { viewModelScope.launch {
        mutex.withLock {
            mutable.value = mutable.value.copy(busy = true, message = null)
            try { withContext(Dispatchers.IO) { block() } }
            catch (_: RestoreCancelled) { mutable.value = mutable.value.copy(message = "Restore cancelled before replacement.") }
            catch (_: Exception) { mutable.value = mutable.value.copy(message = failureMessage, fatalError = !mutable.value.ready) }
            finally { mutable.value = mutable.value.copy(busy = false) }
        }
    } }
    fun clearMessage() { mutable.value = mutable.value.copy(message = null) }
    private fun refresh(message: String? = null) { val snapshot = store.snapshot(); mutable.value = mutable.value.copy(expenses=snapshot.expenses,attachments=snapshot.attachments,finance=snapshot.finance,ready=true,fatalError=false,message=message) }
    fun saveFinance(record: FinanceRecord, done: ()->Unit) = operation { store.saveFinance(record); refresh("Saved on this device"); withContext(Dispatchers.Main) { done() } }
    fun deleteFinance(record: FinanceRecord, done: ()->Unit) = operation { store.saveFinance(record,true); refresh("Record removed"); withContext(Dispatchers.Main) { done() } }
    fun postRecurring(templateId: String,date: String,done: ()->Unit) = operation { store.postRecurring(templateId,date); refresh("Expense recorded once"); withContext(Dispatchers.Main) { done() } }
    fun postIncome(sourceId: String,date: String,receivedDate: String,amount: Long,note: String,done: ()->Unit) = operation { store.postIncome(sourceId,date,receivedDate,amount,note); refresh("Received income recorded once"); withContext(Dispatchers.Main) { done() } }
    fun exportCsv(uri: Uri) = operation { val data = FinanceMath.csv(store.snapshot()); getApplication<Application>().contentResolver.openOutputStream(uri,"wt").use { output -> checkNotNull(output); output.write(data); output.flush() }; mutable.value=mutable.value.copy(message="Expense CSV saved to your chosen file") }
    fun consumeReceipt() { receiptGeneration.incrementAndGet(); mutable.value = mutable.value.copy(receipt = null, receiptBytes = null, receiptOptimized = false, categorySuggestion = null) }
    fun save(expense: Expense, done: () -> Unit) = operation {
        val saved = store.save(expense, mutable.value.receiptBytes?.let { listOf(Attachment.fromBytes(expense.id, it)) } ?: emptyList())
        mutable.value = mutable.value.copy(expenses = saved.expenses, attachments = saved.attachments, finance = saved.finance, message = "Saved on this device")
        withContext(Dispatchers.Main) { done() }
    }
    fun delete(expense: Expense) = operation {
        val saved = store.delete(expense.id)
        mutable.value = mutable.value.copy(expenses = saved.expenses, attachments = saved.attachments, finance = saved.finance, message = "Expense deleted")
    }
    fun deleteReceipt(id: String) = operation { store.deleteAttachment(id); mutable.value = mutable.value.copy(attachments = store.attachments(), message = "Receipt removed") }
    fun setReceiptLocale(locale: String) {
        require(locale in listOf("en-CA","fr-CA"))
        receiptGeneration.incrementAndGet()
        val draft=mutable.value.receipt
        mutable.value=mutable.value.copy(receiptLocale=locale,categorySuggestion=null,receipt=draft?.let { parseText(it.sourceText,locale) })
    }
    private fun parseText(text: String, locale: String): ReceiptDraft = try { ReceiptParser.draft(text,locale) }
        catch(e: Exception) { ReceiptDraft(text,locale,reasons=listOf(e.message ?: "parse_failed")) }
    fun scan(uri: Uri) = scanPrepared { ReceiptImage.prepare(getApplication(),uri) }
    fun scanCamera(bitmap: android.graphics.Bitmap,rotation: Int) = scanPrepared { try { ReceiptImage.prepareBitmap(bitmap,rotation) } finally { bitmap.recycle() } }
    private fun scanPrepared(prepare: ()->ReceiptImage.Prepared) {
        val generation=receiptGeneration.incrementAndGet()
        val locale=mutable.value.receiptLocale
        operation {
            val image=prepare()
            if(receiptGeneration.get() != generation) return@operation
            mutable.value=mutable.value.copy(receipt=ReceiptDraft("",locale),receiptBytes=image.bytes,receiptOptimized=image.optimized,categorySuggestion=null)
            val draft=try { parseText(ai.text(image.bytes),locale) } catch(_: Exception) { ReceiptDraft("",locale,reasons=listOf("ocr_failed")) }
            if(receiptGeneration.get()==generation) mutable.value=mutable.value.copy(receipt=draft)
        }
    }
    fun suggest() {
        val draft=mutable.value.receipt ?: return
        val generation=receiptGeneration.get()
        operation {
            val proposal=runCatching { ai.proposal(draft) }.getOrNull()
            if(receiptGeneration.get()==generation && mutable.value.receipt==draft) {
                mutable.value=mutable.value.copy(categorySuggestion=proposal?.category,message=if(proposal?.category==null) "On-device proposal unavailable or ungrounded. Your receipt and draft are unchanged; choose a category manually." else "Category proposed on this device. Review before saving.")
            }
        }
    }
    fun prepareBackup(done: (String)->Unit) = operation {
        val key=try { RecoveryKeyStore(getApplication()).load() ?: Backup.recoveryKey() } catch(_: Exception) { "" }
        withContext(Dispatchers.Main) { done(key) }
    }
    fun confirmBackup(key: String,entered: String,done: (String?)->Unit) = operation {
        val error=runCatching { synchronized(CloudCoordinator.lock) {drive.cancel();RecoveryKeyStore(getApplication()).confirm(key,entered)} }.exceptionOrNull()?.message
        if(error==null) drive.recoveryUpdated()
        withContext(Dispatchers.Main) { done(error) }
    }
    fun export(uri: Uri, recovery: String) = operation {
        BackupExporter(getApplication()).export(store.snapshot(),recovery,uri)
        mutable.value=mutable.value.copy(message="Encrypted file exported and read back successfully. This confirms the file only; it does not confirm a cloud upload. Keep your recovery key separately.")
    }
    fun preview(uri: Uri, recovery: String) {
        val restore=RestoreOperation()
        synchronized(restoreLock) {
            if(disposed || restoreOperation.get()?.cancel()==false) return
            closeLater(candidate);candidate=null;cloudRestoreGuard=null;clearPreview();mutable.value=mutable.value.copy(message=null);restoreOperation.set(restore)
        }
        operation(failureMessage="Backup preview failed. Check the file and recovery key. V4 import requires an unlocked existing vault; no replacement was confirmed.") {
            var prepared: VaultGenerations.PreparedGeneration?=null
            try {
                restore.check();drive.cancel()
                val original=restoreInput(uri) // Provider open and all reads run on IO.
                var delegated=false
                try {
                    val input=java.io.PushbackInputStream(original,8)
                    val prefix=ByteArray(8);var count=0
                    while(count<8) {restore.check();val n=input.read(prefix,count,8-count);if(n<0) break;check(n>0);count+=n}
                    input.unread(prefix,0,count)
                    val magic=byteArrayOf(80,78,89,66,75,80,52,10)
                    if(count==8 && prefix.contentEquals(magic)) {
                        val key=Backup.key(recovery)
                        try {delegated=true;prepared=store.prepareV4(input,key,restore)} finally {key.fill(0)}
                        val summary=checkNotNull(prepared).metadata
                        synchronized(restoreLock) {
                            restore.check();check(!disposed && restoreOperation.get()===restore)
                            candidate=prepared;prepared=null
                            mutable.value=mutable.value.copy(restoreSummary=RestorePreviewSummary(summary.counts.toMap(),summary.expenseTotalMinor,4))
                        }
                    } else {
                        // Reserved/partial v4 prefix cannot be interpreted as a legacy envelope.
                        check(count==0 || !prefix.copyOfRange(0,minOf(count,7)).contentEquals(magic.copyOfRange(0,minOf(count,7))))
                        val data=java.io.ByteArrayOutputStream();val buffer=ByteArray(8192)
                        delegated=true
                        input.use {while(true) {restore.check();val n=it.read(buffer);if(n<0) break;check(n>0);require(data.size()+n<=Backup.maxEnvelopeBytes);data.write(buffer,0,n)}}
                        val bytes=data.toByteArray()
                        val snapshot=try {Backup.decrypt(bytes,recovery)} finally {bytes.fill(0);buffer.fill(0)}
                        ReceiptImage.validate(snapshot.attachments);restore.check()
                        val revision=store.revision();val binding=store.restoreBinding()
                        synchronized(restoreLock) {
                            restore.check();check(!disposed && restoreOperation.get()===restore)
                            mutable.value=mutable.value.copy(restoreSummary=RestorePreviewSummary.from(snapshot),restorePreview=snapshot,restoreRevision=revision,restoreBinding=binding)
                        }
                    }
                } finally {if(!delegated) original.close()}
            } finally {prepared?.close()}
        }
    }
    fun cancelRestore() = synchronized(restoreLock) {
        if(restoreOperation.get()?.cancel()==false) return@synchronized
        if(cloudRestoreGuard!=null) drive.cancel();cloudRestoreGuard=null
        closeLater(candidate);candidate=null;clearPreview()
    }
    fun restore() {
        val restore: RestoreOperation;val owned: VaultGenerations.PreparedGeneration?;val preview: Snapshot?
        val revision: Long?;val binding: String?;val cloudCommit: (suspend (RestoreOperation)->Unit)?
        synchronized(restoreLock) {
            restore=restoreOperation.get() ?: return
            if(mutable.value.restoreSummary==null || !restore.start()) return
            owned=candidate;preview=mutable.value.restorePreview
            revision=mutable.value.restoreRevision;binding=mutable.value.restoreBinding;cloudCommit=cloudRestoreGuard
        }
        operation(failureMessage = "Restore could not finish. Reopen your vault to verify its saved state, then open the backup again if needed.") {
            try {
                synchronized(restoreLock) {if(candidate===owned) candidate=null}
                restore.check()
                if(cloudCommit!=null) cloudCommit(restore)
                else drive.localRestore {
                    if(owned!=null) store.installPrepared(owned)
                    else store.replace(checkNotNull(preview),expectedRevision=checkNotNull(revision),expectedBinding=checkNotNull(binding),operation=restore)
                }
                drive.vaultRestored();refresh("Backup restored on this device")
            } finally {
                try {owned?.close()} finally {
                    restore.finish()
                    synchronized(restoreLock) {if(restoreOperation.get()===restore) {cloudRestoreGuard=null;clearPreview()}}
                }
            }
        }
    }

    override fun onCleared() {
        val abandoned=synchronized(restoreLock) {disposed=true;restoreOperation.get()?.cancel();val value=candidate;candidate=null;clearPreview();value}
        drive.cancel();ai.close()
        // A cancelled blocking IO operation still owns its store until its mutex exits.
        kotlinx.coroutines.CoroutineScope(Dispatchers.IO).launch {mutex.withLock {try {abandoned?.close()} finally {store.close()}}}
    }
}
