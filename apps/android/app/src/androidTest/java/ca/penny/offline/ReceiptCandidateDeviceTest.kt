package ca.penny.offline

import android.content.Context
import android.content.ContextWrapper
import androidx.test.platform.app.InstrumentationRegistry
import java.io.ByteArrayInputStream
import java.io.File
import java.io.IOException
import java.security.KeyStore
import java.util.Base64
import org.junit.Assert.*
import org.junit.Test

class ReceiptCandidateDeviceTest {
    private val instrumentation=InstrumentationRegistry.getInstrumentation()
    private fun fixture(name: String)=instrumentation.context.assets.open("local-generation-v1/$name.json").use {Snapshot.decode(StrictJson.objectFrom(it.readBytes()))}
    private fun declarations(s: Snapshot)=s.attachments.map {VaultGenerations.ReceiptDeclaration(it.id,it.expenseId,it.mediaType,it.byteCount,it.sha256)}
    private fun fails(block: ()->Unit) {assertNotNull(runCatching(block).exceptionOrNull())}
    private fun isolated(block: (VaultStore,Context,String,File)->Unit) {
        val target=instrumentation.targetContext;assertEquals("ca.penny.offline.dev.test",target.packageName)
        val dir=File(target.noBackupFilesDir,"candidate-test-${Wire.id()}").apply {mkdir()}
        val context=object:ContextWrapper(target) {override fun getNoBackupFilesDir()=dir};val alias="penny.test.candidate.${Wire.id()}"
        try {VaultStore(context,"vault.db",alias).use {it.replace(fixture("previous"));block(it,context,alias,dir)}}
        finally {dir.deleteRecursively();KeyStore.getInstance("AndroidKeyStore").apply {load(null);deleteEntry(alias)}}
    }
    private fun ids(store: VaultStore)=store.readableDatabase.rawQuery("SELECT id FROM vault_generations",null).use {r->buildSet {while(r.moveToNext()) add(r.getString(0))}}
    private fun state(store: VaultStore)=store.readableDatabase.rawQuery("SELECT key,value FROM metadata ORDER BY key",null).use {r->buildMap {while(r.moveToNext()) put(r.getString(0),r.getString(1))}}
    private fun wrapped(store: VaultStore)=store.readableDatabase.rawQuery("SELECT id,wrappedKey FROM vault_generations",null).use {r->buildMap {while(r.moveToNext()) put(r.getString(0),Base64.getEncoder().encodeToString(r.getBlob(1)))}}
    private fun equal(expected: Snapshot,actual: Snapshot) {
        assertEquals(expected.vaultId,actual.vaultId);assertEquals(expected.expenses.toSet(),actual.expenses.toSet());assertEquals(expected.finance,actual.finance);assertEquals(expected.attachments.toSet(),actual.attachments.toSet())
    }
    // Test-only reflection uses the existing authenticated hydration adapter. No
    // candidate identifier/read/install API is added to production handles.
    private fun readInactive(store: VaultStore,id: String): Snapshot = VaultGenerations::class.java.getDeclaredMethod("read",String::class.java).let {it.isAccessible=true;it.invoke(store.generations,id) as Snapshot}
    private fun stream(preparation: VaultGenerations.ReceiptPreparation,snapshot: Snapshot) {
        snapshot.attachments.forEach {receipt->val bytes=receipt.bytes();try {preparation.append(receipt.id,ByteArrayInputStream(bytes))} finally {bytes.fill(0)}}
    }
    @Test fun isolatedRoundtripFreezesInputAndTransfersOwnershipOnce()=isolated {store,_,_,_ ->
        val previous=store.snapshot();val before=state(store);val keys=wrapped(store);val oldIds=ids(store);val next=fixture("replacement")
        val expenses=next.expenses.toMutableList();val budgets=next.finance.budgets.toMutableList();val declared=declarations(next).toMutableList()
        val preparation=store.generations.beginReceiptPreparation(next.copy(expenses=expenses,attachments=emptyList(),finance=next.finance.copy(budgets=budgets)),declared)
        expenses.clear();budgets.clear();declared.clear()
        equal(previous,store.snapshot());assertEquals(before,state(store));keys.forEach {(id,key)->assertEquals(key,wrapped(store)[id])}
        stream(preparation,next);equal(previous,store.snapshot());assertEquals(before,state(store))
        store.generations.fault={if(it==VaultGenerations.Point.SNAPSHOT_HYDRATION) error("candidate requested aggregate hydration")}
        val candidate=preparation.finish();store.generations.fault={}
        preparation.close();fails {preparation.finish()};fails {preparation.append(next.attachments.single().id,next.attachments.single().bytes())}
        assertEquals(next.vaultId,candidate.metadata.vaultId);assertEquals(next.snapshotId,candidate.metadata.snapshotId);assertEquals(next.createdAt,candidate.metadata.createdAt)
        assertEquals(Money.total(next.expenses),candidate.metadata.expenseTotalMinor);assertEquals(1,candidate.metadata.counts["attachments"])
        equal(next,readInactive(store,(ids(store)-oldIds).single()));equal(previous,store.snapshot());assertEquals(before,state(store))
        candidate.close();candidate.close();assertEquals(oldIds,ids(store));assertEquals(keys,wrapped(store));assertEquals(before,state(store))
    }
    @Test fun wrongOwnerHashMissingDuplicateAndNativeInvalidCannotReturnCandidate()=isolated {store,_,_,dir ->
        val next=fixture("replacement");val original=store.snapshot();val before=state(store);val keys=wrapped(store);val oldIds=ids(store)
        fails {store.generations.beginReceiptPreparation(next.copy(attachments=emptyList()),declarations(next).map {it.copy(expenseId=Wire.id())})}
        for(mode in listOf("hash","size","missing","duplicate","undeclared","native")) {
            val receipt=next.attachments.single();var bytes=receipt.bytes();var declared=declarations(next)
            if(mode=="native") {
                val cases=instrumentation.context.assets.open("png-integrity-corpus.json").use {StrictJson.objectFrom(it.readBytes())}.getJSONArray("cases")
                val bad=(0 until cases.length()).map {cases.getJSONObject(it)}.single {it.getString("id")=="rgba9-plain-invalid_filter"}
                bytes=Base64.getDecoder().decode(bad.getString("dataBase64"));assertEquals("image/png",Attachment.mediaType(bytes))
                declared=declared.map {it.copy(byteCount=bytes.size.toLong(),sha256=Attachment.digest(bytes))}
            }
            val p=store.generations.beginReceiptPreparation(next.copy(attachments=emptyList()),declared)
            try {fails {
                when(mode) {
                    "size"->p.append(receipt.id,bytes+byteArrayOf(0))
                    "missing"->p.finish()
                    "duplicate"->{p.append(receipt.id,bytes);p.append(receipt.id,bytes)}
                    "undeclared"->p.append(Wire.id(),bytes)
                    "hash"->{bytes[0]=(bytes[0].toInt() xor 1).toByte();p.append(receipt.id,bytes)}
                    else->p.append(receipt.id,bytes)
                }
            }} finally {p.close();bytes.fill(0)}
            assertEquals(oldIds,ids(store));assertEquals(keys,wrapped(store));assertEquals(before,state(store));equal(original,store.snapshot())
            assertEquals(original.attachments.size,dir.walkTopDown().count {it.extension=="pennyreceipt"})
        }
    }
    @Test fun readEofCloseAndCancellationFailuresDiscardOnlyOwnedPreparation()=isolated {store,_,_,_ ->
        val next=fixture("replacement");val receipt=next.attachments.single();val before=state(store);val keys=wrapped(store)
        for(mode in listOf("read","over-report","close","short","trailing","cancel-input","cancel-final","cancel-close","failed-close")) {
            val token=RestoreOperation();val p=store.generations.beginReceiptPreparation(next.copy(attachments=emptyList()),declarations(next),token)
            var inputClosed=false
            val original=receipt.bytes();val data=when(mode) {"short"->original.copyOf(original.size-1);"trailing"->original+byteArrayOf(0);else->original}
            val input=object:ByteArrayInputStream(data) {
                override fun read(b:ByteArray,off:Int,len:Int):Int {if(mode=="read") throw IOException("injected input read");val count=super.read(b,off,len);return if(mode=="over-report") count+1 else count}
                override fun close() {inputClosed=true;super.close();if(mode=="close") throw IOException("injected input close")}
            }
            store.generations.fault={point->
                if((mode=="cancel-input" && point==VaultGenerations.Point.CANDIDATE_INPUT) || (mode=="cancel-final" && point==VaultGenerations.Point.CANDIDATE_VERIFIED) || (mode=="cancel-close" && point==VaultGenerations.Point.CANDIDATE_CLOSED)) token.cancel()
                if(mode=="failed-close" && point==VaultGenerations.Point.CANDIDATE_CLOSED) throw IOException("injected after verification closes; ownership pins retained")
            }
            try {fails {p.append(receipt.id,input);p.finish()};assertTrue(inputClosed);fails {p.finish()}}
            finally {store.generations.fault={};p.close();original.fill(0);data.fill(0)}
            assertEquals(before,state(store));assertEquals(keys,wrapped(store));equal(fixture("previous"),store.snapshot())
        }
    }
    @Test fun candidatePinSurvivesOrdinaryWriteAndCollectorAcrossConnections()=isolated {store,context,alias,_ ->
        val next=fixture("replacement");val initial=ids(store)
        val p=store.generations.beginReceiptPreparation(next.copy(attachments=emptyList()),declarations(next))
        VaultStore(context,"vault.db",alias).use {it.save(it.all().first().copy(note="edit while receiving"))}
        assertEquals(2,ids(store).size);stream(p,next);val candidate=p.finish();p.close()
        VaultStore(context,"vault.db",alias).use {it.save(it.all().first().copy(note="edit while candidate pinned"))}
        val live=store.snapshot();val before=state(store);equal(next,readInactive(store,(ids(store)-initial).single()))
        candidate.close();assertEquals(initial,ids(store));assertEquals(before,state(store));equal(live,store.snapshot())
    }
    @Test fun foreignObjectsAndSuppressedCleanupFaultKeepEvidenceAndReleasePin()=isolated {store,context,alias,dir ->
        val next=fixture("replacement");val initial=ids(store);val before=state(store)
        val p=store.generations.beginReceiptPreparation(next.copy(attachments=emptyList()),declarations(next));stream(p,next)
        val candidate=p.finish();val file=dir.walkTopDown().single {it.name=="${next.attachments.single().id}.pennyreceipt"}
        val ciphertext=file.readBytes();val foreign=File(file.parentFile,"foreign").apply {writeText("keep foreign")}
        // Hold the original inode pinned, then substitute identical ciphertext.
        assertTrue(file.delete());file.writeBytes(ciphertext)
        fails {candidate.close()};candidate.close();assertArrayEquals(ciphertext,file.readBytes());assertEquals("keep foreign",foreign.readText());assertEquals(before,state(store))
        assertEquals(initial.size+1,ids(store).size)
        foreign.delete()
        VaultStore(context,"vault.db",alias).use {reopened->reopened.save(reopened.all().first().copy(note="collector must not reacquire unowned substituted candidate"))}
        assertArrayEquals(ciphertext,file.readBytes());assertEquals(initial.size+1,ids(store).size)
        val after=state(store);val staged=store.generations.beginReceiptPreparation(next.copy(attachments=emptyList()),declarations(next));stream(staged,next)
        val keys=wrapped(store)
        store.generations.fault={if(it==VaultGenerations.Point.CANDIDATE_VERIFIED) throw IOException("injected finish failure").apply {addSuppressed(IOException("injected uncertain cleanup"))}}
        try {fails {staged.finish()}} finally {store.generations.fault={};staged.close()}
        assertEquals(after,state(store));assertEquals(keys,wrapped(store)) // Conservative catalog/key retention, not real FD-close failure proof.
    }
    @Test fun cancelledAndUnavailableKeyPreviewNeverProvisionsOrChangesActiveState()=isolated {store,_,alias,_ ->
        val next=fixture("replacement");val before=state(store);val keys=wrapped(store)
        val token=RestoreOperation();token.cancel();fails {store.generations.beginReceiptPreparation(next.copy(attachments=emptyList()),declarations(next),token)}
        assertEquals(before,state(store));assertEquals(keys,wrapped(store))
        val keyStore=KeyStore.getInstance("AndroidKeyStore").apply {load(null);deleteEntry(alias)}
        fails {store.generations.beginReceiptPreparation(next.copy(attachments=emptyList()),declarations(next))}
        assertFalse(keyStore.containsAlias(alias));assertEquals(before,state(store));assertEquals(keys,wrapped(store))
    }
    @Test fun declaredCapsAndWireSizeFailBeforeInactiveRowsAreWritten()=isolated {store,_,_,_ ->
        val next=fixture("replacement");val metadata=next.copy(attachments=emptyList());val before=state(store);val keys=wrapped(store);val d=declarations(next).single()
        for(declared in listOf(List(101) {d.copy(id=Wire.id())},listOf(d,d),listOf(d.copy(byteCount=Attachment.maxBytes.toLong()+1)),List(5) {d.copy(id=Wire.id(),byteCount=Attachment.maxBytes.toLong())})) {
            fails {store.generations.beginReceiptPreparation(metadata,declared)};assertEquals(keys,wrapped(store));assertEquals(before,state(store))
        }
        val oversized=Snapshot(next.vaultId,List(10000) {next.expenses.first().copy(id=Wire.id(),description="x".repeat(2000),note="x".repeat(2000),recurringTemplateId=null,recurringOccurrenceDate=null)})
        oversized.validate();fails {Backup.requireCapacity(oversized)};fails {store.generations.beginReceiptPreparation(oversized,emptyList())}
        assertEquals(keys,wrapped(store));assertEquals(before,state(store))
    }
}
