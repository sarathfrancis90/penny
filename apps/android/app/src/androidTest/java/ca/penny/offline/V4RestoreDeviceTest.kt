package ca.penny.offline

import android.content.Context
import android.content.ContextWrapper
import android.system.Os
import androidx.test.platform.app.InstrumentationRegistry
import ca.penny.v4frameprobe.*
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.IOException
import java.security.KeyStore
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

class V4RestoreDeviceTest {
    private val assets get()=InstrumentationRegistry.getInstrumentation().context.assets
    private val root get()=ByteArray(32) {7}
    private fun bytes(name:String)=assets.open(name).use {it.readBytes()}
    private fun snapshot(name:String)=Snapshot.decode(StrictJson.objectFrom(bytes(name)))
    private fun fails(block:()->Unit):Throwable=checkNotNull(runCatching(block).exceptionOrNull())
    private fun state(s:VaultStore)=s.readableDatabase.rawQuery("SELECT key,value FROM metadata ORDER BY key",null).use {r->buildMap {while(r.moveToNext()) put(r.getString(0),r.getString(1))}}
    private fun isolated(block:(VaultStore,Context,String,File)->Unit) {
        val target=InstrumentationRegistry.getInstrumentation().targetContext;assertEquals("ca.penny.offline.dev.test",target.packageName)
        val dir=File(target.noBackupFilesDir,"v4-restore-${Wire.id()}").apply {mkdir()};val alias="penny.test.v4.restore.${Wire.id()}"
        val context=object:ContextWrapper(target) {override fun getNoBackupFilesDir()=dir}
        try {VaultStore(context,"vault.db",alias).use {it.replace(snapshot("local-generation-v1/previous.json"));block(it,context,alias,dir)}}
        finally {dir.deleteRecursively();KeyStore.getInstance("AndroidKeyStore").apply {load(null);deleteEntry(alias)};assertEquals(0,NativeFrames.activeHandlesForTests())}
    }
    private fun cases():List<JSONObject> {val m=StrictJson.objectFrom(bytes("v4-logical-materialized/fixture-manifest.json"));return listOf("positives","negatives").flatMap {val a=m.getJSONArray(it);(0 until a.length()).map {i->a.getJSONObject(i)}}}
    private fun logical(name:String):ByteArray {val case=cases().single {it.getString("name")==name};val plain=bytes("v4-logical-materialized/${case.getString("file")}");assertEquals(case.getString("plaintextSha256"),Attachment.digest(plain));return seal(plain,case.optBoolean("finalFrame",true))}
    private fun seal(plain:ByteArray,final:Boolean=true):ByteArray {
        val id=NativeFrames.initPush(root);val output=ByteArrayOutputStream()
        try {output.write(NativeFrames.header(id));var offset=0;var sequence=0L
            while(offset<plain.size) {val count=minOf(FrameCodec.CHUNK,plain.size-offset);val input=plain.copyOfRange(offset,offset+count);val encrypted=ByteArray(count+17)
                val n=NativeFrames.push(id,input,count,final && offset+count==plain.size,encrypted);input.fill(0)
                output.write(ByteArray(16).also {FrameCodec.putU64(it,0,sequence++);FrameCodec.putU64(it,8,n.toLong())});output.write(encrypted);offset+=count}
        } finally {NativeFrames.close(id)}
        return output.toByteArray()
    }
    @Test fun exactFixtureInstallAndSplitBoundariesReopenWithoutPreparationHydration() {
        assertEquals("0400e9c17d29a6f167d4c6dc80192353c0cc7fb35fd60b3535674c1f8f4ac9f6",Attachment.digest(bytes("v4-candidate-v1/acceptance.json")))
        for(name in listOf("empty","one-receipt","finance","split-domain-header","split-end-header","split-end-payload")) isolated {store,context,alias,dir->
            val data=if(name in listOf("empty","one-receipt")) bytes("v4-frames/${if(name=="empty") "empty-ledger" else name}.pennyframe") else logical(name)
            val original=state(store);val order=mutableListOf<V4Restore.Point>()
            store.generations.fault={point->if(point==VaultGenerations.Point.SNAPSHOT_HYDRATION) error("aggregate snapshot hydration in prepare")
                if(point==VaultGenerations.Point.CANDIDATE_VERIFIED) assertTrue(order.containsAll(listOf(V4Restore.Point.PASS1_CLOSED,V4Restore.Point.PASS2_CLOSED,V4Restore.Point.SOURCE_CLOSED)))}
            val candidate=store.prepareV4(ByteArrayInputStream(data),root,fault={point,_->order+=point})
            store.generations.fault={};assertEquals(original,state(store));assertTrue(dir.listFiles()!!.none {it.extension=="ciphertext"})
            val expected=cases().single {it.getString("name")==name}.getJSONObject("summary")
            assertEquals(expected.getString("vaultId"),candidate.metadata.vaultId)
            candidate.metadata.counts.forEach {(domain,count)->assertEquals(expected.getJSONObject("counts").getInt(domain),count)}
            VaultStore(context,"vault.db",alias).use {other->fails {other.installPrepared(candidate)}}
            store.installPrepared(candidate);candidate.close();fails {store.installPrepared(candidate)}
            VaultStore(context,"vault.db",alias).use {other->val actual=other.snapshot();assertEquals(expected.getString("snapshotId"),actual.snapshotId);assertEquals(expected.getString("createdAt"),actual.createdAt)
                if(name=="finance") {val full=snapshot("snapshot-v3.json");assertEquals(full.expenses.toSet(),actual.expenses.toSet());assertEquals(full.finance,actual.finance);assertEquals(full.attachments,actual.attachments)}
                if(name=="one-receipt") assertArrayEquals(bytes("local-receipt-v1/receipt.png"),actual.attachments.single().bytes())}
        }
    }
    @Test fun malformedAuthenticatedAndOverCapacityNeverChangeCurrent()=isolated {store,_,_,dir->
        val original=store.snapshot();val before=state(store);val good=bytes("v4-frames/one-receipt.pennyframe")
        val malformed=listOf(good.copyOf(30),good.copyOf(good.size-1),good+byteArrayOf(0),good.copyOf().also {it[it.lastIndex]=(it.last().toInt() xor 1).toByte()})
        for(data in malformed) fails {store.restoreV4(ByteArrayInputStream(data),root)}
        fails {store.restoreV4(ByteArrayInputStream(good),ByteArray(32) {8})}
        for(name in listOf("end-in-message","end-transcript","orphan-receipt","duplicate-key","escaped-equivalent-key","beyond-legacy-count")) fails {store.restoreV4(ByteArrayInputStream(logical(name)),root)}
        assertEquals(original,store.snapshot());assertEquals(before,state(store));assertTrue(dir.listFiles()!!.none {it.extension=="ciphertext"})
    }
    @Test fun authenticatedNativeInvalidImageCannotReachCandidateOrPublication()=isolated {store,_,_,dir->
        val before=state(store)
        val corpus=StrictJson.objectFrom(bytes("png-integrity-corpus.json")).getJSONArray("cases")
        val bad=java.util.Base64.getDecoder().decode((0 until corpus.length()).map {corpus.getJSONObject(it)}.single {it.getString("id")=="rgba9-plain-invalid_filter"}.getString("dataBase64"))
        assertEquals("image/png",Attachment.mediaType(bad))
        val plain=bytes("v4-logical/one-receipt.pennylogical");val records=mutableListOf<Pair<Int,ByteArray>>();var at=0
        while(at<plain.size) {val kind=plain[at].toInt();val size=FrameCodec.u64(plain,at+1).toInt();val body=plain.copyOfRange(at+9,at+9+size)
            records+=kind to when(kind) {9->StrictJson.bytes(StrictJson.objectFrom(body).put("byteCount",bad.size).put("sha256",Attachment.digest(bad)));10->bad;else->body};at+=9+size}
        val total=records.filter {it.first in 2..10}.sumOf {9L+if(it.first==10) 0 else it.second.size}
        for(index in listOf(0,records.lastIndex)) records[index]=records[index].first to StrictJson.bytes(StrictJson.objectFrom(records[index].second).put("receiptBytes",bad.size).put("nonReceiptBytes",total))
        fun record(kind:Int,body:ByteArray)=ByteArray(9).also {it[0]=kind.toByte();FrameCodec.putU64(it,1,body.size.toLong())}+body
        val prefix=ByteArrayOutputStream();records.dropLast(1).forEach {prefix.write(record(it.first,it.second))}
        val end=StrictJson.objectFrom(records.last().second).put("streamSha256",Attachment.digest(prefix.toByteArray()))
        val error=fails {store.restoreV4(ByteArrayInputStream(seal(prefix.toByteArray()+record(11,StrictJson.bytes(end)))),root)}
        assertTrue(error.stackTrace.any {it.className==ReceiptImage::class.java.name && it.methodName=="decode"})
        assertEquals(before,state(store));assertTrue(dir.listFiles()!!.none {it.extension=="ciphertext"})
    }
    @Test fun originalTargetRejectsEditsDuringEitherPassAndBeforeInstall() {
        for(point in listOf(V4Restore.Point.COPY,V4Restore.Point.PASS1_READ,V4Restore.Point.PASS1_DONE,V4Restore.Point.PASS2_READ,V4Restore.Point.PASS2_DONE)) isolated {store,context,alias,_ ->
            var edited=false
            fails {store.restoreV4(ByteArrayInputStream(bytes("v4-frames/one-receipt.pennyframe")),root,fault={at,_->if(at==point && !edited) {edited=true;VaultStore(context,"vault.db",alias).use {it.save(it.all().first().copy(note="preserve intervening edit"))}}})}
            assertTrue(edited);assertTrue(store.all().any {it.note=="preserve intervening edit"});assertEquals(snapshot("local-generation-v1/previous.json").vaultId,store.vaultId())
        }
    }
    @Test fun missingKeyBeforeCaptureAndAtInstallNeverProvisions() {
        for(late in listOf(false,true)) isolated {store,_,alias,_ ->
            val before=state(store);var reads=0;val input=object:ByteArrayInputStream(bytes("v4-frames/one-receipt.pennyframe")) {override fun read(b:ByteArray,off:Int,len:Int):Int {reads++;return super.read(b,off,len)}}
            val keys=KeyStore.getInstance("AndroidKeyStore").apply {load(null)}
            if(late) {val candidate=store.prepareV4(input,root);keys.deleteEntry(alias);fails {store.installPrepared(candidate)};candidate.close()}
            else {keys.deleteEntry(alias);fails {store.prepareV4(input,root)};assertEquals(0,reads)}
            assertFalse(keys.containsAlias(alias));assertEquals(before,state(store))
        }
    }
    @Test fun sourceReadCloseAndCancellationFailuresCannotReturnCandidate() {
        for(mode in listOf("read","close","oversize","cancel-copy","cancel-pass1","cancel-pass2","fail-pass1-close","fail-pass2-close","cancel-source-close","fail-source-close")) isolated {store,_,_,dir->
            val before=state(store);val token=RestoreOperation();var closed=false
            val input=object:ByteArrayInputStream(bytes("v4-frames/one-receipt.pennyframe")) {
                override fun read(b:ByteArray,off:Int,len:Int):Int {if(mode=="read") throw IOException("source read");if(mode=="oversize") {b.fill(0,off,off+len);return len};return super.read(b,off,len)}
                override fun close() {closed=true;super.close();if(mode=="close") throw IOException("source close")}
            }
            fails {store.prepareV4(input,root,token) {point,_->
                if((mode=="cancel-copy" && point==V4Restore.Point.COPY)||(mode=="cancel-pass1" && point==V4Restore.Point.PASS1_READ)||(mode=="cancel-pass2" && point==V4Restore.Point.PASS2_READ)||(mode=="cancel-source-close" && point==V4Restore.Point.SOURCE_CLOSED)) token.cancel()
                if((mode=="fail-pass1-close" && point==V4Restore.Point.PASS1_CLOSED)||(mode=="fail-pass2-close" && point==V4Restore.Point.PASS2_CLOSED)||(mode=="fail-source-close" && point==V4Restore.Point.SOURCE_CLOSED)) throw IOException("injected $point")
            }}
            assertTrue(closed);assertEquals(before,state(store));assertTrue(dir.listFiles()!!.none {it.extension=="ciphertext"})
        }
    }
    @Test fun pinnedCiphertextMutationAndSubstitutionAreRejectedWithOwnedCleanup() {
        for(mode in listOf("mutation","truncate","append","substitute","alternate")) isolated {store,_,_,dir->
            val before=state(store);var file:File?=null;var replacement:ByteArray?=null;var changed=false
            fails {store.restoreV4(ByteArrayInputStream(bytes("v4-frames/one-receipt.pennyframe")),root,fault={point,path->
                if(point==V4Restore.Point.COPY) file=File(dir,path.name)
                if(point==V4Restore.Point.PASS1_DONE && !changed) {changed=true;val selected=checkNotNull(file);val original=selected.readBytes()
                    val next=when(mode) {"truncate"->original.copyOf(original.size-1);"append"->original+byteArrayOf(0);"alternate"->bytes("v4-frames/empty-ledger.pennyframe");else->original.copyOf().also {if(mode=="mutation") it[it.lastIndex]=(it.last().toInt() xor 1).toByte()}}
                    if(mode=="substitute") {assertTrue(selected.delete());replacement=next} else Os.chmod(selected.path,384)
                    selected.writeBytes(next);Os.chmod(selected.path,256)
                }
            })}
            assertTrue(changed);assertEquals(before,state(store))
            if(mode=="substitute") assertArrayEquals(replacement,checkNotNull(file).readBytes()) else assertTrue(dir.listFiles()!!.none {it.extension=="ciphertext"})
        }
    }
}
