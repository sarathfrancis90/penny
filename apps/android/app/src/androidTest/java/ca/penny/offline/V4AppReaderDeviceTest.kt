package ca.penny.offline

import androidx.test.platform.app.InstrumentationRegistry
import ca.penny.v4frameprobe.*
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.io.IOException
import java.util.Base64
import org.json.JSONObject
import org.junit.Before
import org.junit.After
import org.junit.Assert.*
import org.junit.Test

class V4AppReaderDeviceTest {
    private val assets get()=InstrumentationRegistry.getInstrumentation().context.assets
    private val root get()=ByteArray(32) {7}
    private fun bytes(path: String)=assets.open(path).use {it.readBytes()}
    private fun manifest(path: String)=StrictJson.objectFrom(bytes(path))
    private fun rejected(sink: Sink=Sink(), key: ByteArray=root, data: ByteArray, token: FrameCancellation=FrameCancellation()): Throwable {
        val error=checkNotNull(runCatching {V4BackupReader.decode(key,ByteArrayInputStream(data),sink,token)}.exceptionOrNull())
        assertTrue(sink.discarded && sink.closed && !sink.finished)
        assertTrue(sink.borrowed?.all {it==0.toByte()} ?: true)
        return error
    }
    private lateinit var live: VaultStore
    private lateinit var before: Snapshot
    private lateinit var directory: java.io.File
    private lateinit var alias: String
    private lateinit var originalState: Map<String,String>
    private fun state()=live.readableDatabase.rawQuery("SELECT key,value FROM metadata ORDER BY key",null).use {r->buildMap {while(r.moveToNext()) put(r.getString(0),r.getString(1))}}
    @Before fun isolatedLiveVault() {
        val target=InstrumentationRegistry.getInstrumentation().targetContext
        assertEquals("ca.penny.offline.dev.test",target.packageName)
        directory=java.io.File(target.noBackupFilesDir,"v4-read-test-${Wire.id()}").apply {mkdir()}
        val context=object:android.content.ContextWrapper(target) {override fun getNoBackupFilesDir()=directory}
        alias="penny.v4.reader.test.${Wire.id()}";live=VaultStore(context,"vault.db",alias)
        live.replace(Snapshot.decode(manifest("local-generation-v1/previous.json")));before=live.snapshot();originalState=state()
    }
    @After fun handlesReleasedAndLiveUntouched() {
        try {assertEquals(0,NativeFrames.activeHandlesForTests());assertEquals(before,live.snapshot());assertEquals(originalState,state())}
        finally {live.close();directory.deleteRecursively();java.security.KeyStore.getInstance("AndroidKeyStore").apply {load(null);deleteEntry(alias)}}
    }
    @Test fun exactEncryptedGoldensLoadAppJniAndAdmitOnlyIsolatedLogicalData() {
        assertEquals("ca.penny.offline.dev.test",InstrumentationRegistry.getInstrumentation().targetContext.packageName)
        val cases=manifest("v4-frames/fixture-manifest.json").getJSONArray("positives")
        for(name in listOf("empty-ledger","one-receipt")) {
            val case=(0 until cases.length()).map {cases.getJSONObject(it)}.single {it.getString("name")==name}
            val data=bytes("v4-frames/${case.getString("file")}");assertEquals(case.getString("ciphertextSha256"),Attachment.digest(data))
            val sink=Sink();val result=V4BackupReader.decode(root,ByteArrayInputStream(data),sink)
            val summaries=manifest("v4-logical/fixture-manifest.json").getJSONArray("positives")
            val expected=(0 until summaries.length()).map {summaries.getJSONObject(it)}.single {it.getString("name")==if(name=="empty-ledger") "empty" else name}.getJSONObject("summary")
            assertEquals(expected.getString("vaultId"),result.vaultId);assertEquals(expected.getString("snapshotId"),result.snapshotId);assertEquals(expected.getString("createdAt"),result.createdAt)
            result.counts.forEach {(domain,count)->assertEquals(expected.getJSONObject("counts").getLong(domain),count)}
            assertTrue(sink.finished && sink.closed && !sink.discarded)
            if(name=="one-receipt") {assertEquals(Attachment.digest(bytes("local-receipt-v1/receipt.png")),sink.receiptHash);assertTrue(sink.borrowed!!.all {it==0.toByte()})}
        }
        for(name in listOf("full-final","multi-frame")) rejected(data=bytes("v4-frames/$name.pennyframe")) // Frame patterns are not logical backups.
    }
    @Test fun allSharedFrameNegativesRejectAndReleaseThroughAppAdapter() {
        val cases=manifest("v4-frame-negatives/negative-manifest.json").getJSONArray("cases");assertEquals(28,cases.length())
        repeat(cases.length()) {i->val case=cases.getJSONObject(i);val data=bytes("v4-frame-negatives/${case.getString("file")}")
            assertEquals(case.getString("ciphertextSha256"),Attachment.digest(data))
            val key=case.getString("recoveryKey").removePrefix("pny1-").chunked(2).map {it.toInt(16).toByte()}.toByteArray()
            rejected(key=key,data=data);assertEquals(0,NativeFrames.activeHandlesForTests())
        }
    }
    @Test fun authenticatedLogicalFailuresAndCurrentCapacityReject() {
        val corpus=manifest("v4-logical-materialized/fixture-manifest.json")
        val cases=listOf("positives","negatives").flatMap {key->val a=corpus.getJSONArray(key);(0 until a.length()).map {a.getJSONObject(it)}}
        for(name in listOf("end-in-message","end-transcript","orphan-receipt","duplicate-key","escaped-equivalent-key","expense-money","beyond-legacy-count")) {
            val case=cases.single {it.getString("name")==name};val plain=bytes("v4-logical-materialized/${case.getString("file")}")
            assertEquals(case.getString("plaintextSha256"),Attachment.digest(plain))
            rejected(data=seal(plain,case.optBoolean("finalFrame",true)))
        }
    }
    @Test fun nativeInvalidImageAndSinkCloseCancellationCannotAdmit() {
        val good=bytes("v4-frames/one-receipt.pennyframe")
        for(phase in listOf("record","receipt","finish","close")) rejected(Sink(failAt=phase),data=good)
        val token=FrameCancellation();rejected(Sink(token=token),data=good,token=token)
        rejected(data=good,token=FrameCancellation().also {it.cancel()})
        val cases=manifest("png-integrity-corpus.json").getJSONArray("cases")
        val bad=Base64.getDecoder().decode((0 until cases.length()).map {cases.getJSONObject(it)}.single {it.getString("id")=="rgba9-plain-invalid_filter"}.getString("dataBase64"))
        assertEquals("image/png",Attachment.mediaType(bad));assertNotNull(runCatching {ReceiptImage.decode(bad).recycle()}.exceptionOrNull())
        val records=mutableListOf<Pair<Int,ByteArray>>();val plain=bytes("v4-logical/one-receipt.pennylogical");var offset=0
        while(offset<plain.size) {val kind=plain[offset].toInt();val size=FrameCodec.u64(plain,offset+1).toInt();records+=kind to plain.copyOfRange(offset+9,offset+9+size);offset+=9+size}
        val changed=records.map {(kind,payload)->kind to when(kind) {
            9->StrictJson.bytes(StrictJson.objectFrom(payload).put("byteCount",bad.size).put("sha256",Attachment.digest(bad)))
            10->bad
            else->payload
        }}.toMutableList()
        val body=changed.filter {it.first in 2..10}.sumOf {9L+if(it.first==10) 0 else it.second.size}
        for(index in listOf(0,changed.lastIndex)) changed[index]=changed[index].first to StrictJson.bytes(StrictJson.objectFrom(changed[index].second).put("receiptBytes",bad.size).put("nonReceiptBytes",body))
        val prefix=ByteArrayOutputStream();changed.dropLast(1).forEach {prefix.write(record(it.first,it.second))}
        val end=StrictJson.objectFrom(changed.last().second).put("streamSha256",Attachment.digest(prefix.toByteArray()))
        val error=rejected(data=seal(prefix.toByteArray()+record(11,StrictJson.bytes(end))))
        assertTrue("Actual composed rejection must originate in native image validation",error.stackTrace.any {it.className==ReceiptImage::class.java.name && it.methodName=="decode"})
    }
    private fun record(kind: Int,body: ByteArray)=ByteArray(9).also {it[0]=kind.toByte();FrameCodec.putU64(it,1,body.size.toLong())}+body
    private fun seal(plain: ByteArray,final: Boolean=true): ByteArray {
        val handle=NativeFrames.initPush(root);val output=ByteArrayOutputStream()
        try {
            output.write(NativeFrames.header(handle));var offset=0;var seq=0L
            while(offset<plain.size) {
                val count=minOf(FrameCodec.CHUNK,plain.size-offset);val part=plain.copyOfRange(offset,offset+count);val encrypted=ByteArray(count+17)
                val actual=NativeFrames.push(handle,part,count,final && offset+count==plain.size,encrypted);part.fill(0)
                output.write(ByteArray(16).also {FrameCodec.putU64(it,0,seq++);FrameCodec.putU64(it,8,actual.toLong())});output.write(encrypted);offset+=count
            }
        } finally {NativeFrames.close(handle)}
        return output.toByteArray()
    }
    private class Sink(private val failAt: String?=null,private val token: FrameCancellation?=null): LogicalValidationSink {
        var finished=false;var closed=false;var discarded=false;var borrowed: ByteArray?=null;var receiptHash=""
        private fun fault(phase: String) {if(failAt==phase) throw IOException("injected $phase")}
        override fun begin(snapshotId: String,vaultId: String,createdAt: String) {}
        override fun record(kind: Int,value: JSONObject) {fault("record")}
        override fun receipt(descriptor: ReceiptDescriptor,bytes: ByteArray) {borrowed=bytes;receiptHash=Attachment.digest(bytes);fault("receipt");token?.cancel()}
        override fun finishUncommitted(summary: LogicalSummary) {fault("finish");finished=true}
        override fun discard() {discarded=true;finished=false}
        override fun close() {closed=true;fault("close")}
    }
}
