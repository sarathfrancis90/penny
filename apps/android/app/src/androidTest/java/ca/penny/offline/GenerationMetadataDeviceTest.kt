package ca.penny.offline

import android.content.ContextWrapper
import androidx.test.platform.app.InstrumentationRegistry
import java.io.File
import java.security.KeyStore
import java.security.MessageDigest
import java.util.Base64
import javax.crypto.Cipher
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

class GenerationMetadataDeviceTest {
    private val instrumentation=InstrumentationRegistry.getInstrumentation()
    private fun fixture(name: String)=instrumentation.context.assets.open("local-generation-v1/$name.json").use {Snapshot.decode(StrictJson.objectFrom(it.readBytes()))}
    private fun fails(message: String? = null, block: ()->Unit) {
        val failure=runCatching(block).exceptionOrNull();assertNotNull(failure)
        if(message!=null) assertTrue(failure.toString(),failure!!.message.orEmpty().contains(message))
    }
    private fun isolated(block: (VaultStore,String,File)->Unit) {
        val target=instrumentation.targetContext;assertEquals("ca.penny.offline.dev.test",target.packageName)
        val dir=File(target.noBackupFilesDir,"metadata-test-${Wire.id()}").apply {mkdir()}
        val context=object:ContextWrapper(target) {override fun getNoBackupFilesDir()=dir}
        val alias="penny.test.metadata.${Wire.id()}"
        try {VaultStore(context,"vault.db",alias).use {block(it,alias,dir)}}
        finally {dir.deleteRecursively();KeyStore.getInstance("AndroidKeyStore").apply {load(null);deleteEntry(alias)}}
    }
    private fun assertSummary(snapshot: Snapshot, metadata: VaultGenerations.VerifiedMetadata) {
        assertEquals(snapshot.vaultId,metadata.vaultId);assertEquals(snapshot.snapshotId,metadata.snapshotId);assertEquals(snapshot.createdAt,metadata.createdAt)
        assertEquals(snapshot.expenses.size,metadata.counts["expenses"]);assertEquals(snapshot.attachments.size,metadata.counts["attachments"])
        snapshot.finance.domains().forEach {(name,rows)->assertEquals(rows.size,metadata.counts[name])}
        assertEquals(Money.total(snapshot.expenses),metadata.expenseTotalMinor);assertEquals(snapshot.attachments.sumOf {it.byteCount},metadata.receiptBytes)
        assertEquals(digest(snapshot),metadata.digest)
        fails { (metadata.counts as MutableMap)["expenses"]=999 }
    }
    @Test fun summariesMatchAllDomainSnapshotsAndValidationPathsNeverRequestHydration()=isolated {store,_,_ ->
        for(name in listOf("previous","replacement")) {
            val input=fixture(name)
            store.generations.fault={if(it==VaultGenerations.Point.SNAPSHOT_HYDRATION) error("unexpected hydration")}
            store.replace(input);assertSummary(input,store.generations.verifiedMetadata());assertEquals(input.vaultId,store.vaultId())
            fails("unexpected hydration") {store.snapshot()}
            store.generations.fault={};val snapshot=store.snapshot();snapshot.validate();assertSummary(snapshot,store.generations.verifiedMetadata())
            assertEquals(input.attachments,snapshot.attachments)
        }
    }
    private fun crypt(bytes: ByteArray, key: SecretKey, alias: String, domain: String, encrypt: Boolean): ByteArray {
        val cipher=Cipher.getInstance("AES/GCM/NoPadding")
        if(encrypt) cipher.init(Cipher.ENCRYPT_MODE,key) else cipher.init(Cipher.DECRYPT_MODE,key,GCMParameterSpec(128,bytes,0,12))
        cipher.updateAAD("PENNY-LOCAL-GENERATIONS:1:$alias:$domain".toByteArray())
        return if(encrypt) cipher.iv+cipher.doFinal(bytes) else cipher.doFinal(bytes,12,bytes.size-12)
    }
    private fun key(store: VaultStore, alias: String): Pair<String,ByteArray> = store.readableDatabase.rawQuery("SELECT id,wrappedKey FROM vault_generations",null).use {
        assertTrue(it.moveToFirst());val id=it.getString(0)
        val device=KeyStore.getInstance("AndroidKeyStore").apply {load(null)}.getKey(alias,null) as SecretKey
        id to crypt(it.getBlob(1),device,alias,"key:$id",false)
    }
    private fun editRow(store: VaultStore, alias: String, generation: String, raw: ByteArray, domain: String, id: String, edit: (JSONObject)->Unit) {
        val old=store.readableDatabase.rawQuery("SELECT sealed FROM vault_rows WHERE generationId=? AND domain=? AND id=?",arrayOf(generation,domain,id)).use {assertTrue(it.moveToFirst());it.getBlob(0)}
        val aad="row:$generation:$domain:$id";val secret=SecretKeySpec(raw,"AES")
        val json=StrictJson.objectFrom(crypt(old,secret,alias,aad,false));edit(json)
        store.writableDatabase.execSQL("UPDATE vault_rows SET sealed=? WHERE generationId=? AND domain=? AND id=?",arrayOf(crypt(StrictJson.bytes(json),secret,alias,aad,true),generation,domain,id))
    }
    @Test fun authenticatedInvalidMetadataMatchesExistingSnapshotSemanticRejection()=isolated {store,alias,_ ->
        val input=fixture("previous")
        for(mode in listOf("receipt-owner","income-reference","budget-pair")) {
            store.replace(input);val (generation,raw)=key(store,alias)
            try {
                when(mode) {
                    "receipt-owner" -> {
                        val missing=Wire.id();fails("Receipt owner") {input.copy(attachments=input.attachments.map {it.copy(expenseId=missing)}).validate()}
                        editRow(store,alias,generation,raw,"attachments",input.attachments.single().id) {it.put("expenseId",missing)}
                    }
                    "income-reference" -> {
                        val missing=Wire.id();val entry=input.finance.incomeEntries.first()
                        fails("Missing financial") {input.copy(finance=input.finance.copy(incomeEntries=input.finance.incomeEntries.map {if(it.id==entry.id) it.copy(sourceId=missing) else it})).validate()}
                        editRow(store,alias,generation,raw,"incomeEntries",entry.id) {it.put("sourceId",missing)}
                    }
                    else -> {
                        val duplicate=input.finance.budgets.first().copy(id=Wire.id());fails("budget already") {input.copy(finance=input.finance.copy(budgets=input.finance.budgets+duplicate)).validate()}
                        val sealed=crypt(StrictJson.bytes(duplicate.json()),SecretKeySpec(raw,"AES"),alias,"row:$generation:budgets:${duplicate.id}",true)
                        store.writableDatabase.execSQL("INSERT INTO vault_rows VALUES (?,?,?,?)",arrayOf(generation,"budgets",duplicate.id,sealed))
                    }
                }
                val message=when(mode) {"receipt-owner"->"Receipt owner";"income-reference"->"Missing financial";else->"budget already"}
                fails(message) {store.generations.verifiedMetadata()};fails(message) {store.snapshot()}
            } finally {raw.fill(0)}
        }
    }
    @Test fun authenticationMembershipAndMissingKeyFailClosedWithoutDeletingEvidence()=isolated {store,alias,dir ->
        val input=fixture("previous");store.replace(input)
        val files=dir.walkTopDown().filter {it.extension=="pennyreceipt"}.associateWith {it.readBytes()}
        store.writableDatabase.execSQL("UPDATE vault_generations SET sealedHeader=zeroblob(length(sealedHeader))")
        fails {store.generations.verifiedMetadata()};fails {store.snapshot()}
        files.forEach {(file,bytes)->assertArrayEquals(bytes,file.readBytes())}
        store.replace(input)
        store.writableDatabase.execSQL("DELETE FROM vault_rows WHERE domain='budgets'")
        fails("membership") {store.generations.verifiedMetadata()};fails("membership") {store.snapshot()}
        store.replace(input);KeyStore.getInstance("AndroidKeyStore").apply {load(null);deleteEntry(alias)}
        fails {store.generations.verifiedMetadata()};fails {store.snapshot()}
    }
    private fun digest(snapshot: Snapshot): String {
        val hash=MessageDigest.getInstance("SHA-256")
        fun add(domain: String,id: String,bytes: ByteArray) {hash.update("$domain:$id:${bytes.size}:".toByteArray());hash.update(bytes)}
        add("vault","",snapshot.vaultId.toByteArray());snapshot.expenses.sortedBy {it.id}.forEach {add("expenses",it.id,StrictJson.bytes(it.json()))}
        snapshot.attachments.sortedBy {it.id}.forEach {add("attachments",it.id,StrictJson.bytes(it.json().apply {remove("dataBase64")}))}
        snapshot.finance.domains().forEach {(domain,rows)->rows.sortedBy {it.id}.forEach {add(domain,it.id,StrictJson.bytes(it.json()))}}
        return hash.digest().joinToString("") {"%02x".format(it.toInt() and 255)}
    }
    @Test fun matchingCiphertextHashAndMembershipStillRequireFullNativeImageDecode()=isolated {store,alias,dir ->
        val input=fixture("previous");store.replace(input);val (generation,raw)=key(store,alias)
        try {
            val original=input.attachments.single();val bytes=original.bytes()
            val idat=(0 until bytes.size-4).first {String(bytes,it,4,Charsets.US_ASCII)=="IDAT"};bytes[idat+4]=0 // invalid zlib header, structurally complete PNG
            val changed=original.copy(sha256=Attachment.digest(bytes),dataBase64=Base64.getEncoder().encodeToString(bytes))
            val snapshot=input.copy(attachments=listOf(changed));snapshot.validate();fails {ReceiptImage.decode(bytes).recycle()}
            var descriptor: LocalReceiptBlob.Descriptor?=null
            editRow(store,alias,generation,raw,"attachments",original.id) {j->j.put("sha256",changed.sha256);descriptor=LocalReceiptBlob.Descriptor(j.getString("vaultId"),j.getString("generationId"),j.getString("id"),j.getString("expenseId"),j.getString("mediaType"),j.getLong("byteCount"),j.getString("sha256"))}
            val d=checkNotNull(descriptor);val receiptKey=LocalReceiptBlob.Codec.key(raw,d.vaultId,d.generationId)
            val nonce=ByteArray(12).also {java.security.SecureRandom().nextBytes(it)};val cipher=Cipher.getInstance("AES/GCM/NoPadding")
            cipher.init(Cipher.ENCRYPT_MODE,SecretKeySpec(receiptKey,"AES"),GCMParameterSpec(128,nonce));cipher.updateAAD(LocalReceiptBlob.Codec.aad(d))
            val file=File(dir,"${LocalReceiptBlob.ROOT_NAME}/${d.generationId}/${d.id}.pennyreceipt");file.writeBytes("PNYRCP01".toByteArray()+nonce+cipher.doFinal(bytes));receiptKey.fill(0);bytes.fill(0)
            val h=JSONObject().put("format",1).put("generationId",generation).put("vaultId",snapshot.vaultId).put("snapshotId",snapshot.snapshotId).put("createdAt",snapshot.createdAt).put("digest",digest(snapshot))
            store.writableDatabase.execSQL("UPDATE vault_generations SET sealedHeader=? WHERE id=?",arrayOf(crypt(StrictJson.bytes(h),SecretKeySpec(raw,"AES"),alias,"header:$generation",true),generation))
            val before=file.readBytes();fails {store.generations.verifiedMetadata()};fails {store.snapshot()};assertArrayEquals(before,file.readBytes())
        } finally {raw.fill(0)}
    }
}
