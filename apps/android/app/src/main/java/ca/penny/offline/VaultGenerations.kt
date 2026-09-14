package ca.penny.offline

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import org.json.JSONArray
import org.json.JSONObject
import java.security.KeyStore
import java.security.SecureRandom
import java.util.Base64
import java.util.concurrent.ConcurrentHashMap
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec

/** Local schema 4. Every entry point holds the database lease; no key/state cache. */
internal class VaultGenerations(private val context: Context, private val db: () -> SQLiteDatabase,
    private val alias: String, private val legacy: () -> Snapshot,
    private val legacyRevision: () -> Long, private val legacyIncarnation: () -> String) {
    companion object {
        private val locks = ConcurrentHashMap<String, Any>()
        private val candidatePins = ConcurrentHashMap<String,MutableSet<String>>()
        private val receiptReadPins = ConcurrentHashMap<String,MutableMap<Pair<String,String>,Int>>()
        fun create(db: SQLiteDatabase) {
            db.execSQL("CREATE TABLE IF NOT EXISTS vault_generations (id TEXT PRIMARY KEY NOT NULL, wrappedKey BLOB NOT NULL, sealedHeader BLOB NOT NULL)")
            db.execSQL("CREATE TABLE IF NOT EXISTS vault_rows (generationId TEXT NOT NULL, domain TEXT NOT NULL, id TEXT NOT NULL, sealed BLOB NOT NULL, PRIMARY KEY(generationId,domain,id))")
            db.execSQL("CREATE TABLE IF NOT EXISTS vault_receipts (id TEXT PRIMARY KEY NOT NULL, owner TEXT NOT NULL, sealed BLOB NOT NULL)")
        }
    }
    internal enum class Point { FILES_READY, ROWS_READY, POINTER_COMMITTED, REOPENED, SNAPSHOT_HYDRATION, CANDIDATE_INPUT, CANDIDATE_VERIFIED, CANDIDATE_CLOSED, CANDIDATE_INSTALL_READY, LIVE_EDIT_READY, LIVE_EDIT_WRITTEN, REPAIR_KEY_READY, REPAIR_KEY_CREATING }
    internal var fault: (Point) -> Unit = {}
    private val domains = listOf("expenses", "attachments") + FinanceData.limits.keys
    private fun <T> locked(block: () -> T): T = synchronized(locks.getOrPut(db().path) { Any() }, block)
    private fun <T> transaction(block: () -> T): T {
        val database = db(); database.beginTransaction()
        try { return block().also { database.setTransactionSuccessful() } } finally { database.endTransaction() }
    }
    private fun get(name: String): String? = db().rawQuery("SELECT value FROM metadata WHERE key=?", arrayOf(name)).use { if(it.moveToFirst()) it.getString(0) else null }
    private fun put(name: String, value: String) { db().insertWithOnConflict("metadata", null, ContentValues().apply {put("key",name);put("value",value)}, SQLiteDatabase.CONFLICT_REPLACE).also {check(it != -1L)} }
    private fun device(create: Boolean = false): SecretKey {
        val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (store.getKey(alias,null) as? SecretKey)?.let {return it}
        check(create) {"The device key is missing. Restore a verified backup."}
        return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES,"AndroidKeyStore").apply {
            init(KeyGenParameterSpec.Builder(alias,KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).setKeySize(256).setRandomizedEncryptionRequired(true).build())
        }.generateKey()
    }
    private fun crypt(bytes: ByteArray, key: SecretKey, domain: String, encrypt: Boolean): ByteArray {
        val cipher=Cipher.getInstance("AES/GCM/NoPadding")
        if(encrypt) cipher.init(Cipher.ENCRYPT_MODE,key) else {
            require(bytes.size>=28); cipher.init(Cipher.DECRYPT_MODE,key,GCMParameterSpec(128,bytes,0,12))
        }
        cipher.updateAAD("PENNY-LOCAL-GENERATIONS:1:$alias:$domain".toByteArray(Charsets.UTF_8))
        return if(encrypt) cipher.iv+cipher.doFinal(bytes) else cipher.doFinal(bytes,12,bytes.size-12)
    }
    private fun seal(j: JSONObject, key: SecretKey, aad: String) = StrictJson.bytes(j).let { plain -> try {crypt(plain,key,aad,true)} finally {plain.fill(0)} }
    private fun open(bytes: ByteArray, key: SecretKey, aad: String, max: Int = 100_000): JSONObject {
        require(bytes.size in 28..max)
        val plain=crypt(bytes,key,aad,false);return try {StrictJson.objectFrom(plain)} finally {plain.fill(0)}
    }
    private data class Previous(val id: String, val revision: Long, val incarnation: String)
    private data class State(val active: String, val previous: Previous?, val pending: Boolean, val revision: Long, val incarnation: String) {
        fun json()=JSONObject().put("format",1).put("active",active).put("previous",previous?.let {JSONObject().put("id",it.id).put("revision",it.revision).put("incarnation",it.incarnation)} ?: JSONObject.NULL).put("pending",pending).put("revision",revision).put("incarnation",incarnation)
    }
    private fun state(): State {
        val text=checkNotNull(get("activeState")) {"Missing active generation"};require(text.length<=4096)
        val j=open(Base64.getDecoder().decode(text),device(),"state",4096)
        Wire.exactKeys(j,"format","active","previous","pending","revision","incarnation");require(Wire.integer(j,"format")==1L && j.get("pending") is Boolean)
        val active=Wire.string(j,"active").also(Wire::requireId)
        val previous=if(j.isNull("previous")) null else j.getJSONObject("previous").let {
            Wire.exactKeys(it,"id","revision","incarnation");val revision=Wire.integer(it,"revision");require(revision>=0)
            Previous(Wire.string(it,"id").also(Wire::requireId),revision,Wire.string(it,"incarnation").also(Wire::requireId))
        }
        val rev=Wire.integer(j,"revision");require(rev>=0)
        return State(active,previous,j.getBoolean("pending"),rev,Wire.string(j,"incarnation").also(Wire::requireId))
    }
    private fun setState(state: State) {
        put("generationFormat","1")
        put("activeState",Base64.getEncoder().encodeToString(seal(state.json(),device(),"state")))
        put("revision",state.revision.toString());put("incarnation",state.incarnation)
    }
    private fun key(id: String): ByteArray {
        Wire.requireId(id)
        val bytes=db().rawQuery("SELECT wrappedKey FROM vault_generations WHERE id=?",arrayOf(id)).use {check(it.moveToFirst());it.getBlob(0)}
        require(bytes.size==60)
        return crypt(bytes,device(),"key:$id",false).also {require(it.size==32)}
    }
    private fun descriptor(j: JSONObject): LocalReceiptBlob.Descriptor {
        Wire.exactKeys(j,"vaultId","generationId","id","expenseId","mediaType","byteCount","sha256")
        return LocalReceiptBlob.Descriptor(Wire.string(j,"vaultId"),Wire.string(j,"generationId"),Wire.string(j,"id"),Wire.string(j,"expenseId"),Wire.string(j,"mediaType"),Wire.integer(j,"byteCount"),Wire.string(j,"sha256"))
    }
    private fun json(d: LocalReceiptBlob.Descriptor)=JSONObject().put("vaultId",d.vaultId).put("generationId",d.generationId).put("id",d.id).put("expenseId",d.expenseId).put("mediaType",d.mediaType).put("byteCount",d.byteCount).put("sha256",d.sha256)
    private fun receiptMetadata(d: LocalReceiptBlob.Descriptor) = JSONObject().put("id",d.id).put("expenseId",d.expenseId)
        .put("mediaType",d.mediaType).put("byteCount",d.byteCount).put("sha256",d.sha256)
    private fun digest(snapshot: Snapshot): String = digest(snapshot.vaultId,snapshot.expenses,
        snapshot.attachments.map {it.id to it.json().apply {remove("dataBase64")}},snapshot.finance)
    private fun digest(vaultId: String, expenses: List<Expense>, receipts: List<Pair<String,JSONObject>>, finance: FinanceData): String {
        val digest=java.security.MessageDigest.getInstance("SHA-256")
        fun add(domain: String, id: String, bytes: ByteArray) {digest.update("$domain:$id:${bytes.size}:".toByteArray());digest.update(bytes)}
        add("vault","",vaultId.toByteArray())
        expenses.sortedBy {it.id}.forEach {add("expenses",it.id,StrictJson.bytes(it.json()))}
        receipts.sortedBy {it.first}.forEach {(id,json)->add("attachments",id,StrictJson.bytes(json))}
        finance.domains().forEach {(domain,rows)-> rows.sortedBy {it.id}.forEach {add(domain,it.id,StrictJson.bytes(it.json()))}}
        return digest.digest().joinToString("") {"%02x".format(it.toInt() and 255)}
    }
    /** Verified summary only: no rows, receipt handles, plaintext or reusable admission capability. */
    internal data class VerifiedMetadata(val vaultId: String, val snapshotId: String, val createdAt: String,
        val counts: Map<String,Int>, val expenseTotalMinor: Long, val receiptBytes: Long, val digest: String)
    /** Explicit compatibility adapter; receipt buffers remain borrowed from consumeReopened. */
    private class SnapshotHydration {
        private val attachments=mutableListOf<Attachment>()
        var result: Snapshot? = null
            private set
        fun receipt(d: LocalReceiptBlob.Descriptor, bytes: ByteArray) {
            attachments += Attachment(d.id,d.expenseId,d.mediaType,d.byteCount,d.sha256,Base64.getEncoder().encodeToString(bytes))
        }
        fun finish(metadata: VerifiedMetadata, expenses: List<Expense>, finance: FinanceData) {
            result=Snapshot(metadata.vaultId,expenses,metadata.snapshotId,metadata.createdAt,attachments,finance).also {it.validate()}
        }
    }
    private fun header(id: String, key: SecretKey): JSONObject {
        val bytes=db().rawQuery("SELECT sealedHeader FROM vault_generations WHERE id=?",arrayOf(id)).use {check(it.moveToFirst());it.getBlob(0)}
        return open(bytes,key,"header:$id").also {
            Wire.exactKeys(it,"format","generationId","vaultId","snapshotId","createdAt","digest")
            require(Wire.integer(it,"format")==1L && Wire.string(it,"generationId")==id)
            listOf("generationId","vaultId","snapshotId").forEach {field->Wire.requireId(Wire.string(it,field))};Wire.requireInstant(Wire.string(it,"createdAt"))
            require(Regex("[0-9a-f]{64}").matches(Wire.string(it,"digest")))
        }
    }
    private fun setHeader(id: String, raw: ByteArray, snapshot: Snapshot, membership: String = digest(snapshot)) {
        val h=JSONObject().put("format",1).put("generationId",id).put("vaultId",snapshot.vaultId).put("snapshotId",snapshot.snapshotId).put("createdAt",snapshot.createdAt).put("digest",membership)
        check(db().update("vault_generations",ContentValues().apply {put("sealedHeader",seal(h,SecretKeySpec(raw,"AES"),"header:$id"))},"id=?",arrayOf(id))==1)
    }
    private fun read(id: String): Snapshot {
        fault(Point.SNAPSHOT_HYDRATION)
        val hydration=SnapshotHydration()
        readVerified(id,hydration)
        return checkNotNull(hydration.result)
    }
    private fun readVerified(id: String, hydration: SnapshotHydration? = null,
        capture: ((Snapshot,List<LocalReceiptBlob.Descriptor>,ByteArray,VerifiedMetadata)->Unit)? = null): VerifiedMetadata {
        val raw=key(id)
        try {
            val secret=SecretKeySpec(raw,"AES");val h=header(id,secret)
            val expenses=mutableListOf<Expense>();val descriptors=mutableListOf<LocalReceiptBlob.Descriptor>();val finance=JSONObject()
            val arrays=FinanceData.limits.keys.associateWith {JSONArray()}
            db().rawQuery("SELECT domain,id,length(sealed),sealed FROM vault_rows WHERE generationId=? ORDER BY domain,id",arrayOf(id)).use {rows ->
                var count=0
                while(rows.moveToNext()) {
                    check(++count <= 10_100+FinanceData.limits.values.sum())
                    val domain=rows.getString(0);require(domain in domains);val rowId=rows.getString(1).also(Wire::requireId)
                    require(rows.getInt(2) in 28..100_000)
                    val j=open(rows.getBlob(3),secret,"row:$id:$domain:$rowId");require(Wire.string(j,"id")==rowId)
                    when(domain) {"expenses" -> expenses += Expense.decode(j,3);"attachments" -> descriptors += descriptor(j);else -> checkNotNull(arrays[domain]).put(j)}
                }
            }
            arrays.forEach {(name,array)->finance.put(name,array)}
            val decodedFinance=FinanceData.decode(finance)
            val sortedExpenses=expenses.sortedWith(compareByDescending<Expense>{it.expenseDate}.thenByDescending{it.createdAt}.thenBy{it.id})
            // Reuse all existing expense/finance/identity semantics without constructing receipt base64.
            Snapshot(Wire.string(h,"vaultId"),sortedExpenses,Wire.string(h,"snapshotId"),Wire.string(h,"createdAt"),finance=decodedFinance).validate()
            require(descriptors.size<=100) {"Unsupported receipt count"}
            require(descriptors.map {it.id}.toSet().size==descriptors.size) {"Duplicate receipt IDs"}
            val owners=expenses.map {it.id}.toSet()
            require(descriptors.all {it.expenseId in owners}) {"Receipt owner is missing"}
            val receiptBytes=descriptors.sumOf {it.byteCount}
            require(receiptBytes<=Attachment.maxTotalBytes) {"Receipts exceed the 8 MiB vault limit"}
            val membership=digest(Wire.string(h,"vaultId"),expenses,descriptors.map {it.id to receiptMetadata(it)},decodedFinance)
            require(membership==Wire.string(h,"digest")) {"Generation membership changed"}
            descriptors.groupBy {it.generationId}.forEach {(group,items) ->
                require(items.all {it.vaultId==Wire.string(h,"vaultId")})
                LocalReceiptBlob.consumeReopened(context,raw,Wire.string(h,"vaultId"),group,items) { d,bytes ->
                    hydration?.receipt(d,bytes)
                }
            }
            val counts=linkedMapOf("expenses" to expenses.size,"attachments" to descriptors.size)
            decodedFinance.domains().forEach {(domain,rows)->counts[domain]=rows.size}
            val metadata=VerifiedMetadata(Wire.string(h,"vaultId"),Wire.string(h,"snapshotId"),Wire.string(h,"createdAt"),
                java.util.Collections.unmodifiableMap(counts),Money.total(expenses),receiptBytes,membership)
            hydration?.finish(metadata,sortedExpenses,decodedFinance)
            capture?.invoke(Snapshot(metadata.vaultId,sortedExpenses,metadata.snapshotId,metadata.createdAt,finance=decodedFinance),descriptors.toList(),raw,metadata)
            return metadata
        } finally {raw.fill(0)}
    }
    /** Worker-only bounded lease: holds the DB lock/transaction through emission.
     * No cross-operation cache; ordinary writes wait until the callback returns. */
    internal fun <T> withVerifiedExportSource(block: (ExportSource)->T): T = locked {
        CandidateNamespace().use {namespace -> transaction {
            namespace.check();val before=state();check(!before.pending)
            val token=checkNotNull(get("activeState"))
            val envelope=db().rawQuery("SELECT wrappedKey FROM vault_generations WHERE id=?",arrayOf(before.active)).use {check(it.moveToFirst());CloudContract.sha256(it.getBlob(0))}
            var result: T? = null
            readVerified(before.active,capture={body,descriptors,raw,metadata ->
                requireReceiptCapacity(body,descriptors)
                ExportSource(body,descriptors,raw,metadata).use {source -> result=block(source)}
            })
            // Re-fetch the existing device key and active envelope, including
            // same-thread reentrant edits; never return bytes for changed source.
            namespace.check();check(state()==before && get("activeState")==token)
            key(before.active).fill(0)
            check(db().rawQuery("SELECT wrappedKey FROM vault_generations WHERE id=?",arrayOf(before.active)).use {check(it.moveToFirst());CloudContract.sha256(it.getBlob(0))}==envelope)
            @Suppress("UNCHECKED_CAST")
            (result as T)
        }}
    }
    internal inner class ExportSource internal constructor(val body: Snapshot,
        val descriptors: List<LocalReceiptBlob.Descriptor>,private val raw: ByteArray,val metadata: VerifiedMetadata): java.io.Closeable {
        private var open=true
        private var group: LocalReceiptBlob.ReceiptGeneration?=null
        private var groupId: String?=null
        /** Owned bytes, unlike consumeReopened's borrowed callback; caller wipes. */
        fun read(descriptor: LocalReceiptBlob.Descriptor): ByteArray {
            check(open && descriptor in descriptors)
            if(groupId!=descriptor.generationId) {
                group?.close();group=null;groupId=null
                group=LocalReceiptBlob.reopen(context,raw,body.vaultId,descriptor.generationId,descriptors.filter {it.generationId==descriptor.generationId})
                groupId=descriptor.generationId
            }
            return checkNotNull(group).let {it.read(it.handles.single {handle->handle.descriptor==descriptor})}
        }
        override fun close() {if(open) {open=false;group?.close();group=null}}
    }
    internal data class ReceiptDeclaration(val id: String, val expenseId: String, val mediaType: String,
        val byteCount: Long, val sha256: String)
    internal interface ReceiptPreparation : java.io.Closeable {
        /** Borrowed input; caller retains ownership and must wipe its buffer. */
        fun append(receiptId: String, bytes: ByteArray)
        /** Owns and closes the input; exact declared length and true EOF required. */
        fun append(receiptId: String, input: java.io.InputStream)
        fun finish(): PreparedGeneration
    }
    internal interface PreparedGeneration : java.io.Closeable {
        val metadata: VerifiedMetadata
    }
    private fun frozenMetadata(snapshot: Snapshot): Snapshot {
        require(snapshot.attachments.isEmpty()) {"Preparation metadata must not contain receipt bytes"}
        val f=snapshot.finance
        return snapshot.copy(expenses=snapshot.expenses.toList(),attachments=emptyList(),finance=f.copy(
            budgets=f.budgets.toList(),incomeSources=f.incomeSources.toList(),incomeEntries=f.incomeEntries.toList(),
            savingsGoals=f.savingsGoals.toList(),savingsEntries=f.savingsEntries.toList(),recurringExpenses=f.recurringExpenses.toList()))
            .also {it.validate()}
    }
    /** Exact existing schema-3 JSON size: base64 has no JSON escaping overhead. */
    private fun requireReceiptCapacity(snapshot: Snapshot, descriptors: List<LocalReceiptBlob.Descriptor>) {
        require(descriptors.size<=100 && descriptors.map {it.id}.toSet().size==descriptors.size) {"Invalid receipt count or duplicate IDs"}
        val owners=snapshot.expenses.map {it.id}.toSet()
        require(descriptors.all {it.expenseId in owners}) {"Receipt owner is missing"}
        require(descriptors.sumOf {it.byteCount}<=Attachment.maxTotalBytes) {"Receipts exceed the 8 MiB vault limit"}
        var size=StrictJson.bytes(snapshot.json()).size.toLong()+maxOf(0,descriptors.size-1)
        descriptors.forEach {d -> size=Math.addExact(size,StrictJson.bytes(receiptMetadata(d).put("dataBase64","")).size+4*((d.byteCount+2)/3))}
        require(size<=Backup.maxPlaintextBytes && 4*((size+2)/3)+1024<=Backup.maxEnvelopeBytes) {"Vault backup capacity reached"}
    }
    /** Pins both namespaces, including receipt-free preparations. SQLite itself
     * keeps an open connection after pathname replacement; a path string/value
     * digest is therefore insufficient. Closing/reopening that connection is stale. */
    private inner class CandidateNamespace : java.io.Closeable {
        val database=db()
        val path=database.path
        private val pins=mutableListOf<Triple<String,java.io.FileDescriptor,Boolean>>()
        init {
            try {
                for((name,directory) in listOf(context.noBackupFilesDir.absolutePath to true,path to false)) {
                    val fd=android.system.Os.open(name,android.system.OsConstants.O_RDONLY or android.system.OsConstants.O_NOFOLLOW or android.system.OsConstants.O_NONBLOCK,0)
                    pins+=Triple(name,fd,directory)
                }
                val receiptRoot=java.io.File(context.noBackupFilesDir,LocalReceiptBlob.ROOT_NAME)
                if(receiptRoot.exists()) pinReceiptRoot()
                check()
            } catch(error: Throwable) {try {close()} catch(cleanup: Throwable) {error.addSuppressed(cleanup)};throw error}
        }
        fun identity(): List<Pair<String,Pair<Long,Long>>> = pins.map {(name,fd,_)->android.system.Os.fstat(fd).let {name to (it.st_dev to it.st_ino)}}
        fun pinReceiptRoot() {
            val name=java.io.File(context.noBackupFilesDir,LocalReceiptBlob.ROOT_NAME).absolutePath
            if(pins.none {it.first==name}) pins+=Triple(name,android.system.Os.open(name,
                android.system.OsConstants.O_RDONLY or android.system.OsConstants.O_NOFOLLOW or android.system.OsConstants.O_NONBLOCK,0),true)
            check()
        }
        fun check() {
            for((name,fd,directory) in pins) {
                val pinned=android.system.Os.fstat(fd);val current=android.system.Os.lstat(name)
                check(pinned.st_dev==current.st_dev && pinned.st_ino==current.st_ino && current.st_uid==android.os.Process.myUid()) {"Receiving vault namespace changed"}
                check(if(directory) android.system.OsConstants.S_ISDIR(current.st_mode) else android.system.OsConstants.S_ISREG(current.st_mode) && current.st_nlink==1L)
            }
            // No lazy SQLite open may occur after namespace/connection loss.
            check(database.isOpen) {"Receiving vault connection was closed"}
            check(db()===database) {"Receiving vault connection changed"}
        }
        override fun close() {
            var error: Throwable?=null
            pins.forEach {(_,fd,_)->try {android.system.Os.close(fd)} catch(failure: Throwable) {if(error==null) error=failure else error!!.addSuppressed(failure)}}
            pins.clear();error?.let {throw it}
        }
    }
    private fun <T> candidateLocked(storage: CandidateStorage, block: () -> T): T = synchronized(locks.getOrPut(storage.namespace.path) {Any()},block)
    private data class CandidateTarget(val state: State, val token: String, val binding: String,
        val keyEnvelope: String, val metadata: VerifiedMetadata)
    /** Existing authenticated local identity only; cloud writer/account state is not part of this API. */
    private fun candidateTarget(): CandidateTarget {
        val current=state();check(!current.pending) {"Finish existing vault recovery before preparing or installing a candidate"}
        val metadata=readVerified(current.active) // Retrieves the current existing device key, never provisions it.
        val envelope=db().rawQuery("SELECT wrappedKey FROM vault_generations WHERE id=?",arrayOf(current.active)).use {check(it.moveToFirst());CloudContract.sha256(it.getBlob(0))}
        return CandidateTarget(current,checkNotNull(get("activeState")),binding(),envelope,metadata)
    }
    internal interface ReceiptTarget : java.io.Closeable
    private inner class BoundTarget(val target: CandidateTarget, val namespace: CandidateNamespace) : ReceiptTarget {
        private val owner=this@VaultGenerations
        private var open=true
        fun claim(receiver: VaultGenerations) {
            check(owner===receiver) {"Target belongs to another receiving store"}
            check(open) {"Receiving target already consumed"};open=false
        }
        override fun close() = synchronized(locks.getOrPut(namespace.path) {Any()}) {
            if(open) {open=false;namespace.close()}
        }
    }
    internal fun captureReceiptTarget(allowRepair:Boolean = false): ReceiptTarget = locked {
        val namespace=CandidateNamespace()
        try {
            namespace.check()
            // Prove access or actual absence before classifying an unreadable target.
            val witness=if(allowRepair) keyWitness() else null
            val target=runCatching {transaction {candidateTarget()}}
            if(target.isSuccess) {namespace.check();BoundTarget(target.getOrThrow(),namespace)}
            else {check(allowRepair);transaction {RepairTarget(namespace,checkNotNull(witness),rawRepairDigest(),dataVersion(),repairRevision(),java.io.File(context.noBackupFilesDir,LocalReceiptBlob.ROOT_NAME).exists())}}
        }
        catch(error: Throwable) {try {namespace.close()} catch(cleanup: Throwable) {error.addSuppressed(cleanup)};throw error}
    }
    private data class KeyWitness(val present:Boolean,val proof:ByteArray,val plain:ByteArray)
    private fun keyWitness():KeyWitness {
        val keys=KeyStore.getInstance("AndroidKeyStore").apply {load(null)}
        if(!keys.containsAlias(alias)) return KeyWitness(false,byteArrayOf(),byteArrayOf())
        return witnessFor(checkNotNull(keys.getKey(alias,null) as? SecretKey) {"Device key is inaccessible"})
    }
    private fun witnessFor(key:SecretKey):KeyWitness {
        val plain=ByteArray(32).also {SecureRandom().nextBytes(it)}
        return KeyWitness(true,crypt(plain,key,"repair-binding",true),plain)
    }
    /** Existing same-database process lock serializes supported local key writers.
     * Android Keystore has no atomic create-if-absent across unrelated processes. */
    private fun createRepairKey():KeyWitness {
        fault(Point.REPAIR_KEY_CREATING)
        val keys=KeyStore.getInstance("AndroidKeyStore").apply {load(null)}
        check(!keys.containsAlias(alias)) {"Receiving device key appeared before creation"}
        val created=KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES,"AndroidKeyStore").apply {
            init(KeyGenParameterSpec.Builder(alias,KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).setKeySize(256).setRandomizedEncryptionRequired(true).build())
        }.generateKey()
        return witnessFor(created).also(::checkWitness)
    }
    private fun checkWitness(witness:KeyWitness) {
        val keys=KeyStore.getInstance("AndroidKeyStore").apply {load(null)}
        check(keys.containsAlias(alias)==witness.present) {"Receiving device key changed"}
        if(witness.present) {
            val key=checkNotNull(keys.getKey(alias,null) as? SecretKey) {"Device key is inaccessible"}
            val plain=crypt(witness.proof,key,"repair-binding",false)
            try {check(plain.contentEquals(witness.plain)) {"Receiving device key changed"}} finally {plain.fill(0)}
        }
    }
    private fun dataVersion()=db().rawQuery("PRAGMA data_version",null).use {check(it.moveToFirst());it.getLong(0)}
    private fun repairRevision():Long = runCatching {state().revision}.getOrElse {get("revision")?.toLongOrNull()?.takeIf {it>=0 && it<Long.MAX_VALUE} ?: 0L}
    /** Raw encrypted source binding, not authentication/admission of unreadable data.
     * Only the just-created, fully authenticated replacement may be excluded. */
    private fun rawRepairDigest(excluded:String? = null,originalReceiptRoot:Boolean = true):String {
        val hash=java.security.MessageDigest.getInstance("SHA-256")
        fun add(bytes:ByteArray) {hash.update(java.nio.ByteBuffer.allocate(8).putLong(bytes.size.toLong()).array());hash.update(bytes)}
        val tables=domains.associateWith {"id"}+mapOf("metadata" to "key","vault_generations" to "id","vault_rows" to "generationId,domain,id","vault_receipts" to "id")
        for((table,order) in tables) {
            add(table.toByteArray())
            val column=when(table) {"vault_generations"->"id";"vault_rows"->"generationId";"vault_receipts"->"owner";else->null}
            val where=if(excluded!=null && column!=null) " WHERE $column != ?" else ""
            db().rawQuery("SELECT * FROM $table$where ORDER BY $order",if(where.isEmpty()) null else arrayOf(excluded)).use {rows->
                while(rows.moveToNext()) for(i in 0 until rows.columnCount) {
                    add(byteArrayOf(rows.getType(i).toByte()))
                    add(if(rows.isNull(i)) byteArrayOf() else if(rows.getType(i)==android.database.Cursor.FIELD_TYPE_BLOB) rows.getBlob(i) else rows.getString(i).toByteArray(Charsets.UTF_8))
                }
            }
        }
        val skip=if(excluded==null) emptySet() else db().rawQuery("SELECT id FROM vault_receipts WHERE owner=?",arrayOf(excluded)).use {rows->buildSet {while(rows.moveToNext()) add(rows.getString(0))}}
        val base=java.io.File(context.noBackupFilesDir,LocalReceiptBlob.ROOT_NAME)
        if(base.exists() && !originalReceiptRoot) {
            check(base.listFiles().orEmpty().all {it.name in skip}) {"Receipt namespace changed"}
        }
        if(base.exists() && originalReceiptRoot) {
            fun visit(file:java.io.File,relative:String) {
                if(relative in skip) return
                val fd=android.system.Os.open(file.absolutePath,android.system.OsConstants.O_RDONLY or android.system.OsConstants.O_NOFOLLOW or android.system.OsConstants.O_NONBLOCK,0)
                try {
                    val before=android.system.Os.fstat(fd);check(before.st_uid==android.os.Process.myUid())
                    add(relative.toByteArray());add("${before.st_dev}:${before.st_ino}:${before.st_mode}".toByteArray())
                    if(android.system.OsConstants.S_ISDIR(before.st_mode)) {
                        android.os.ParcelFileDescriptor.dup(fd).use {pin->
                            val anchored=java.io.File("/proc/self/fd/${pin.fd}")
                            checkNotNull(anchored.list()).sorted().forEach {name->visit(java.io.File(anchored,name),if(relative.isEmpty()) name else "$relative/$name")}
                        }
                    } else {
                        check(android.system.OsConstants.S_ISREG(before.st_mode) && before.st_nlink==1L)
                        add(before.st_size.toString().toByteArray())
                        val buffer=ByteArray(32768);var total=0L
                        try {while(true) {val count=android.system.Os.read(fd,buffer,0,buffer.size);if(count==0) break;total=Math.addExact(total,count.toLong());check(total<=before.st_size);hash.update(buffer,0,count)}} finally {buffer.fill(0)}
                        check(total==before.st_size)
                    }
                    val after=android.system.Os.fstat(fd);val named=android.system.Os.lstat(file.absolutePath)
                    check(before.st_dev==named.st_dev && before.st_ino==named.st_ino && before.st_size==after.st_size && before.st_mtime==after.st_mtime && before.st_ctime==after.st_ctime)
                } finally {android.system.Os.close(fd)}
            }
            visit(base,"")
        }
        return hash.digest().joinToString("") {"%02x".format(it.toInt() and 255)}
    }
    private inner class RepairTarget(val namespace:CandidateNamespace,val witness:KeyWitness,val digest:String,val version:Long,val revision:Long,val originalReceiptRoot:Boolean):ReceiptTarget {
        val owner=this@VaultGenerations;var open=true
        fun check(excluded:String? = null,currentKey:KeyWitness = witness) {
            namespace.check();checkWitness(currentKey);check(dataVersion()==version) {"Another database writer changed the repair target"}
            if(excluded!=null) readVerified(excluded)
            check(rawRepairDigest(excluded,originalReceiptRoot)==digest) {"Unreadable receiving vault changed after preview"}
            namespace.check();checkWitness(currentKey)
        }
        override fun close() {if(open) {open=false;namespace.close()}}
    }
    internal fun isRepairTarget(target:ReceiptTarget)=target is RepairTarget
    internal fun finishRepair(target:ReceiptTarget,snapshot:Snapshot,operation:RestoreOperation):PreparedGeneration {
        check(target is RepairTarget && target.owner===this)
        return synchronized(locks.getOrPut(target.namespace.path) {Any()}) {
            check(target.open);snapshot.validate();Backup.requireCapacity(snapshot);ReceiptImage.validate(snapshot.attachments)
            target.check();operation.check();target.open=false
            RepairCandidate(target,snapshot,operation)
        }
    }
    private inner class RepairCandidate(val target:RepairTarget,val snapshot:Snapshot,val operation:RestoreOperation):PreparedGeneration {
        private var open=true
        override val metadata=VerifiedMetadata(snapshot.vaultId,snapshot.snapshotId,snapshot.createdAt,
            mapOf("expenses" to snapshot.expenses.size,"attachments" to snapshot.attachments.size)+snapshot.finance.domains().mapValues {it.value.size},Money.total(snapshot.expenses),snapshot.attachments.sumOf {it.byteCount},digest(snapshot))
        fun install(receiver:VaultGenerations) = synchronized(locks.getOrPut(target.namespace.path) {Any()}) {
            check(receiver===target.owner);check(open);open=false
            val id=Wire.id();var generated:KeyWitness?=null;var publication=false
            try {
                transaction {target.check();operation.check();snapshot.validate();Backup.requireCapacity(snapshot);ReceiptImage.validate(snapshot.attachments)}
                if(!target.witness.present) generated=createRepairKey()
                val current=generated ?: target.witness
                fault(Point.REPAIR_KEY_READY);operation.check();target.check(currentKey=current)
                prepare(snapshot,operation::check,id)
                publish(id,null,target.revision,operation,guard={target.check(id,current)},afterPublicationStarted={publication=true})
            } catch(error:Throwable) {
                if(!publication) {
                    // Own complete replacement only. Partial/foreign files remain quarantined.
                    try {discardRepairPreparation(id)} catch(cleanup:Throwable) {error.addSuppressed(cleanup)}
                    if(generated!=null) try {
                        target.check(currentKey=generated!!)
                        KeyStore.getInstance("AndroidKeyStore").apply {load(null);deleteEntry(alias)}
                        checkWitness(target.witness)
                    } catch(cleanup:Throwable) {error.addSuppressed(cleanup)}
                }
                throw error
            } finally {operation.finish();target.namespace.close()}
        }
        override fun close() {synchronized(locks.getOrPut(target.namespace.path) {Any()}) {if(open) {open=false;target.namespace.close()}}}
    }
    private fun discardRepairPreparation(id:String) {
        val exists=db().rawQuery("SELECT 1 FROM vault_generations WHERE id=?",arrayOf(id)).use {it.moveToFirst()};if(!exists) return
        val raw=key(id)
        try {
            val groups=mutableListOf<Pair<String,ByteArray>>()
            db().rawQuery("SELECT id,sealed FROM vault_receipts WHERE owner=?",arrayOf(id)).use {r->while(r.moveToNext()) groups+=r.getString(0) to r.getBlob(1)}
            for((group,sealed) in groups) {
                val j=open(sealed,SecretKeySpec(raw,"AES"),"receipts:$id:$group");val array=j.getJSONArray("descriptors")
                val descriptors=(0 until array.length()).map {descriptor(array.getJSONObject(it))}
                LocalReceiptBlob.reopen(context,raw,Wire.string(j,"vaultId"),group,descriptors).discard()
            }
            transaction {db().delete("vault_receipts","owner=?",arrayOf(id));db().delete("vault_rows","generationId=?",arrayOf(id));db().delete("vault_generations","id=?",arrayOf(id))}
        } finally {raw.fill(0)}
    }
    private inner class CandidateStorage(val id: String, val raw: ByteArray, val snapshot: Snapshot,
        val group: String, val descriptors: List<LocalReceiptBlob.Descriptor>, val operation: RestoreOperation, val target: CandidateTarget, val namespace: CandidateNamespace) {
        var writer: LocalReceiptBlob.Operation? = null
        var files: LocalReceiptBlob.ReceiptGeneration? = null
        var databaseOwned = false
        var cleanupUncertain = false
        var publicationStarted = false
        val received=mutableSetOf<String>()
        fun discard() {
            // The publication CAS is the cancellation boundary. A transaction end
            // can fail with uncertain durability: never delete a possibly published
            // generation. Format 2 remains quarantined if publication rolled back.
            val namespaceFailure=runCatching {namespace.check()}.exceptionOrNull()
            cleanupUncertain=cleanupUncertain || namespaceFailure!=null
            try {
                writer?.close()
                if(files!=null) {if(publicationStarted) files!!.release() else files!!.discard()}
                if(databaseOwned && !cleanupUncertain && !publicationStarted) transaction {
                    db().delete("vault_receipts","owner=?",arrayOf(id));db().delete("vault_rows","generationId=?",arrayOf(id));db().delete("vault_generations","id=?",arrayOf(id))
                }
                namespaceFailure?.let {throw it}
            } finally {
                // The active/pending pointer or candidate-only catalog protects
                // release-only outcomes after the in-process candidate pin is gone.
                raw.fill(0);candidatePins[namespace.path]?.let {it.remove(id);if(it.isEmpty()) candidatePins.remove(namespace.path)}
                namespace.close()
            }
        }
        fun failed(error: Throwable): Nothing {
            cleanupUncertain=cleanupUncertain || error.suppressed.isNotEmpty()
            try {discard()} catch(cleanup: Throwable) {error.addSuppressed(cleanup)}
            throw error
        }
    }
    private inner class Preparation(private val storage: CandidateStorage) : ReceiptPreparation {
        private var open=true
        override fun append(receiptId: String, bytes: ByteArray) = candidateLocked(storage) {
            check(open) {"Receipt preparation is closed"}
            try {
                storage.namespace.check();storage.operation.check()
                val descriptor=checkNotNull(storage.descriptors.find {it.id==receiptId}) {"Undeclared receipt"}
                check(receiptId !in storage.received) {"Receipt already supplied"}
                require(bytes.size.toLong()==descriptor.byteCount) {"Receipt input length mismatch"}
                checkNotNull(storage.writer).seal(descriptor,bytes)
                storage.received+=receiptId;fault(Point.CANDIDATE_INPUT);storage.operation.check()
            } catch(error: Throwable) {open=false;storage.failed(error)}
        }
        override fun append(receiptId: String, input: java.io.InputStream) = candidateLocked(storage) {
            var bytes: ByteArray? = null
            try {
                input.use {source ->
                    check(open) {"Receipt preparation is closed"};storage.namespace.check();storage.operation.check()
                    val d=checkNotNull(storage.descriptors.find {it.id==receiptId}) {"Undeclared receipt"}
                    check(receiptId !in storage.received) {"Receipt already supplied"}
                    val data=ByteArray(d.byteCount.toInt());bytes=data
                    var offset=0
                    while(offset<data.size) {
                        storage.operation.check();val requested=minOf(32768,data.size-offset);val count=source.read(data,offset,requested)
                        check(count in 1..requested) {"Truncated, stalled or over-reported receipt input"};offset+=count
                    }
                    storage.operation.check();check(source.read()==-1) {"Trailing receipt input"}
                }
                storage.operation.check();append(receiptId,checkNotNull(bytes))
            } catch(error: Throwable) {if(open) {open=false;storage.failed(error)} else throw error}
            finally {bytes?.fill(0)}
        }
        override fun finish(): PreparedGeneration = candidateLocked(storage) {
            check(open) {"Receipt preparation is closed"}
            try {
                storage.namespace.check();storage.operation.check();check(storage.received.size==storage.descriptors.size) {"Missing declared receipts"}
                storage.files=storage.writer?.complete()
                val summary=transaction {readVerified(storage.id)}
                fault(Point.CANDIDATE_VERIFIED);storage.operation.check()
                // readVerified has closed its complete verification lease. The
                // original ownership pins stay private until candidate discard,
                // preventing same-ciphertext inode substitutions from becoming owned.
                fault(Point.CANDIDATE_CLOSED);storage.operation.check()
                val candidate=Candidate(storage,summary);open=false;candidate
            } catch(error: Throwable) {open=false;storage.failed(error)}
        }
        override fun close() = candidateLocked(storage) {if(open) {open=false;storage.discard()}}
    }
    private inner class Candidate(private val storage: CandidateStorage, override val metadata: VerifiedMetadata) : PreparedGeneration {
        private var open=true
        private val owner=this@VaultGenerations
        fun install(receiver: VaultGenerations) = candidateLocked(storage) {
            check(owner===receiver) {"Candidate belongs to another receiving store"}
            check(open) {"Candidate is consumed"};open=false
            try {
                storage.namespace.check();fault(Point.CANDIDATE_INSTALL_READY)
                publish(storage.id,storage.target.state,storage.target.state.revision,storage.operation,
                    guard={storage.namespace.check();check(candidateTarget()==storage.target) {"Your vault changed after candidate preparation"}},
                    verify={actual ->
                        check(actual==metadata) {"Candidate metadata changed"}
                        // Retained creation pins reject identical-ciphertext inode or
                        // directory substitutions that a fresh read lease cannot detect.
                        storage.files?.let {files->files.handles.forEach {storage.operation.check();files.read(it).fill(0)}}
                        storage.operation.check()
                        check(candidateTarget()==storage.target) {"Your vault changed before publication"};storage.namespace.check()
                    },
                    afterPublicationStarted={storage.publicationStarted=true;adoptCandidate(storage)})
            } catch(error: Throwable) {storage.failed(error)}
            finally {storage.operation.finish()}
            storage.discard() // Published: close ownership pins without deleting durable files.
        }
        override fun close() = candidateLocked(storage) {if(open) {open=false;storage.discard()}}
    }
    internal fun installPrepared(candidate: PreparedGeneration) {
        when(candidate) {is Candidate->candidate.install(this);is RepairCandidate->candidate.install(this);else->error("Unsupported candidate capability")}
    }
    private fun adoptCandidate(storage: CandidateStorage) {
        if(storage.descriptors.isEmpty()) return
        val secret=SecretKeySpec(storage.raw,"AES")
        val bytes=db().rawQuery("SELECT owner,sealed FROM vault_receipts WHERE id=?",arrayOf(storage.group)).use {
            check(it.moveToFirst() && it.getString(0)==storage.id);it.getBlob(1)
        }
        val manifest=open(bytes,secret,"receipts:${storage.id}:${storage.group}")
        Wire.exactKeys(manifest,"format","vaultId","descriptors")
        check(Wire.integer(manifest,"format")==2L && Wire.string(manifest,"vaultId")==storage.snapshot.vaultId)
        val array=manifest.getJSONArray("descriptors");check(array.length()==storage.descriptors.size)
        check((0 until array.length()).map {descriptor(array.getJSONObject(it))}==storage.descriptors)
        manifest.put("format",1)
        check(db().update("vault_receipts",ContentValues().apply {put("sealed",seal(manifest,secret,"receipts:${storage.id}:${storage.group}"))},"id=? AND owner=?",arrayOf(storage.group,storage.id))==1)
    }
    /** Preparation never initializes, repairs or changes current state. The opaque
     * capability can only be installed once by this receiving store. */
    internal fun beginReceiptPreparation(metadata: Snapshot, receipts: List<ReceiptDeclaration>,
        operation: RestoreOperation = RestoreOperation()): ReceiptPreparation = captureReceiptTarget().use {
        beginReceiptPreparation(metadata,receipts,operation,it)
    }
    internal fun beginReceiptPreparation(metadata: Snapshot, receipts: List<ReceiptDeclaration>,
        operation: RestoreOperation, authority: ReceiptTarget): ReceiptPreparation {
        check(authority is BoundTarget) {"Unsupported receiving target"}
        return synchronized(locks.getOrPut(authority.namespace.path) {Any()}) {
            authority.claim(this)
            beginBoundPreparation(metadata,receipts,operation,authority)
        }
    }
    private fun beginBoundPreparation(metadata: Snapshot, receipts: List<ReceiptDeclaration>,
        operation: RestoreOperation, authority: BoundTarget): ReceiptPreparation {
        val namespace=authority.namespace;val target=authority.target
        val snapshot: Snapshot;val id=Wire.id();val group=Wire.id()
        val descriptors: List<LocalReceiptBlob.Descriptor>;val device: SecretKey
        try {
            namespace.check();operation.check()
            snapshot=frozenMetadata(metadata)
            descriptors=receipts.toList().map {LocalReceiptBlob.Descriptor(snapshot.vaultId,group,it.id,it.expenseId,it.mediaType,it.byteCount,it.sha256)}
            requireReceiptCapacity(snapshot,descriptors)
            check(transaction {candidateTarget()}==target) {"Receiving vault changed during backup validation"}
            namespace.check();device=device() // Revalidate original authority; never refresh it or provision a key.
        } catch(error: Throwable) {try {namespace.close()} catch(cleanup: Throwable) {error.addSuppressed(cleanup)};throw error}
        val raw=ByteArray(32).also {SecureRandom().nextBytes(it)}
        val storage=CandidateStorage(id,raw,snapshot,group,descriptors,operation,target,namespace)
        check(candidatePins.getOrPut(db().path) {mutableSetOf()}.add(id)) {"Candidate identity already owned"}
        try {
            val membership=digest(snapshot.vaultId,snapshot.expenses,descriptors.map {it.id to receiptMetadata(it)},snapshot.finance)
            val header=JSONObject().put("format",1).put("generationId",id).put("vaultId",snapshot.vaultId).put("snapshotId",snapshot.snapshotId).put("createdAt",snapshot.createdAt).put("digest",membership)
            transaction {
                db().insertOrThrow("vault_generations",null,ContentValues().apply {put("id",id);put("wrappedKey",crypt(raw,device,"key:$id",true));put("sealedHeader",seal(header,SecretKeySpec(raw,"AES"),"header:$id"))})
                writeRows(id,raw,rowMap(snapshot,descriptors),operation::check)
                if(descriptors.isNotEmpty()) {
                    // Format 2 denotes still-owned, unactivated candidate files. The
                    // persisted-generation collector only admits format 1; abandoned
                    // or uncertain candidate cleanup must remain quarantined.
                    val manifest=JSONObject().put("format",2).put("vaultId",snapshot.vaultId).put("descriptors",JSONArray().apply {descriptors.forEach {put(json(it))}})
                    db().insertOrThrow("vault_receipts",null,ContentValues().apply {put("id",group);put("owner",id);put("sealed",seal(manifest,SecretKeySpec(raw,"AES"),"receipts:$id:$group"))})
                }
            }
            storage.databaseOwned=true
            if(descriptors.isNotEmpty()) storage.writer=LocalReceiptBlob.Operation(context,raw,snapshot.vaultId,
                faults=LocalReceiptBlob.Faults {_,_->operation.check()},generationId=group)
            if(descriptors.isNotEmpty()) namespace.pinReceiptRoot()
            namespace.check();operation.check();return Preparation(storage)
        } catch(error: Throwable) {storage.failed(error)}
    }
    private fun receiptFiles(id: String, raw: ByteArray, snapshot: Snapshot, guard: () -> Unit = {}): List<LocalReceiptBlob.Descriptor> {
        if(snapshot.attachments.isEmpty()) return emptyList()
        val group=Wire.id()
        val descriptors=snapshot.attachments.map {LocalReceiptBlob.Descriptor(snapshot.vaultId,group,it.id,it.expenseId,it.mediaType,it.byteCount,it.sha256)}
        val manifest=JSONObject().put("format",1).put("vaultId",snapshot.vaultId).put("descriptors",JSONArray().apply {descriptors.forEach {put(json(it))}})
        // Intent precedes filesystem creation; interrupted/invalid files are never treated as active.
        transaction {db().insertOrThrow("vault_receipts",null,ContentValues().apply {put("id",group);put("owner",id);put("sealed",seal(manifest,SecretKeySpec(raw,"AES"),"receipts:$id:$group"))})}
        LocalReceiptBlob.Operation(context,raw,snapshot.vaultId,faults=LocalReceiptBlob.Faults {_,_->guard()},generationId=group).use {operation ->
            snapshot.attachments.zip(descriptors).forEach {(attachment,d)->val bytes=attachment.bytes();try {operation.seal(d,bytes)} finally {bytes.fill(0)}}
            operation.complete().release()
        }
        return descriptors
    }
    private fun rowMap(snapshot: Snapshot, descriptors: List<LocalReceiptBlob.Descriptor>): Map<Pair<String,String>,JSONObject> = buildMap {
        snapshot.expenses.forEach {put("expenses" to it.id,it.json())};descriptors.forEach {put("attachments" to it.id,json(it))}
        snapshot.finance.domains().forEach {(table,records)->records.forEach {put(table to it.id,it.json())}}
    }
    private fun writeRows(id: String, raw: ByteArray, rows: Map<Pair<String,String>,JSONObject>, guard: () -> Unit = {}) {
        val existing=mutableMapOf<Pair<String,String>,ByteArray>()
        db().rawQuery("SELECT domain,id,sealed FROM vault_rows WHERE generationId=?",arrayOf(id)).use {r->while(r.moveToNext()) existing[r.getString(0) to r.getString(1)]=r.getBlob(2)}
        val secret=SecretKeySpec(raw,"AES")
        existing.keys.filterNot {it in rows}.forEach {(domain,row)->db().delete("vault_rows","generationId=? AND domain=? AND id=?",arrayOf(id,domain,row))}
        rows.forEach {(identity,j)->
            guard()
            val (domain,row)=identity;val aad="row:$id:$domain:$row"
            val old=existing[identity]
            if(old==null || StrictJson.bytes(open(old,secret,aad)).contentEquals(StrictJson.bytes(j)).not())
                db().insertWithOnConflict("vault_rows",null,ContentValues().apply {put("generationId",id);put("domain",domain);put("id",row);put("sealed",seal(j,secret,aad))},SQLiteDatabase.CONFLICT_REPLACE).also {check(it != -1L)}
        }
    }
    private fun prepare(snapshot: Snapshot, guard: () -> Unit = {}, id:String = Wire.id()): String {
        guard()
        snapshot.validate();Backup.requireCapacity(snapshot);ReceiptImage.validate(snapshot.attachments)
        val raw=ByteArray(32).also {SecureRandom().nextBytes(it)}
        try {
            val wrapped=crypt(raw,device(true),"key:$id",true)
            transaction {db().insertOrThrow("vault_generations",null,ContentValues().apply {put("id",id);put("wrappedKey",wrapped);put("sealedHeader",byteArrayOf())});setHeader(id,raw,snapshot)}
            val descriptors=receiptFiles(id,raw,snapshot,guard);fault(Point.FILES_READY);guard()
            transaction {writeRows(id,raw,rowMap(snapshot,descriptors),guard);readVerified(id);fault(Point.ROWS_READY);guard()}
            return id
        } catch (failure: Throwable) {
            cleanupFailed(failure);throw failure
        } finally {raw.fill(0)}
    }
    private fun cleanupFailed(failure: Throwable) {
        // Never infer ownership from a damaged active pointer. Full verified
        // inactive groups can be discarded; ambiguous/partial files stay quarantined.
        try { if(get("activeState")!=null) collect(state()) } catch(cleanup: Throwable) {failure.addSuppressed(cleanup)}
    }
    private fun migrationSource(snapshot: Snapshot): JSONObject {
        val token=checkNotNull(get("migrationSource")) {"Missing migration journal"};require(token.length<=4096)
        val j=open(Base64.getDecoder().decode(token),device(),"migration",4096)
        Wire.exactKeys(j,"format","digest","vaultId","revision","incarnation")
        require(Wire.integer(j,"format")==1L && Wire.string(j,"digest")==digest(snapshot) && Wire.string(j,"vaultId")==snapshot.vaultId)
        require(Wire.integer(j,"revision")>=0);Wire.requireId(Wire.string(j,"incarnation"))
        return j
    }
    private fun ensure(): State {
        if(get("activeState")==null) {
            check(get("generationFormat")==null) {"Missing active generation state"}
            val evidence=db().rawQuery("SELECT count(*) FROM vault_generations",null).use {it.moveToFirst();it.getLong(0)>0}
            check(!evidence || get("migrationSource")!=null) {"Established generation has no active state"}
            val snapshot=legacy()
            val source=if(get("migrationSource")!=null) migrationSource(snapshot) else {
                JSONObject().put("format",1).put("digest",digest(snapshot)).put("vaultId",snapshot.vaultId).put("revision",legacyRevision()).put("incarnation",legacyIncarnation()).also {j ->
                    transaction {put("migrationSource",Base64.getEncoder().encodeToString(seal(j,device(),"migration")))}
                }
            }
            val id=prepare(snapshot)
            transaction {setState(State(id,null,true,Wire.integer(source,"revision"),Wire.string(source,"incarnation")))}
        }
        return recover()
    }
    private fun recover(): State {
        val current=state()
        if(!current.pending) return current
        try {transaction {readVerified(current.active)}} catch(failure: Exception) {
            val previous=current.previous ?: run {
                // First migration retains the complete legacy source until finalization.
                migrationSource(legacy())
                transaction {db().delete("metadata","key IN ('activeState','generationFormat')",null)}
                throw IllegalStateException("Interrupted migration retained its legacy source; reopen the vault",failure)
            }
            transaction {readVerified(previous.id);setState(State(previous.id,null,false,previous.revision,previous.incarnation))}
            throw IllegalStateException("Interrupted replacement was rolled back; reopen the vault",failure)
        }
        fault(Point.REOPENED)
        transaction {setState(current.copy(previous=null,pending=false));domains.forEach {db().delete(it,null,null)};db().delete("metadata","key='migrationSource'",null)}
        collect(state())
        return state()
    }
    private fun collect(current: State) {
        val reads=receiptReadPins[db().path].orEmpty().keys
        val protected = setOfNotNull(current.active,current.previous?.id) + candidatePins[db().path].orEmpty() + reads.map {it.first}
        val liveGroups=reads.map {it.second}.toMutableSet()
        protected.forEach {id ->
            val raw=key(id)
            try {db().rawQuery("SELECT id,sealed FROM vault_rows WHERE generationId=? AND domain='attachments'",arrayOf(id)).use {rows ->while(rows.moveToNext()) {
                liveGroups += descriptor(open(rows.getBlob(1),SecretKeySpec(raw,"AES"),"row:$id:attachments:${rows.getString(0)}")).generationId
            }}} finally {raw.fill(0)}
        }
        val groups=mutableListOf<Triple<String,String,ByteArray>>()
        db().rawQuery("SELECT id,owner,sealed FROM vault_receipts",null).use {r->while(r.moveToNext()) groups += Triple(r.getString(0),r.getString(1),r.getBlob(2))}
        groups.filterNot {it.first in liveGroups}.forEach {(group,owner,bytes) ->
            // Cleanup is best effort. Unknown/partial/replaced files are quarantined,
            // never removed by filename, and never admitted as a live generation.
            try {
                val raw=key(owner)
                try {
                    val manifest=open(bytes,SecretKeySpec(raw,"AES"),"receipts:$owner:$group")
                    Wire.exactKeys(manifest,"format","vaultId","descriptors");require(Wire.integer(manifest,"format")==1L)
                    val array=manifest.getJSONArray("descriptors");require(array.length()<=100)
                    val descriptors=(0 until array.length()).map {descriptor(array.getJSONObject(it))}
                    LocalReceiptBlob.reopen(context,raw,Wire.string(manifest,"vaultId"),group,descriptors).discard()
                    transaction {db().delete("vault_receipts","id=? AND owner=?",arrayOf(group,owner))}
                } finally {raw.fill(0)}
            } catch (_: Exception) { /* Retain authenticated catalog for later review/recovery. */ }
        }
        transaction {
            val ids=mutableListOf<String>();db().rawQuery("SELECT id FROM vault_generations",null).use {r->while(r.moveToNext()) ids+=r.getString(0)}
            ids.filterNot {it in protected}.forEach {id ->
                val hasGroups=db().rawQuery("SELECT 1 FROM vault_receipts WHERE owner=? LIMIT 1",arrayOf(id)).use {it.moveToFirst()}
                if(!hasGroups) {db().delete("vault_rows","generationId=?",arrayOf(id));db().delete("vault_generations","id=?",arrayOf(id))}
            }
        }
    }
    private data class LiveIdentity(val owner:VaultGenerations,val database:SQLiteDatabase,
        val namespace:List<Pair<String,Pair<Long,Long>>>,val state:State,val token:String,val envelope:String,val digest:String)
    private fun envelope(id:String)=db().rawQuery("SELECT wrappedKey FROM vault_generations WHERE id=?",arrayOf(id)).use {check(it.moveToFirst());CloudContract.sha256(it.getBlob(0))}
    private fun live(namespace:CandidateNamespace):LiveVaultState {
        namespace.check();val current=state();check(!current.pending);val token=checkNotNull(get("activeState"));val wrapped=envelope(current.active)
        var result:LiveVaultState?=null
        readVerified(current.active,capture={body,descriptors,_,metadata ->
            fun <T> frozen(items:List<T>):List<T> = java.util.Collections.unmodifiableList(ArrayList(items))
            val f=body.finance
            result=LiveVaultState(frozen(body.expenses),f.copy(budgets=frozen(f.budgets),incomeSources=frozen(f.incomeSources),incomeEntries=frozen(f.incomeEntries),
                savingsGoals=frozen(f.savingsGoals),savingsEntries=frozen(f.savingsEntries),recurringExpenses=frozen(f.recurringExpenses)),
                frozen(descriptors.map {ReceiptInfo(it.id,it.expenseId,it.mediaType,it.byteCount,it.sha256)}),
                LiveIdentity(this,namespace.database,namespace.identity(),current,token,wrapped,metadata.digest))
        })
        namespace.check();check(state()==current && get("activeState")==token && envelope(current.active)==wrapped)
        return checkNotNull(result)
    }
    private fun checkLive(source:LiveIdentity,namespace:CandidateNamespace) {
        namespace.check()
        check(source.owner===this && source.database===namespace.database && source.namespace==namespace.identity()) {"Displayed vault namespace changed"}
        check(state()==source.state && get("activeState")==source.token && envelope(source.state.active)==source.envelope) {"Your vault changed. Reopen the expense before editing."}
        key(source.state.active).fill(0) // Retrieve the current existing Keystore key, never provision it.
    }
    internal fun liveState():LiveVaultState = locked {ensure();CandidateNamespace().use {namespace->transaction {live(namespace)}}}
    /** Existing metadata-only edit transaction. Retained descriptors are read from authenticated storage, never reconstructed from UI. */
    internal fun editExpense(expected:LiveVaultState,expense:Expense,operation:RestoreOperation):LiveVaultState = locked {
        val source=expected.source as? LiveIdentity ?: error("Invalid live source")
        try {CandidateNamespace().use {namespace -> transaction {
            operation.check();checkLive(source,namespace)
            var result:LiveVaultState?=null
            readVerified(source.state.active,capture={body,descriptors,raw,metadata ->
                check(metadata.digest==source.digest);require(body.expenses.any {it.id==expense.id}) {"Expense no longer exists"}
                val changed=body.copy(expenses=body.expenses.map {if(it.id==expense.id) expense else it})
                changed.validate();requireReceiptCapacity(changed,descriptors)
                val membership=digest(changed.vaultId,changed.expenses,descriptors.map {it.id to receiptMetadata(it)},changed.finance)
                fault(Point.LIVE_EDIT_READY);operation.check();checkLive(source,namespace)
                writeRows(source.state.active,raw,rowMap(changed,descriptors));setHeader(source.state.active,raw,changed,membership)
                setState(source.state.copy(revision=Math.addExact(source.state.revision,1)))
                fault(Point.LIVE_EDIT_WRITTEN);operation.check()
                result=live(namespace);operation.check();namespace.check()
                operation.beginPublication() // Transaction commit owns the outcome after this boundary.
            })
            checkNotNull(result)
        }}} finally {operation.finish()}
    }
    internal fun openReceipt(expected:LiveVaultState,id:String,cancel:LocalReceiptBlob.Cancellation):OwnedReceipt = locked {
        val source=expected.source as? LiveIdentity ?: error("Invalid live source")
        var result:OwnedReceipt?=null
        try {CandidateNamespace().use {namespace -> transaction {
            checkLive(source,namespace);cancel.check()
            readVerified(source.state.active,capture={body,descriptors,raw,metadata ->
                check(metadata.digest==source.digest);val selected=descriptors.single {it.id==id}
                val group=LocalReceiptBlob.reopen(context,raw,body.vaultId,selected.generationId,descriptors.filter {it.generationId==selected.generationId})
                try {
                    cancel.check();checkLive(source,namespace)
                    val path=namespace.path;val pin=source.state.active to selected.generationId
                    val pins=receiptReadPins.getOrPut(path) {mutableMapOf()};pins[pin]=Math.addExact(pins[pin] ?: 0,1)
                    result=object:OwnedReceipt {
                        private var open=true
                        override fun <T> withBytes(block:(ByteArray)->T):T = synchronized(this) {
                            check(open);cancel.check();val bytes=group.read(group.handles.single {it.descriptor==selected})
                            try {cancel.check();val value=block(bytes);cancel.check();value} finally {bytes.fill(0)}
                        }
                        override fun close() {synchronized(this) {
                            if(!open) return;open=false
                            synchronized(locks.getOrPut(path) {Any()}) {
                                // Keep GC protection if a real close cannot establish release.
                                group.release()
                                val held=checkNotNull(receiptReadPins[path]);val count=checkNotNull(held[pin]);if(count==1) held.remove(pin) else held[pin]=count-1
                                if(held.isEmpty()) receiptReadPins.remove(path)
                            }
                        }}
                    }
                } catch(error:Throwable) {try {group.release()} catch(cleanup:Throwable) {error.addSuppressed(cleanup)};throw error}
            })
            cancel.check();checkNotNull(result)
        }}} catch(error:Throwable) {try {result?.close()} catch(cleanup:Throwable) {error.addSuppressed(cleanup)};throw error}
    }
    fun snapshot(): Snapshot = locked {val current=ensure();transaction {read(current.active)}}
    internal fun verifiedMetadata(): VerifiedMetadata = locked {val current=ensure();transaction {readVerified(current.active)}}
    fun revision(): Long = locked { legacyRevision() }
    fun incarnation(): String = locked {ensure().incarnation}
    fun vaultId(): String = verifiedMetadata().vaultId
    fun checkpoint(after: () -> Unit): Triple<Snapshot,Long,String> = locked {
        val current=ensure();transaction {val snapshot=read(current.active);after();Triple(snapshot,current.revision,current.incarnation)}
    }
    fun mutate(change: (Snapshot) -> Snapshot): Snapshot = locked {
        val current=ensure();val before=transaction {read(current.active)};val snapshot=change(before)
        snapshot.validate();Backup.requireCapacity(snapshot)
        if(snapshot==before) return@locked before
        val raw=key(current.active)
        try {
            val descriptors=if(before.attachments.toSet()==snapshot.attachments.toSet()) {
                db().rawQuery("SELECT id,sealed FROM vault_rows WHERE generationId=? AND domain='attachments'",arrayOf(current.active)).use {rows->buildList {while(rows.moveToNext()) add(descriptor(open(rows.getBlob(1),SecretKeySpec(raw,"AES"),"row:${current.active}:attachments:${rows.getString(0)}")))}}
            } else receiptFiles(current.active,raw,snapshot)
            transaction {
                check(state()==current);writeRows(current.active,raw,rowMap(snapshot,descriptors));setHeader(current.active,raw,snapshot)
                val next=current.copy(revision=Math.addExact(current.revision,1));setState(next);readVerified(current.active)
            }
            collect(state())
            snapshot.copy(expenses=snapshot.expenses.sortedWith(compareByDescending<Expense>{it.expenseDate}.thenByDescending{it.createdAt}.thenBy{it.id}))
        } catch(failure: Throwable) {cleanupFailed(failure);throw failure} finally {raw.fill(0)}
    }
    fun binding(): String = locked { CloudContract.sha256(((get("activeState") ?: "legacy")+":"+(get("dataKey") ?: "absent")+":"+legacyRevision()).toByteArray()) }
    fun replace(snapshot: Snapshot, expectedRevision: Long?, expectedBinding: String? = null, operation: RestoreOperation = RestoreOperation()): Unit = locked {
        snapshot.validate();Backup.requireCapacity(snapshot);ReceiptImage.validate(snapshot.attachments)
        require(expectedBinding==null || binding()==expectedBinding) {"Your vault identity changed after preview. Open the backup again."}
        val token=get("activeState");val old=try {if(token!=null) recover() else null} catch(_: Exception) {null}
        val revision=old?.revision ?: legacyRevision()
        require(expectedRevision==null || revision==expectedRevision) {"Your vault changed after the preview. Open the backup again before replacing it."}
        operation.check()
        val id=prepare(snapshot,operation::check)
        publish(id,old,revision,operation,guard={
            require(expectedBinding==null || binding()==expectedBinding) {"Vault identity changed during preparation"}
            check(get("activeState")==token) {"Vault changed during preparation"}
        })
    }
    /** Shared publication protocol for legacy Snapshot and receipt-streamed local candidates. */
    private fun publish(id: String, old: State?, revision: Long, operation: RestoreOperation,
        guard: () -> Unit, verify: (VerifiedMetadata) -> Unit = {}, afterPublicationStarted: () -> Unit = {}) {
        try {transaction {
            operation.check();guard()
            verify(readVerified(id));operation.check()
            operation.beginPublication() // Late cancellation cannot claim the old vault was retained.
            afterPublicationStarted()
            setState(State(id,old?.let {Previous(it.active,it.revision,it.incarnation)},true,Math.addExact(revision,1),Wire.id()))
        }} catch(failure: Throwable) {cleanupFailed(failure);throw failure}
        fault(Point.POINTER_COMMITTED)
        recover()
    }
}
