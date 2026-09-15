package ca.penny.offline

/** Deterministic protocol reducer. All provider effects are outside this type. */
data class CloudContext(val binding: CloudBinding,val sessionEpoch: Long,val localRevision: Long,val cancelled: Boolean=false) {
    fun validate() { require(sessionEpoch in 0..CloudContract.maxRevision && localRevision in 0..CloudContract.maxRevision) }
}
data class CloudPublication(val operationId: String,val manifest: CloudManifest,val context: CloudContext,val phase: String="snapshotUpload",val manifestDigest: String?=null,val lastGood: CloudManifest?=null,val error: String?=null,val verifiedAt: String?=null) {
    companion object {
        val phases=listOf("snapshotUpload","snapshotDownload","manifestUpload","manifestDownload")
        fun begin(id: String,manifest: CloudManifest,bytes: ByteArray,key: String,context: CloudContext,lastGood: CloudManifest?=null): CloudPublication {
            Wire.requireId(id);context.validate();manifest.validate();manifest.requireBinding(context.binding)
            require(context.binding.vaultTag==manifest.vaultTag && !context.cancelled && context.localRevision==manifest.localRevision)
            CloudContract.verifySnapshot(bytes,key,manifest)
            lastGood?.let {it.validate();it.requireBinding(context.binding);require(it.writerId==manifest.writerId && it.localRevision<=manifest.localRevision)}
            require(manifest.previousManifestId==lastGood?.manifestId)
            return CloudPublication(id,manifest,context,lastGood=lastGood)
        }
    }
    private fun blocked(current: CloudContext): String? {
        current.validate()
        return when {current.cancelled->"cancelled";current.binding!=context.binding || current.sessionEpoch!=context.sessionEpoch->"account_or_vault_changed";current.localRevision<manifest.localRevision->"revision_regressed";else->null}
    }
    fun mayEffect(current: CloudContext)=phase in phases && blocked(current)==null
    fun advance(id: String,eventPhase: String,current: CloudContext,key: String,failed: Boolean=false,bytes: ByteArray=byteArrayOf(),stagedManifest: ByteArray=byteArrayOf(),createdAt: String=Wire.now(),verifiedAt: String=Wire.now()): CloudPublication {
        if(id!=operationId || phase !in phases) return this
        blocked(current)?.let {return copy(phase="aborted",error=it)}
        if(eventPhase!=phase) return this
        if(failed) return copy(phase="failed",error="provider_failure")
        return try {
            if(phase=="snapshotDownload") {
                CloudContract.verifySnapshot(bytes,key,manifest);Wire.requireInstant(verifiedAt);Wire.requireInstant(createdAt)
                val actual=CloudContract.open(stagedManifest,key,context.binding)
                require(actual==manifest.copy(createdAt=createdAt,verifiedAt=verifiedAt))
                copy(manifest=actual,manifestDigest=CloudContract.sha256(stagedManifest),phase="manifestUpload")
            } else if(phase=="manifestDownload") {
                require(CloudContract.sha256(bytes)==manifestDigest)
                val actual=CloudContract.open(bytes,key,context.binding);require(actual==manifest);Wire.requireInstant(verifiedAt)
                copy(phase="verified",lastGood=actual,verifiedAt=verifiedAt)
            } else copy(phase=phases[phases.indexOf(phase)+1])
        } catch(_: Exception) {copy(phase="failed",error="verification_failed")}
    }
    fun currentVaultVerified(current: CloudContext)=current.binding==context.binding && current.sessionEpoch==context.sessionEpoch && lastGood?.writerId==manifest.writerId && lastGood.localRevision==current.localRevision
}

interface CloudTransport {
    suspend fun accountTag(): String
    suspend fun upload(name: String,bytes: ByteArray): CloudItem
    suspend fun download(item: CloudItem,maxBytes: Int): ByteArray
    suspend fun page(token: String?): CloudPage
}

