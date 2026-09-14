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

data class VaultUiState(val expenses: List<Expense> = emptyList(), val ready: Boolean = false, val busy: Boolean = false,
    val message: String? = null, val fatalError: Boolean = false, val nano: NanoState = NanoState.CHECKING, val finance: FinanceData = FinanceData(),
    val receiptLocale: String = "en-CA", val receiptOptimized: Boolean = false, val receipt: ReceiptDraft? = null, val receiptBytes: ByteArray? = null, val attachments: List<Attachment> = emptyList(), val categorySuggestion: String? = null, val restorePreview: Snapshot? = null, val restoreRevision: Long? = null, val restoreBinding: String? = null)

class PennyViewModel(application: Application, private val ai: ReceiptIntelligence, private val store: VaultStore = VaultStore(application)) : AndroidViewModel(application) {
    constructor(application: Application) : this(application,LocalIntelligence())
    private val mutex = Mutex()
    private val restoreOperation = java.util.concurrent.atomic.AtomicReference<RestoreOperation?>()
    private val receiptGeneration = java.util.concurrent.atomic.AtomicLong()
    private val mutable = MutableStateFlow(VaultUiState())
    val state = mutable.asStateFlow()
    private var cloudRestoreGuard: (suspend (RestoreOperation) -> Unit)?=null
    val drive = DriveController(application,store,viewModelScope, { snapshot,revision,guard -> restoreOperation.getAndSet(RestoreOperation())?.cancel();cloudRestoreGuard=guard;mutable.value=mutable.value.copy(restorePreview=snapshot,restoreRevision=revision) })
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
        val restore=RestoreOperation();restoreOperation.getAndSet(restore)?.cancel()
        operation {
        restore.check()
        cloudRestoreGuard=null;drive.cancel()
        val data = getApplication<Application>().contentResolver.openInputStream(uri).use {
            checkNotNull(it)
            val output = java.io.ByteArrayOutputStream()
            val buffer = ByteArray(8192)
            while (true) {
                val read = it.read(buffer)
                if (read == -1) break
                require(output.size() + read <= Backup.maxEnvelopeBytes) { "Backup exceeds size limit" }
                output.write(buffer, 0, read)
            }
            output.toByteArray()
        }
        val snapshot = Backup.decrypt(data, recovery)
        ReceiptImage.validate(snapshot.attachments)
        restore.check()
        mutable.value = mutable.value.copy(restorePreview = snapshot, restoreRevision = store.revision(), restoreBinding = store.restoreBinding())
    }
    }
    fun cancelRestore() { if(restoreOperation.get()?.cancel()==false) return; if(cloudRestoreGuard!=null) drive.cancel();cloudRestoreGuard=null;mutable.value = mutable.value.copy(restorePreview = null, restoreRevision = null, restoreBinding = null) }
    fun restore() {
        val preview = checkNotNull(mutable.value.restorePreview)
        val revision=checkNotNull(mutable.value.restoreRevision);val binding=mutable.value.restoreBinding
        val restore=checkNotNull(restoreOperation.get());val cloudCommit=cloudRestoreGuard
        if(!restore.start()) return
        operation(failureMessage = "Restore could not finish. Reopen your vault to verify its saved state, then open the backup again if needed.") {
            try {
                restore.check()
                if(cloudCommit!=null) cloudCommit(restore) else drive.localRestore { store.replace(preview, expectedRevision = revision, expectedBinding = checkNotNull(binding), operation = restore) }
                cloudRestoreGuard=null;drive.vaultRestored()
                refresh("Backup restored on this device")
            } finally {
                restore.finish()
                // Each confirmation consumes its preview, including failed attempts.
                cloudRestoreGuard=null
                mutable.value = mutable.value.copy(restorePreview = null, restoreRevision = null, restoreBinding = null)
            }
        }
    }

    override fun onCleared() { restoreOperation.get()?.cancel();drive.cancel(); ai.close(); store.close() }
}
