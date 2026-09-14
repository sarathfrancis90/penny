package ca.penny.offline

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import org.json.JSONObject
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/** SQLite contains random IDs and authenticated ciphertext only, never expense plaintext.
 * All callers run this on Dispatchers.IO. Fail closed on lost keys/corruption. */
internal class LegacyVaultRows(context: Context, databaseName: String = "penny-vault.db", private val alias: String = "penny.offline.vault.v1") :
    SQLiteOpenHelper(context, java.io.File(context.noBackupFilesDir, databaseName).absolutePath, null, 4), java.io.Closeable {
    override fun onCreate(db: SQLiteDatabase) {
        db.execSQL("CREATE TABLE expenses (id TEXT PRIMARY KEY NOT NULL, sealed BLOB NOT NULL)")
        db.execSQL("CREATE TABLE attachments (id TEXT PRIMARY KEY NOT NULL, sealed BLOB NOT NULL)")
        db.execSQL("CREATE TABLE metadata (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL)")
        db.execSQL("INSERT INTO metadata VALUES ('vaultId', ?)", arrayOf(Wire.id()))
        createFinance(db)
        VaultGenerations.create(db)
    }
    override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) {
        check(oldVersion in 1..3 && newVersion == 4) { "Unsupported vault schema; migration required" }
        if(oldVersion == 1) db.execSQL("CREATE TABLE attachments (id TEXT PRIMARY KEY NOT NULL, sealed BLOB NOT NULL)")
        if(oldVersion < 3) createFinance(db)
        VaultGenerations.create(db)
    }

    private fun createFinance(db: SQLiteDatabase) { FinanceData.limits.keys.forEach { db.execSQL("CREATE TABLE $it (id TEXT PRIMARY KEY NOT NULL, sealed BLOB NOT NULL)") } }

    private val recordTables get() = listOf("expenses", "attachments") + FinanceData.limits.keys
    private val expenseOrder = compareByDescending<Expense> { it.expenseDate }.thenByDescending { it.createdAt }
    private fun metadata(name: String): String? = readableDatabase.rawQuery("SELECT value FROM metadata WHERE key=?",arrayOf(name)).use { if(it.moveToFirst()) it.getString(0) else null }
    private fun putMetadata(name: String,value: String) { writableDatabase.execSQL("INSERT OR REPLACE INTO metadata VALUES (?, ?)",arrayOf(name,value)) }
    private fun aad(table: String,id: String) = (when(table) { "expenses" -> id; "attachments" -> "receipt:$id"; else -> "$table:$id" }).toByteArray(Charsets.UTF_8)
    private fun crypt(bytes: ByteArray, secret: SecretKey, aad: ByteArray, encrypt: Boolean): ByteArray {
        val cipher=Cipher.getInstance("AES/GCM/NoPadding")
        if(encrypt) {cipher.init(Cipher.ENCRYPT_MODE,secret);cipher.updateAAD(aad);return cipher.iv+cipher.doFinal(bytes)}
        require(bytes.size>=28) { "Damaged encrypted record" }
        cipher.init(Cipher.DECRYPT_MODE,secret,GCMParameterSpec(128,bytes.copyOfRange(0,12)));cipher.updateAAD(aad)
        // Android8 Keystore may drop update output when one call exceeds its
        // internal 64KiB streamer. Explicit bounded updates preserve legacy rows.
        val expectedSize=bytes.size-28
        val output=java.io.ByteArrayOutputStream(expectedSize)
        fun append(part:ByteArray?) {if(part!=null) {check(part.size<=expectedSize-output.size()) {"Invalid decrypted record length"};output.write(part)}}
        var offset=12
        while(offset<bytes.size) {
            val count=minOf(16*1024,bytes.size-offset)
            append(cipher.update(bytes,offset,count))
            offset+=count
        }
        append(cipher.doFinal())
        check(output.size()==expectedSize) {"Incomplete decrypted record"}
        return output.toByteArray()
    }
    private inline fun <T> transaction(block: ()->T): T {
        val db=writableDatabase;db.beginTransaction()
        try {return block().also {db.setTransactionSuccessful()}} finally {db.endTransaction()}
    }
    private fun readSealed(table: String,id: String,size: Int): ByteArray {
        require(table in recordTables && size in 28..(4*((Attachment.maxBytes+2)/3)+4096))
        val result=ByteArray(size);var offset=0
        while(offset<size) {
            readableDatabase.rawQuery("SELECT substr(sealed, ?, ?) FROM $table WHERE id=?",arrayOf((offset+1).toString(),minOf(256*1024,size-offset).toString(),id)).use {
                check(it.moveToFirst());val chunk=it.getBlob(0);require(chunk.isNotEmpty());chunk.copyInto(result,offset);offset+=chunk.size
            }
        }
        return result
    }
    /** The Keystore key wraps one random software AES data key. Metadata and every
     * row migrate in a single SQLite transaction. Every operation unwraps the current
     * envelope; older Android Keystore key equality only compares alias/UID.
     * Missing or damaged keys never reset data outside a confirmed complete restore. */
    private fun key(allowVerifiedRecovery: Boolean = false): SecretKey = transaction {
        val keys=KeyStore.getInstance("AndroidKeyStore").apply {load(null)}
        val existing=keys.getKey(alias,null) as? SecretKey
        val protected=metadata("dataKey")
        val format=metadata("dataKeyFormat")
        val nonempty=readableDatabase.rawQuery("SELECT "+recordTables.joinToString(" + ") {"(SELECT count(*) FROM $it)"},null).use {it.moveToFirst();it.getLong(0)>0}
        check(existing!=null || allowVerifiedRecovery || (!nonempty && protected==null && format==null)) { "The device key is missing. Restore a backup to recover this vault." }
        val wrapping=existing ?: KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES,"AndroidKeyStore").apply {
            init(KeyGenParameterSpec.Builder(alias,KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256).setRandomizedEncryptionRequired(true).build())
        }.generateKey()
        if(!allowVerifiedRecovery && (protected!=null || format!=null)) {
            check(format=="1" && protected!=null) { "The vault data key is missing or unsupported. Restore a verified backup." }
            require(protected.length==117) { "Damaged vault data key" }
            val parts=protected.split(':');require(parts.size==2);Wire.requireId(parts[0])
            val sealed=java.util.Base64.getDecoder().decode(parts[1]);require(sealed.size==60 && java.util.Base64.getEncoder().encodeToString(sealed)==parts[1])
            val raw=crypt(sealed,wrapping,"PENNY-VAULT-ROW-KEY:1:$alias:${parts[0]}".toByteArray(),false)
            try { require(raw.size==32);return@transaction javax.crypto.spec.SecretKeySpec(raw,"AES") }
            finally {raw.fill(0)}
        }
        val raw=ByteArray(32).also {java.security.SecureRandom().nextBytes(it)}
        val dataKey=javax.crypto.spec.SecretKeySpec(raw,"AES")
        val generation=Wire.id()
        val envelope=try {generation+":"+java.util.Base64.getEncoder().encodeToString(crypt(raw,wrapping,"PENNY-VAULT-ROW-KEY:1:$alias:$generation".toByteArray(),true))} finally {raw.fill(0)}
        if(nonempty && !allowVerifiedRecovery) {
            // Existing row format used the Keystore key directly. Authenticate and
            // validate all domains before committing this one-time local migration.
            val expenses=mutableListOf<Expense>();val receipts=mutableListOf<Attachment>();val finance=JSONObject()
            recordTables.forEach { table ->
                val array=org.json.JSONArray()
                readableDatabase.rawQuery("SELECT id,length(sealed) FROM $table",null).use {rows -> while(rows.moveToNext()) {
                    val id=rows.getString(0);val bytes=crypt(readSealed(table,id,rows.getInt(1)),wrapping,aad(table,id),false)
                    try {
                        val json=StrictJson.objectFrom(bytes);require(Wire.string(json,"id")==id)
                        when(table) {"expenses" -> expenses.add(Expense.decode(json,if(json.has("description")) 3 else 2));"attachments" -> receipts.add(Attachment.decode(json));else -> array.put(json)}
                        val sealed=crypt(bytes,dataKey,aad(table,id),true)
                        check(writableDatabase.update(table,ContentValues().apply {put("sealed",sealed)},"id=?",arrayOf(id))==1)
                    } finally {bytes.fill(0)}
                }}
                if(table in FinanceData.limits) finance.put(table,array)
            }
            val migrated=Snapshot(vaultId(),expenses,attachments=receipts,finance=FinanceData.decode(finance))
            Backup.requireCapacity(migrated);ReceiptImage.validate(receipts)
        }
        putMetadata("dataKey",envelope);putMetadata("dataKeyFormat","1")
        check(metadata("dataKey")==envelope && metadata("dataKeyFormat")=="1") { "Vault data key could not be saved" }
        dataKey
    }
    private fun seal(expense: Expense, secret: SecretKey): ByteArray {
        val cipher = Cipher.getInstance("AES/GCM/NoPadding").apply { init(Cipher.ENCRYPT_MODE, secret); updateAAD(expense.id.toByteArray(Charsets.UTF_8)) }
        return cipher.iv + cipher.doFinal(expense.json().toString().toByteArray(Charsets.UTF_8))
    }
    @Synchronized fun all(): List<Expense> = transaction {
        val secret = key()
        readableDatabase.rawQuery("SELECT id, sealed FROM expenses", null).use { rows ->
            buildList {
                while (rows.moveToNext()) {
                    val id = rows.getString(0); val sealed = rows.getBlob(1)
                    require(sealed.size >= 28) { "Damaged vault record" }
                    val cipher = Cipher.getInstance("AES/GCM/NoPadding").apply {
                        init(Cipher.DECRYPT_MODE, secret, GCMParameterSpec(128, sealed.copyOfRange(0, 12)))
                        updateAAD(id.toByteArray(Charsets.UTF_8))
                    }
                    val json = StrictJson.objectFrom(cipher.doFinal(sealed.copyOfRange(12, sealed.size)))
                    val expense = Expense.decode(json, if(json.has("description")) 3 else 2)
                    require(expense.id == id) { "Vault record identity mismatch" }
                    add(expense)
                }
            }.also { Money.total(it) }.sortedWith(expenseOrder)
        }
    }
    @Synchronized fun attachments(): List<Attachment> = transaction {
        val secret = key()
        readableDatabase.rawQuery("SELECT id, length(sealed) FROM attachments", null).use { rows -> buildList {
            while (rows.moveToNext()) {
                val id = rows.getString(0)
                val size = rows.getInt(1)
                require(size in 28..(4 * ((Attachment.maxBytes + 2) / 3) + 4096)) { "Damaged receipt record" }
                val sealed = ByteArray(size)
                // A base64 receipt can exceed CursorWindow's 2 MiB row capacity.
                // Fetch bounded encrypted slices, never the complete SQLite cell.
                var offset = 0
                while (offset < size) {
                    readableDatabase.rawQuery("SELECT substr(sealed, ?, ?) FROM attachments WHERE id=?", arrayOf((offset + 1).toString(), minOf(256 * 1024, size - offset).toString(), id)).use { chunk ->
                        check(chunk.moveToFirst())
                        val bytes = chunk.getBlob(0); require(bytes.isNotEmpty())
                        bytes.copyInto(sealed, offset); offset += bytes.size
                    }
                }
                require(sealed.size >= 28)
                val cipher = Cipher.getInstance("AES/GCM/NoPadding").apply {
                    init(Cipher.DECRYPT_MODE, secret, GCMParameterSpec(128, sealed.copyOfRange(0, 12)))
                    updateAAD("receipt:$id".toByteArray(Charsets.UTF_8))
                }
                val attachment = Attachment.decode(StrictJson.objectFrom(cipher.doFinal(sealed.copyOfRange(12, sealed.size))))
                require(attachment.id == id)
                add(attachment)
            }
        } }
    }
    @Synchronized fun incarnation(): String {
        readableDatabase.rawQuery("SELECT value FROM metadata WHERE key='incarnation'",null).use { if(it.moveToFirst()) return it.getString(0).also(Wire::requireId) }
        val id=Wire.id(); writableDatabase.execSQL("INSERT INTO metadata VALUES ('incarnation', ?)",arrayOf(id));return id
    }
    @Synchronized fun cloudCheckpoint(afterSnapshot: ()->Unit = {}): Triple<Snapshot,Long,String> {
        val db=writableDatabase;db.beginTransaction()
        try {val snapshot=snapshot();afterSnapshot();return Triple(snapshot,revision(),incarnation()).also {db.setTransactionSuccessful()}}
        finally {db.endTransaction()}
    }
    @Synchronized fun snapshot(): Snapshot {
        val db = readableDatabase
        db.beginTransaction()
        return try { Snapshot(vaultId(), all(), attachments = attachments(), finance = finance()).also { it.validate(); db.setTransactionSuccessful() } }
        finally { db.endTransaction() }
    }
    /** Returns the validated view only after the outer transaction commits. No
     * state/key cache survives this operation; another connection is read afresh. */
    @Synchronized fun save(expense: Expense, receipts: List<Attachment> = emptyList()): Snapshot = transaction {
        val proposed = (all().filterNot { it.id == expense.id } + expense).sortedWith(expenseOrder)
        require(proposed.size <= 10_000) { "The 10,000 expense limit is reached. Export and verify a backup before removing records to free space." }
        Money.total(proposed)
        require(receipts.all { it.expenseId == expense.id })
        val candidate = Snapshot(vaultId(), proposed, attachments = attachments() + receipts, finance = finance())
        Backup.requireCapacity(candidate)
        ReceiptImage.validate(receipts)
        val secret = key()
        val db = writableDatabase
        db.beginTransaction()
        try { write(expense, secret); receipts.forEach { writeAttachment(it, secret) }; bumpRevision(); db.setTransactionSuccessful() }
        finally { db.endTransaction() }
        candidate
    }
    private fun write(expense: Expense, secret: SecretKey) {
        writableDatabase.insertWithOnConflict("expenses", null, ContentValues().apply {
            put("id", expense.id); put("sealed", seal(expense, secret))
        }, SQLiteDatabase.CONFLICT_REPLACE).also { check(it != -1L) { "Expense could not be saved" } }
    }
    private fun writeAttachment(attachment: Attachment, secret: SecretKey) {
        val cipher = Cipher.getInstance("AES/GCM/NoPadding").apply { init(Cipher.ENCRYPT_MODE, secret); updateAAD("receipt:${attachment.id}".toByteArray(Charsets.UTF_8)) }
        val sealed = cipher.iv + cipher.doFinal(attachment.json().toString().toByteArray(Charsets.UTF_8))
        check(writableDatabase.insertOrThrow("attachments", null, ContentValues().apply { put("id", attachment.id); put("sealed", sealed) }) != -1L)
    }
    @Synchronized fun delete(id: String): Snapshot = transaction {
        Wire.requireId(id)
        val currentReceipts = attachments()
        val receipts = currentReceipts.filter { it.expenseId == id }
        val candidate = Snapshot(vaultId(), all().filterNot { it.id == id },
            attachments = currentReceipts.filterNot { it.expenseId == id }, finance = finance())
        candidate.validate()
        val db = writableDatabase
        db.beginTransaction()
        try { receipts.forEach { db.delete("attachments", "id=?", arrayOf(it.id)) }; db.delete("expenses", "id=?", arrayOf(id)); bumpRevision(); db.setTransactionSuccessful() }
        finally { db.endTransaction() }
        candidate
    }
    @Synchronized fun deleteAttachment(id: String) {
        Wire.requireId(id)
        val db = writableDatabase
        db.beginTransaction()
        try { key(); db.delete("attachments", "id=?", arrayOf(id)); bumpRevision(); db.setTransactionSuccessful() }
        finally { db.endTransaction() }
    }
    @Synchronized fun revision(): Long = readableDatabase.rawQuery("SELECT value FROM metadata WHERE key='revision'", null).use { if (it.moveToFirst()) it.getString(0).toLong() else 0L }
    @Synchronized fun finance(): FinanceData = transaction {
        val secret = key()
        val json = JSONObject()
        FinanceData.limits.keys.forEach { table ->
            val array = org.json.JSONArray()
            readableDatabase.rawQuery("SELECT id, sealed FROM $table",null).use { rows -> while(rows.moveToNext()) {
                val id = rows.getString(0); val bytes = rows.getBlob(1); require(bytes.size in 28..100_000)
                val cipher = Cipher.getInstance("AES/GCM/NoPadding").apply { init(Cipher.DECRYPT_MODE,secret,GCMParameterSpec(128,bytes.copyOfRange(0,12))); updateAAD("$table:$id".toByteArray(Charsets.UTF_8)) }
                val record = StrictJson.objectFrom(cipher.doFinal(bytes.copyOfRange(12,bytes.size)))
                require(Wire.string(record,"id") == id); array.put(record)
            } }
            json.put(table,array)
        }
        FinanceData.decode(json)
    }
    private fun writeFinance(table: String, record: FinanceRecord, secret: SecretKey) {
        require(table in FinanceData.limits)
        val cipher = Cipher.getInstance("AES/GCM/NoPadding").apply { init(Cipher.ENCRYPT_MODE,secret); updateAAD("$table:${record.id}".toByteArray(Charsets.UTF_8)) }
        val sealed = cipher.iv + cipher.doFinal(StrictJson.bytes(record.json()))
        check(writableDatabase.insertWithOnConflict(table,null,ContentValues().apply { put("id",record.id); put("sealed",sealed) },SQLiteDatabase.CONFLICT_REPLACE) != -1L)
    }
    private fun changedFinance(current: FinanceData, record: FinanceRecord, deleting: Boolean): Pair<String,FinanceData> {
        fun <T:FinanceRecord> changed(rows: List<T>, value: T) = rows.filterNot { it.id == value.id } + if(deleting) emptyList() else listOf(value)
        return when(record) {
            is Budget -> "budgets" to current.copy(budgets=changed(current.budgets,record))
            is IncomeSource -> { require(!deleting) { "Deactivate income sources to preserve history" }; "incomeSources" to current.copy(incomeSources=changed(current.incomeSources,record)) }
            is IncomeEntry -> "incomeEntries" to current.copy(incomeEntries=changed(current.incomeEntries,record))
            is SavingsGoal -> { require(!deleting) { "Deactivate savings goals to preserve history" }; "savingsGoals" to current.copy(savingsGoals=changed(current.savingsGoals,record)) }
            is SavingsEntry -> "savingsEntries" to current.copy(savingsEntries=changed(current.savingsEntries,record))
            is RecurringExpense -> { require(!deleting) { "Deactivate recurring templates to preserve history" }; "recurringExpenses" to current.copy(recurringExpenses=changed(current.recurringExpenses,record)) }
            else -> error("Unsupported finance record")
        }
    }
    @Synchronized fun saveFinance(record: FinanceRecord, deleting: Boolean = false) {
        val db = writableDatabase; db.beginTransaction()
        try {
            val current = snapshot(); val (table,next) = changedFinance(current.finance,record,deleting)
            Backup.requireCapacity(current.copy(finance=next))
            if(deleting) db.delete(table,"id=?",arrayOf(record.id)) else writeFinance(table,record,key())
            bumpRevision(); db.setTransactionSuccessful()
        } finally { db.endTransaction() }
    }
    @Synchronized fun postRecurring(templateId: String, date: String): Expense {
        Wire.requireId(templateId); Wire.requireDate(date)
        val db = writableDatabase; db.beginTransaction()
        return try {
            val current = snapshot()
            val existing = current.expenses.firstOrNull { it.recurringTemplateId == templateId && it.recurringOccurrenceDate == date }
            val record = existing ?: run {
                val template = current.finance.recurringExpenses.first { it.id == templateId }
                require(template.isActive && date in FinanceMath.occurrences(template.schedule,date,date)) { "This occurrence is no longer due" }
                Expense(merchant=template.merchant,amountMinor=template.amountMinor,expenseDate=date,category=template.category,note=template.note,description=template.description,recurringTemplateId=template.id,recurringOccurrenceDate=date).also { save(it) }
            }
            db.setTransactionSuccessful(); record
        } finally { db.endTransaction() }
    }
    @Synchronized fun postIncome(sourceId: String, date: String, receivedDate: String, amount: Long, note: String): IncomeEntry {
        Wire.requireId(sourceId); Wire.requireDate(date)
        val db = writableDatabase; db.beginTransaction()
        return try {
            val current = snapshot()
            val existing = current.finance.incomeEntries.firstOrNull { it.sourceId == sourceId && it.occurrenceDate == date }
            val record = existing ?: run {
                val source = current.finance.incomeSources.first { it.id == sourceId }
                require(source.isActive && date in FinanceMath.occurrences(source.schedule,date,date,source.isRecurring)) { "This income occurrence is no longer due" }
                IncomeEntry(sourceId=sourceId,receivedDate=receivedDate,amountMinor=amount,note=note,occurrenceDate=date).also { saveFinance(it) }
            }
            db.setTransactionSuccessful(); record
        } finally { db.endTransaction() }
    }
    private fun bumpRevision() {
        val next = Math.addExact(revision(), 1L)
        check(writableDatabase.insertWithOnConflict("metadata", null, ContentValues().apply { put("key", "revision"); put("value", next.toString()) }, SQLiteDatabase.CONFLICT_REPLACE) != -1L)
    }
    @Synchronized fun vaultId(): String = readableDatabase.rawQuery("SELECT value FROM metadata WHERE key='vaultId'", null).use { it.moveToFirst(); it.getString(0) }
    @Synchronized fun replace(snapshot: Snapshot, expectedRevision: Long? = null) {
        snapshot.validate()
        Backup.requireCapacity(snapshot)
        ReceiptImage.validate(snapshot.attachments)
        val db = writableDatabase
        db.beginTransaction()
        try {
            require(expectedRevision == null || revision() == expectedRevision) { "Your vault changed after the preview. Open the backup again before replacing it." }
            val secret = key(allowVerifiedRecovery = true) // Only the confirmed, fully validated restore can recover a lost key.
            db.delete("expenses", null, null)
            db.delete("attachments", null, null)
            FinanceData.limits.keys.forEach { db.delete(it,null,null) }
            snapshot.expenses.forEach { write(it, secret) }
            snapshot.attachments.forEach { writeAttachment(it, secret) }
            snapshot.finance.domains().forEach { (table,rows) -> rows.forEach { writeFinance(table,it,secret) } }
            db.execSQL("UPDATE metadata SET value=? WHERE key='vaultId'", arrayOf(snapshot.vaultId))
            check(all().toSet() == snapshot.expenses.toSet() && attachments().toSet() == snapshot.attachments.toSet()) { "Replacement verification failed" }
            check(finance() == snapshot.finance) { "Finance replacement verification failed" }
            db.execSQL("INSERT OR REPLACE INTO metadata VALUES ('incarnation', ?)",arrayOf(Wire.id()))
            bumpRevision()
            db.setTransactionSuccessful()
        } finally { db.endTransaction() }
    }
}