/** Each await (including identity checks) is followed by the caller's epoch/expiry guard. */
class CloudOperations(private val transport: CloudTransport,private val current: ()->CloudContext,private val active: ()->Unit,private val imageValidation: (Snapshot)->Unit) {
    fun requireActive() = active()
    suspend fun confirmBinding() {checked { Unit }}
    private suspend fun <T> checked(effect: suspend ()->T): T {
        active();val binding=current().binding
        require(transport.accountTag()==binding.accountTag) {"account_changed"};active();require(current().binding==binding)
        val result=effect();active();require(current().binding==binding)
        require(transport.accountTag()==binding.accountTag) {"account_changed"};active();require(current().binding==binding)
        return result
    }
    suspend fun publish(snapshot: Snapshot,revision: Long,key: String,writerId: String,lastGood: CloudManifest?,progress: (String)->Unit): CloudManifest {
        active();val bytes=Backup.encrypt(snapshot,key);val now=Wire.now();val c=current();require(c.localRevision==revision)
        val manifest=CloudManifest(Wire.id(),c.binding.provider,c.binding.accountTag,checkNotNull(c.binding.vaultTag),writerId,revision,now,now,lastGood?.manifestId,CloudDescriptor(Wire.id(),snapshot.snapshotId,1,3,CloudContract.sha256(bytes),bytes.size,snapshot.createdAt)).validate()
        var state=CloudPublication.begin(Wire.id(),manifest,bytes,key,c,lastGood)
        fun guard() {active();check(state.mayEffect(current())) {"stale_publication"};progress(state.phase)}
        guard();val snapshotItem=checked {transport.upload(manifest.snapshotName,bytes)};require(snapshotItem.name==manifest.snapshotName)
        state=state.advance(state.operationId,"snapshotUpload",current(),key)
        guard();val snapshotRead=checked {transport.download(snapshotItem,Backup.maxEnvelopeBytes)}
        require(snapshotRead.contentEquals(bytes));imageValidation(CloudContract.verifySnapshot(snapshotRead,key,manifest))
        val verified=Wire.now();val staged=CloudContract.seal(manifest.copy(createdAt=verified,verifiedAt=verified),key)
        state=state.advance(state.operationId,"snapshotDownload",current(),key,bytes=snapshotRead,stagedManifest=staged,createdAt=verified,verifiedAt=verified)
        guard();val manifestItem=checked {transport.upload(manifest.manifestName,staged)};require(manifestItem.name==manifest.manifestName)
        state=state.advance(state.operationId,"manifestUpload",current(),key)
        guard();val manifestRead=checked {transport.download(manifestItem,CloudContract.maxManifest)};require(manifestRead.contentEquals(staged))
        state=state.advance(state.operationId,"manifestDownload",current(),key,bytes=manifestRead)
        active();check(state.phase=="verified");return checkNotNull(state.lastGood)
    }
    private suspend fun inventory(): Pair<List<CloudItem>,List<CloudItem>> {
        val pages=mutableListOf<CloudPage>();var token: String?=null;val seen=mutableSetOf<String>()
        do {
            require(pages.size<10) {"listing_limit"}
            val page=checked {transport.page(token)};require(page.items.size<=100);pages.add(page);token=page.nextPageToken
            token?.let {CloudContract.text(it,1,2048);require(seen.add(it)) {"invalid_page_token"}}
        } while(token!=null)
        return CloudContract.collect(pages) to pages.flatMap {it.items}
    }
    suspend fun requirePublicationCapacity() {val (manifests,items)=inventory();require(manifests.size<=99 && items.size<=998) {"cloud_capacity"}}
    suspend fun discover(key: String): CloudDiscovery {
        val (candidates,items)=inventory()
        var rejected=0
        val manifests=candidates.mapNotNull {item->
            val bytes=checked {transport.download(item,CloudContract.maxManifest)}
            runCatching {CloudContract.listed(item,bytes,key,current().binding)}.getOrElse {rejected++;null}
        }
        // Validate every group before displaying any candidate. No cross-writer latest choice.
        manifests.groupBy {it.vaultTag}.forEach {(vault,rows)->CloudContract.history(rows,current().binding.copy(vaultTag=vault))}
        return CloudDiscovery(manifests,items,rejected)
    }
    suspend fun restore(discovery: CloudDiscovery,manifest: CloudManifest,key: String): Snapshot {
        require(manifest in discovery.manifests);manifest.requireBinding(current().binding)
        val item=discovery.items.single {it.name==manifest.snapshotName}
        return CloudContract.verifySnapshot(checked {transport.download(item,Backup.maxEnvelopeBytes)},key,manifest).also(imageValidation)
    }
}
data class CloudDiscovery(val manifests: List<CloudManifest>,val items: List<CloudItem>,val rejectedManifests: Int=0)
