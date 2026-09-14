package ca.penny.offline

import android.content.Context
import android.content.ContextWrapper
import androidx.test.platform.app.InstrumentationRegistry
import java.io.ByteArrayInputStream
import java.io.File
import java.security.KeyStore
import org.junit.Assert.*
import org.junit.Test

class CandidateInstallDeviceTest {
    private val instrumentation=InstrumentationRegistry.getInstrumentation()
    private fun fixture(name: String)=instrumentation.context.assets.open("local-generation-v1/$name.json").use {Snapshot.decode(StrictJson.objectFrom(it.readBytes()))}
    private fun fails(block: ()->Unit) {assertNotNull(runCatching(block).exceptionOrNull())}
    private fun isolated(block: (VaultStore,Context,String,File)->Unit) {
        val target=instrumentation.targetContext;assertEquals("ca.penny.offline.dev.test",target.packageName)
        val dir=File(target.noBackupFilesDir,"candidate-install-${Wire.id()}").apply {mkdir()}
        val context=object:ContextWrapper(target) {override fun getNoBackupFilesDir()=dir};val alias="penny.test.install.${Wire.id()}"
        try {VaultStore(context,"vault.db",alias).use {it.replace(fixture("previous"));block(it,context,alias,dir)}}
        finally {dir.deleteRecursively();KeyStore.getInstance("AndroidKeyStore").apply {load(null);deleteEntry(alias)}}
    }
    private fun prepare(store: VaultStore, token: RestoreOperation=RestoreOperation()): VaultGenerations.PreparedGeneration {
        val next=fixture("replacement")
        return store.beginReceiptPreparation(next.copy(attachments=emptyList()),next.attachments.map {
            VaultGenerations.ReceiptDeclaration(it.id,it.expenseId,it.mediaType,it.byteCount,it.sha256)
        },token).use {p->
            next.attachments.forEach {r->val bytes=r.bytes();try {p.append(r.id,ByteArrayInputStream(bytes))} finally {bytes.fill(0)}}
            p.finish()
        }
    }
    private fun state(s: VaultStore)=s.readableDatabase.rawQuery("SELECT key,value FROM metadata ORDER BY key",null).use {r->buildMap {while(r.moveToNext()) put(r.getString(0),r.getString(1))}}
    private fun equal(expected: Snapshot, actual: Snapshot) {
        assertEquals(expected.vaultId,actual.vaultId);assertEquals(expected.snapshotId,actual.snapshotId);assertEquals(expected.createdAt,actual.createdAt)
        assertEquals(expected.expenses.toSet(),actual.expenses.toSet());assertEquals(expected.finance,actual.finance)
        assertEquals(expected.attachments.toSet(),actual.attachments.toSet())
        expected.attachments.forEach {receipt->assertArrayEquals(receipt.bytes(),actual.attachments.single {it.id==receipt.id}.bytes())}
    }
    private fun generationCount(s: VaultStore)=s.readableDatabase.rawQuery("SELECT count(*) FROM vault_generations",null).use {it.moveToFirst();it.getInt(0)}
    @Test fun guardedInstallReopensAllDomainsAndLateCancelCannotReclaimFiles()=isolated {store,context,alias,_ ->
        val token=RestoreOperation();val candidate=prepare(store,token);val revision=store.revision();val incarnation=store.incarnation()
        // A capability from another receiving instance is rejected without stealing its owner.
        VaultStore(context,"vault.db",alias).use {other->fails {other.installPrepared(candidate)}}
        store.generations.fault={point->if(point==VaultGenerations.Point.POINTER_COMMITTED) {
            assertFalse(token.cancel());assertEquals(2,generationCount(store)) // Complete predecessor still retained.
        }}
        store.installPrepared(candidate);store.generations.fault={}
        candidate.close();candidate.close();fails {store.installPrepared(candidate)}
        assertEquals(revision+1,store.revision());assertNotEquals(incarnation,store.incarnation());equal(fixture("replacement"),store.snapshot())
        VaultStore(context,"vault.db",alias).use {equal(fixture("replacement"),it.snapshot())}
        assertEquals(1,generationCount(store))
        store.replace(fixture("previous"));assertEquals(1,generationCount(store)) // Explicitly adopted format1 can be normally collected.
    }
    @Test fun interveningEditAndRepeatedRevisionIncarnationRejectStaleCandidate() {
        for(mode in listOf("edit","incarnation","digest")) isolated {store,context,alias,_ ->
            val original=state(store);val revision=store.revision();val candidate=prepare(store)
            VaultStore(context,"vault.db",alias).use {other->
                if(mode=="incarnation") {
                    other.replace(fixture("previous"))
                    // Test-only authenticated state rewrite repeats the numeric revision
                    // while preserving the new active ID/incarnation from the real restore.
                    val stateMethod=VaultGenerations::class.java.getDeclaredMethod("state").apply {isAccessible=true}
                    val current=stateMethod.invoke(other.generations);val type=current.javaClass
                    val constructor=type.declaredConstructors.single {it.parameterCount==5}.apply {isAccessible=true}
                    val active=type.getDeclaredMethod("getActive").apply {isAccessible=true}.invoke(current)
                    val incarnation=type.getDeclaredMethod("getIncarnation").apply {isAccessible=true}.invoke(current)
                    val repeated=constructor.newInstance(active,null,false,revision,incarnation)
                    VaultGenerations::class.java.getDeclaredMethod("setState",type).apply {isAccessible=true}.invoke(other.generations,repeated)
                } else other.save(other.all().first().copy(note="intervening $mode"))
            }
            if(mode=="digest") {
                // Preserve the original authentic pointer/revision/key envelope but keep
                // legitimately resealed changed domain/header data: digest binding must reject.
                original.forEach {(key,value)->store.writableDatabase.execSQL("INSERT OR REPLACE INTO metadata(key,value) VALUES (?,?)",arrayOf(key,value))}
            }
            if(mode!="edit") assertEquals(revision,store.revision())
            val before=state(store);val visible=store.snapshot()
            assertEquals(2,generationCount(store));fails {store.installPrepared(candidate)};candidate.close();fails {store.installPrepared(candidate)}
            assertEquals(before,state(store));equal(visible,store.snapshot());assertEquals(1,generationCount(store))
        }
    }
    @Test fun cancelledTamperedAndUnavailableKeyInstallsCannotPublish() {
        for(mode in listOf("cancel","cancel-ready","row","inode","inventory","key-envelope","key-loss")) isolated {store,_,alias,dir ->
            val token=RestoreOperation();val candidate=prepare(store,token);val before=state(store)
            val receipt=dir.walkTopDown().single {it.name=="${fixture("replacement").attachments.single().id}.pennyreceipt"}
            val sealed=receipt.readBytes()
            var oldEnvelope: ByteArray?=null;var oldId: String?=null
            when(mode) {
                "cancel"->assertTrue(token.cancel())
                "cancel-ready"->store.generations.fault={if(it==VaultGenerations.Point.CANDIDATE_INSTALL_READY) assertTrue(token.cancel())}
                "row"->store.generations.fault={if(it==VaultGenerations.Point.CANDIDATE_INSTALL_READY) store.writableDatabase.execSQL("UPDATE vault_rows SET sealed=zeroblob(length(sealed)) WHERE generationId=(SELECT id FROM vault_generations ORDER BY rowid DESC LIMIT 1)")}
                "inode"->{assertTrue(receipt.delete());receipt.writeBytes(sealed)}
                "inventory"->File(receipt.parentFile,"foreign").writeText("keep")
                "key-envelope"->{store.readableDatabase.rawQuery("SELECT id,wrappedKey FROM vault_generations ORDER BY rowid LIMIT 1",null).use {it.moveToFirst();oldId=it.getString(0);oldEnvelope=it.getBlob(1)};store.writableDatabase.execSQL("UPDATE vault_generations SET wrappedKey=zeroblob(length(wrappedKey)) WHERE id=?",arrayOf(oldId))}
                "key-loss"->KeyStore.getInstance("AndroidKeyStore").apply {load(null);deleteEntry(alias)}
            }
            fails {store.installPrepared(candidate)};store.generations.fault={};candidate.close();fails {store.installPrepared(candidate)}
            assertEquals(before,state(store))
            if(mode=="key-envelope") store.writableDatabase.execSQL("UPDATE vault_generations SET wrappedKey=? WHERE id=?",arrayOf(oldEnvelope,oldId))
            if(mode=="key-loss") assertFalse(KeyStore.getInstance("AndroidKeyStore").apply {load(null)}.containsAlias(alias)) else equal(fixture("previous"),store.snapshot())
            if(mode=="inode") assertArrayEquals(sealed,receipt.readBytes())
            if(mode=="inventory") assertEquals("keep",File(receipt.parentFile,"foreign").readText())
        }
    }
    @Test fun databaseCopiedBeforeBeginCannotPrepareOnMovedConnection()=isolated {store,_,_,dir ->
        val dbFile=File(store.writableDatabase.path);val bytes=dbFile.readBytes()
        val moved=File(dir.parentFile,"before-begin-${Wire.id()}")
        try {
            assertTrue(dbFile.renameTo(moved));dbFile.writeBytes(bytes)
            val result=runCatching {prepare(store)}
            result.getOrNull()?.close()
            assertNotNull("SQLite must reject preparation on its moved main file",result.exceptionOrNull())
            android.util.Log.i("CandidateNamespaceProbe",result.exceptionOrNull().toString())
            assertArrayEquals(bytes,dbFile.readBytes())
        } finally {moved.delete()}
    }
    @Test fun copiedDatabaseAndRootNamespacesRejectEvenWithoutReceipts() {
        for(mode in listOf("database","root","receipt-root","closed-connection")) isolated {store,_,_,dir ->
            val next=fixture("replacement").copy(attachments=emptyList())
            val candidate=if(mode=="receipt-root") prepare(store) else store.beginReceiptPreparation(next,emptyList()).use {it.finish()}
            val dbFile=File(store.writableDatabase.path)
            val moved=File(dir.parentFile,"retained-original-${Wire.id()}")
            try {
                when(mode) {
                    "database"->{val bytes=dbFile.readBytes();assertTrue(dbFile.renameTo(moved));dbFile.writeBytes(bytes)}
                    "root"->{assertTrue(dir.renameTo(moved));assertTrue(moved.copyRecursively(dir))}
                    "receipt-root"->{val root=File(dir,LocalReceiptBlob.ROOT_NAME);assertTrue(root.renameTo(moved));assertTrue(moved.copyRecursively(root))}
                    "closed-connection"->store.close()
                }
                val copied=dir.walkTopDown().filter {it.isFile}.associate {it.relativeTo(dir).path to it.readBytes().toList()}
                fails {store.installPrepared(candidate)};candidate.close();fails {store.installPrepared(candidate)}
                // No SQLite getter/reopen or cleanup transaction may touch the new namespace.
                assertEquals(copied,dir.walkTopDown().filter {it.isFile}.associate {it.relativeTo(dir).path to it.readBytes().toList()})
            } finally {moved.deleteRecursively()}
        }
    }
    @Test fun failedPublicationTransactionRetainsQuarantineAndPrevious()=isolated {store,_,_,dir ->
        val token=RestoreOperation();val candidate=prepare(store,token);val before=state(store)
        val files=dir.walkTopDown().filter {it.extension=="pennyreceipt"}.associate {it.path to it.readBytes().toList()}
        store.writableDatabase.execSQL("CREATE TEMP TRIGGER fail_candidate BEFORE INSERT ON metadata WHEN NEW.key='revision' BEGIN SELECT RAISE(ABORT,'injected publication'); END")
        fails {store.installPrepared(candidate)};store.writableDatabase.execSQL("DROP TRIGGER fail_candidate")
        candidate.close();assertTrue(token.cancel());fails {store.installPrepared(candidate)}
        assertEquals(before,state(store));equal(fixture("previous"),store.snapshot())
        assertEquals(files,dir.walkTopDown().filter {it.extension=="pennyreceipt"}.associate {it.path to it.readBytes().toList()})
        store.save(store.all().first().copy(note="GC after failed publication"));assertEquals(2,generationCount(store))
        // The actual SQLite abort rolled back both catalog adoption and active pointer.
        // Release-only post-CAS handling deliberately retains quarantined format2 data.
    }
    @Test fun committedInterruptionRecoversAndInvalidPendingRollsBackPredecessor() {
        for(corrupt in listOf(false,true)) isolated {store,context,alias,_ ->
            val revision=store.revision();val incarnation=store.incarnation();val candidate=prepare(store)
            store.generations.fault={if(it==VaultGenerations.Point.POINTER_COMMITTED) error("injected after commit")}
            fails {store.installPrepared(candidate)};candidate.close();store.generations.fault={}
            assertEquals(2,generationCount(store))
            if(corrupt) store.writableDatabase.execSQL("UPDATE vault_rows SET sealed=zeroblob(length(sealed)) WHERE generationId=(SELECT id FROM vault_generations ORDER BY rowid DESC LIMIT 1)")
            VaultStore(context,"vault.db",alias).use {reopened->
                if(corrupt) {fails {reopened.snapshot()};equal(fixture("previous"),reopened.snapshot());assertEquals(revision,reopened.revision());assertEquals(incarnation,reopened.incarnation())}
                else {equal(fixture("replacement"),reopened.snapshot());assertEquals(revision+1,reopened.revision());assertNotEquals(incarnation,reopened.incarnation())}
            }
        }
    }
}
