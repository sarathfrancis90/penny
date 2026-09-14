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
        fun create(db: SQLiteDatabase) {
            db.execSQL("CREATE TABLE IF NOT EXISTS vault_generations (id TEXT PRIMARY KEY NOT NULL, wrappedKey BLOB NOT NULL, sealedHeader BLOB NOT NULL)")
            db.execSQL("CREATE TABLE IF NOT EXISTS vault_rows (generationId TEXT NOT NULL, domain TEXT NOT NULL, id TEXT NOT NULL, sealed BLOB NOT NULL, PRIMARY KEY(generationId,domain,id))")
            db.execSQL("CREATE TABLE IF NOT EXISTS vault_receipts (id TEXT PRIMARY KEY NOT NULL, owner TEXT NOT NULL, sealed BLOB NOT NULL)")
        }
    }
    internal enum class Point { FILES_READY, ROWS_READY, POINTER_COMMITTED, REOPENED }
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
    private fun digest(snapshot: Snapshot): String {
        val digest=java.security.MessageDigest.getInstance("SHA-256")
        fun add(domain: String, id: String, bytes: ByteArray) {digest.update("$domain:$id:${bytes.size}:".toByteArray());digest.update(bytes)}
        add("vault","",snapshot.vaultId.toByteArray())
        snapshot.expenses.sortedBy {it.id}.forEach {add("expenses",it.id,StrictJson.bytes(it.json()))}
        snapshot.attachments.sortedBy {it.id}.forEach {add("attachments",it.id,StrictJson.bytes(it.json().apply {remove("dataBase64")}))}
        snapshot.finance.domains().forEach {(domain,rows)-> rows.sortedBy {it.id}.forEach {add(domain,it.id,StrictJson.bytes(it.json()))}}
        return digest.digest().joinToString("") {"%02x".format(it.toInt() and 255)}
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
    private fun setHeader(id: String, raw: ByteArray, snapshot: Snapshot) {
        val h=JSONObject().put("format",1).put("generationId",id).put("vaultId",snapshot.vaultId).put("snapshotId",snapshot.snapshotId).put("createdAt",snapshot.createdAt).put("digest",digest(snapshot))
        check(db().update("vault_generations",ContentValues().apply {put("sealedHeader",seal(h,SecretKeySpec(raw,"AES"),"header:$id"))},"id=?",arrayOf(id))==1)
    }
    private fun read(id: String): Snapshot {
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
            val attachments=mutableListOf<Attachment>()
            descriptors.groupBy {it.generationId}.forEach {(group,items) ->
                require(items.all {it.vaultId==Wire.string(h,"vaultId")})
                LocalReceiptBlob.consumeReopened(context,raw,Wire.string(h,"vaultId"),group,items) { d,bytes ->
                    attachments += Attachment(d.id,d.expenseId,d.mediaType,d.byteCount,d.sha256,Base64.getEncoder().encodeToString(bytes))
                }
            }
            val snapshot=Snapshot(Wire.string(h,"vaultId"),expenses.sortedWith(compareByDescending<Expense>{it.expenseDate}.thenByDescending{it.createdAt}.thenBy{it.id}),Wire.string(h,"snapshotId"),Wire.string(h,"createdAt"),attachments,FinanceData.decode(finance))
            snapshot.validate();require(digest(snapshot)==Wire.string(h,"digest")) {"Generation membership changed"}
            return snapshot
        } finally {raw.fill(0)}
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
    private fun prepare(snapshot: Snapshot, guard: () -> Unit = {}): String {
        guard()
        snapshot.validate();Backup.requireCapacity(snapshot);ReceiptImage.validate(snapshot.attachments)
        val id=Wire.id();val raw=ByteArray(32).also {SecureRandom().nextBytes(it)}
        try {
            val wrapped=crypt(raw,device(true),"key:$id",true)
            transaction {db().insertOrThrow("vault_generations",null,ContentValues().apply {put("id",id);put("wrappedKey",wrapped);put("sealedHeader",byteArrayOf())});setHeader(id,raw,snapshot)}
            val descriptors=receiptFiles(id,raw,snapshot,guard);fault(Point.FILES_READY);guard()
            transaction {writeRows(id,raw,rowMap(snapshot,descriptors),guard);read(id);fault(Point.ROWS_READY);guard()}
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
        try {transaction {read(current.active)}} catch(failure: Exception) {
            val previous=current.previous ?: run {
                // First migration retains the complete legacy source until finalization.
                migrationSource(legacy())
                transaction {db().delete("metadata","key IN ('activeState','generationFormat')",null)}
                throw IllegalStateException("Interrupted migration retained its legacy source; reopen the vault",failure)
            }
            transaction {read(previous.id);setState(State(previous.id,null,false,previous.revision,previous.incarnation))}
            throw IllegalStateException("Interrupted replacement was rolled back; reopen the vault",failure)
        }
        fault(Point.REOPENED)
        transaction {setState(current.copy(previous=null,pending=false));domains.forEach {db().delete(it,null,null)};db().delete("metadata","key='migrationSource'",null)}
        collect(state())
        return state()
    }
    private fun collect(current: State) {
        val protected = setOfNotNull(current.active,current.previous?.id)
        val liveGroups=mutableSetOf<String>()
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
    fun snapshot(): Snapshot = locked {val current=ensure();transaction {read(current.active)}}
    fun revision(): Long = locked { legacyRevision() }
    fun incarnation(): String = locked {ensure().incarnation}
    fun vaultId(): String = locked {snapshot().vaultId}
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
                val next=current.copy(revision=Math.addExact(current.revision,1));setState(next);read(current.active)
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
        try { transaction {
            operation.check()
            require(expectedBinding==null || binding()==expectedBinding) {"Vault identity changed during preparation"}
            check(get("activeState")==token) {"Vault changed during preparation"}
            read(id)
            operation.beginPublication() // Cancellation after this CAS cannot claim the old vault was retained.
            setState(State(id,old?.let {Previous(it.active,it.revision,it.incarnation)},true,Math.addExact(revision,1),Wire.id()))
        }
        } catch(failure: Throwable) {cleanupFailed(failure);throw failure}
        fault(Point.POINTER_COMMITTED)
        recover();Unit
    }
}
