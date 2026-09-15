package ca.penny.offline

import org.junit.Test
import org.junit.Assert.*
import org.json.JSONObject
import kotlinx.coroutines.runBlocking

class CloudContractTest {
    private fun bytes(name: String)=javaClass.classLoader!!.getResourceAsStream(name)!!.use {it.readBytes()}
    private fun json(name: String)=StrictJson.objectFrom(bytes(name))
    private val golden get()=json("cloud-golden-vector-v1.json")
    private val key get()=golden.getString("recoveryKey")
    private val manifest get()=CloudManifest.decode(json("cloud-manifest-v1.json"))
    private val context get()=CloudContext(manifest.binding,5,42)
    private fun rejected(block: ()->Unit) {assertTrue("Expected rejection",runCatching(block).isFailure)}
    @Test fun manifestGoldenAndAllClosedShapeMutations() {
        val m=manifest
        assertEquals(golden.getString("expectedAccountTag"),CloudContract.accountTag("drive",golden.getJSONObject("accountInput").getString("opaqueIdentity")))
        assertEquals(golden.getString("expectedVaultTag"),CloudContract.vaultTag(golden.getString("vaultId")))
        assertEquals(m,CloudContract.open(bytes("cloud-manifest-v1.pennymanifest"),key,m.binding))
        val nonce=golden.getString("nonceHex").chunked(2).map {it.toInt(16).toByte()}.toByteArray()
        val sealed=StrictJson.objectFrom(CloudContract.sealPlain(golden.getString("plaintextUtf8").toByteArray(),key,nonce))
        val expected=json("cloud-manifest-v1.pennymanifest")
        listOf("nonce","ciphertext","tag").forEach {assertEquals(expected.getString(it),sealed.getString(it))}
        val conformance=json("cloud-conformance-v1.json")
        for(name in listOf("manifestMutations","descriptorMutations")) {
            val cases=conformance.getJSONArray(name)
            for(i in 0 until cases.length()) {val row=cases.getJSONObject(i);val j=json("cloud-manifest-v1.json");val target=if(name=="descriptorMutations") j.getJSONObject("snapshot") else j;target.put(row.getString("field"),row.get("value"));rejected {CloudManifest.decode(j)}}
        }
        m.json().keys().asSequence().toList().forEach {field->rejected {CloudManifest.decode(m.json().apply {remove(field)})}}
        rejected {CloudContract.open(bytes("cloud-manifest-v1.pennymanifest"),Backup.recoveryKey(),m.binding)}
        rejected {CloudContract.open(bytes("cloud-manifest-v1.pennymanifest"),key,m.binding.copy(provider="icloud"))}
        rejected {CloudContract.open(bytes("cloud-snapshot-v1.pennybackup"),key,m.binding)}
        assertEquals("33333333-3333-4333-8333-333333333333",CloudContract.verifySnapshot(bytes("cloud-snapshot-v1.pennybackup"),key,m).vaultId)
        rejected {CloudContract.verifySnapshot(bytes("cloud-snapshot-v1.pennybackup")+0,key,m)}
        rejected {CloudContract.verifySnapshot(bytes("cloud-snapshot-v1.pennybackup"),key,m.copy(snapshot=m.snapshot.copy(snapshotSchemaVersion=2)))}
        for(version in 1..2) {
            val oldKey=json("golden-vector${if(version==1) "" else "-v2"}.json").getString("recoveryKey")
            val data=bytes("backup${if(version==1) "-v1" else "-v2"}.pennybackup")
            val s=Backup.decrypt(data,oldKey)
            val descriptor=CloudDescriptor(Wire.id(),s.snapshotId,1,version,CloudContract.sha256(data),data.size,s.createdAt)
            assertEquals(s,CloudContract.verifySnapshot(data,oldKey,m.copy(vaultTag=CloudContract.vaultTag(s.vaultId),snapshot=descriptor)))
        }
    }
    @Test fun boundedCompleteDiscoveryAndWriterConflicts() {
        val item=CloudItem("1",manifest.manifestName)
        assertEquals(listOf(item),CloudContract.collect(listOf(CloudPage(listOf(item),null))))
        rejected {CloudContract.collect(listOf(CloudPage(listOf(item),"next")))}
        rejected {CloudContract.collect(listOf(CloudPage(listOf(item),"next"),CloudPage(emptyList(),"next")))}
        rejected {CloudContract.collect(listOf(CloudPage(listOf(item,item.copy(id="2")),null)))}
        rejected {CloudContract.collect(listOf(CloudPage(listOf(item,CloudItem("1","unknown")),null)))}
        rejected {CloudContract.collect(listOf(CloudPage(List(101) {CloudItem("$it","unknown")},null)))}
        rejected {CloudContract.collect(List(11) {CloudPage(emptyList(),if(it==10) null else "$it")})}
        val s=CloudItem("s",manifest.snapshotName)
        rejected {CloudContract.collect(listOf(CloudPage(listOf(s,s.copy(id="s2")),null)))}
        val other=manifest.copy(manifestId=Wire.id(),writerId=Wire.id(),localRevision=1)
        val conflict=manifest.copy(manifestId=Wire.id(),snapshot=manifest.snapshot.copy(sha256="0".repeat(64)))
        val history=CloudContract.history(listOf(other,manifest,conflict),manifest.binding)
        assertTrue(history.multipleWriters);assertTrue(history.revisionConflict)
        rejected {CloudContract.history(listOf(manifest,manifest),manifest.binding)}
    }
    private fun begun()=CloudPublication.begin(Wire.id(),manifest,bytes("cloud-snapshot-v1.pennybackup"),key,context)
    private fun complete(state: CloudPublication,current: CloudContext=context): CloudPublication {
        val manifestBytes=bytes("cloud-manifest-v1.pennymanifest")
        return state.advance(state.operationId,state.phase,current,key,bytes=if(state.phase=="snapshotDownload") bytes("cloud-snapshot-v1.pennybackup") else manifestBytes,stagedManifest=manifestBytes,createdAt=manifest.createdAt,verifiedAt=manifest.verifiedAt)
    }
    @Test fun everyAwaitGuardsFailureCancellationEpochLateEventsAndDirtyRevision() {
        var state=begun()
        CloudPublication.phases.forEach {phase->
            assertEquals(phase,state.phase);assertTrue(state.mayEffect(context))
            for(changed in listOf(context.copy(cancelled=true),context.copy(sessionEpoch=6),context.copy(binding=context.binding.copy(accountTag="0".repeat(64))),context.copy(binding=context.binding.copy(vaultTag="0".repeat(64))),context.copy(localRevision=41))) {
                assertFalse(state.mayEffect(changed));assertEquals("aborted",complete(state,changed).phase);assertNull(complete(state,changed).lastGood)
            }
            assertEquals(state,state.advance(Wire.id(),phase,context,key))
            assertEquals(state,state.advance(state.operationId,"oldPhase",context,key))
            assertEquals("failed",state.advance(state.operationId,phase,context,key,failed=true).phase)
            state=complete(state)
        }
        assertEquals("verified",state.phase);assertEquals(manifest,state.lastGood)
        assertTrue(state.currentVaultVerified(context));assertFalse(state.currentVaultVerified(context.copy(localRevision=43)))
        assertFalse(state.currentVaultVerified(context.copy(sessionEpoch=7)))
    }
    @Test fun publicationCapacityCountsUnknownObjectsAndOldKeyManifests() = runBlocking {
        suspend fun capacity(manifests: Int,total: Int): Boolean {
            val rows=List(total) {i->CloudItem("$i",if(i<manifests) "manifest-${java.util.UUID.nameUUIDFromBytes("$i".toByteArray())}.pennymanifest" else "unknown-$i")}
            val transport=object: CloudTransport {
                override suspend fun accountTag()=manifest.accountTag
                override suspend fun upload(name: String,bytes: ByteArray): CloudItem=error("Must not upload during inventory")
                override suspend fun download(item: CloudItem,maxBytes: Int): ByteArray=error("Do not decrypt inventory")
                override suspend fun page(token: String?): CloudPage {val offset=token?.toInt() ?: 0;val next=minOf(rows.size,offset+100);return CloudPage(rows.subList(offset,next),if(next<rows.size) "$next" else null)}
            }
            return runCatching {CloudOperations(transport,{context},{},{}).requirePublicationCapacity()}.isSuccess
        }
        assertTrue(capacity(99,998));assertFalse(capacity(100,998));assertFalse(capacity(99,999))
    }
    private inner class Fake: CloudTransport {
        var tag=manifest.accountTag
        val objects=linkedMapOf<String,Pair<CloudItem,ByteArray>>()
        var calls=0;var after: ((Int)->Unit)?=null;var failAt=0;var reason="quota";var corruptAt=0
        private fun effect() {calls++;after?.invoke(calls);if(calls==failAt) throw IllegalStateException(reason)}
        override suspend fun accountTag()=tag
        override suspend fun upload(name: String,bytes: ByteArray): CloudItem {effect();check(objects.values.none {it.first.name==name});return CloudItem("id${objects.size}",name).also {objects[it.id]=it to bytes.copyOf()}}
        override suspend fun download(item: CloudItem,maxBytes: Int): ByteArray {effect();return checkNotNull(objects[item.id]).second.copyOf().also {if(calls==corruptAt) it[0]=0;require(it.size<=maxBytes)}}
        override suspend fun page(token: String?): CloudPage {effect();return CloudPage(objects.values.map {it.first},null)}
    }
    @Test fun transportAllPhaseFailuresSwitchCancelCorruptionAndCleanRestore() = runBlocking {
        val snapshot=Backup.decrypt(bytes("cloud-snapshot-v1.pennybackup"),key)
        for(phase in 1..4) for(reason in listOf("quota","permission_revoked","credentials_expired","transient","provider_failure")) {
            val fake=Fake().apply {failAt=phase;this.reason=reason}
            val ops=CloudOperations(fake,{context},{},{})
            assertTrue(runCatching {ops.publish(snapshot,42,key,manifest.writerId,null) {}}.isFailure)
            assertEquals(phase,fake.calls)
        }
        for(phase in 1..4) for(change in listOf("epoch","account","cancel")) {
            val fake=Fake();var current=context
            fake.after={if(it==phase) {if(change=="account") fake.tag="0".repeat(64) else current=current.copy(sessionEpoch=6,cancelled=change=="cancel")}}
            val ops=CloudOperations(fake,{current},{check(current==context)},{})
            assertTrue(runCatching {ops.publish(snapshot,42,key,manifest.writerId,null) {}}.isFailure)
            assertEquals(phase,fake.calls)
        }
        for(phase in listOf(2,4)) {val fake=Fake().apply {corruptAt=phase};assertTrue(runCatching {CloudOperations(fake,{context},{},{}).publish(snapshot,42,key,manifest.writerId,null) {}}.isFailure)}
        val fake=Fake();val published=CloudOperations(fake,{context},{},{}).publish(snapshot,42,key,manifest.writerId,null) {}
        val clean=context.copy(binding=context.binding.copy(vaultTag=null))
        val ops=CloudOperations(fake,{clean},{},{})
        val found=ops.discover(key);assertEquals(listOf(published),found.manifests)
        assertEquals(snapshot,ops.restore(found,published,key))
        val wrong=ops.discover(Backup.recoveryKey());assertTrue(wrong.manifests.isEmpty());assertEquals(1,wrong.rejectedManifests)
        assertEquals(2,fake.objects.size)
        val bad=CloudItem("damaged","manifest-${Wire.id()}.pennymanifest")
        fake.objects[bad.id]=bad to "damaged".toByteArray()
        val otherKey=Backup.recoveryKey();val old=published.copy(manifestId=Wire.id())
        val oldItem=CloudItem("old-key",old.manifestName);fake.objects[oldItem.id]=oldItem to CloudContract.seal(old,otherKey)
        val mixed=ops.discover(key);assertEquals(listOf(published),mixed.manifests);assertEquals(2,mixed.rejectedManifests)
        val allWrong=ops.discover(Backup.recoveryKey());assertEquals(3,allWrong.rejectedManifests);assertTrue(allWrong.manifests.isEmpty())
    }
}
