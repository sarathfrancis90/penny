package ca.penny.offline

import android.content.ContextWrapper
import androidx.test.platform.app.InstrumentationRegistry
import ca.penny.v4frameprobe.NativeFrames
import java.io.File
import java.security.KeyStore
import org.junit.Assert.*
import org.junit.Test

/** Required shared opposite-native fixture: absence is a failure, never a skipped import. */
class V4NativeWriterInterchangeDeviceTest {
    @Test fun swiftWriterBytesPrepareInstallAndFreshStoreReopenExactly() {
        val instrumentation=InstrumentationRegistry.getInstrumentation();val target=instrumentation.targetContext
        assertEquals("ca.penny.offline.dev.test",target.packageName)
        fun bytes(name:String)=instrumentation.context.assets.open("v4-native-writer-v1/$name").use {it.readBytes()}
        val proof=StrictJson.objectFrom(bytes("ios-provenance.json"))
        val encrypted=bytes(proof.getString("file"));val snapshot=bytes(proof.getString("snapshotFile"))
        assertEquals(proof.getLong("ciphertextBytes"),encrypted.size.toLong());assertEquals(proof.getString("ciphertextSha256"),Attachment.digest(encrypted))
        assertEquals(proof.getString("snapshotSha256"),Attachment.digest(snapshot))
        val expected=Snapshot.decode(StrictJson.objectFrom(snapshot));val root=Backup.key(proof.getString("recoveryKey"))
        val dir=File(target.noBackupFilesDir,"v4-peer-${Wire.id()}").apply {mkdir()};val alias="penny.test.v4.peer.${Wire.id()}"
        val context=object:ContextWrapper(target) {override fun getNoBackupFilesDir()=dir};val name="v4-peer-${Wire.id()}.db"
        try {
            VaultStore(context,name,alias).use {store->
                store.snapshot() // Initialize this unique receiving vault through its existing path.
                store.generations.fault={if(it==VaultGenerations.Point.SNAPSHOT_HYDRATION) error("No preparation hydration")}
                val candidate=store.prepareV4(encrypted.inputStream(),root)
                assertEquals(expected.vaultId,candidate.metadata.vaultId);assertEquals(expected.snapshotId,candidate.metadata.snapshotId)
                store.generations.fault={};store.installPrepared(candidate);candidate.close()
            }
            VaultStore(context,name,alias).use {store->val actual=store.snapshot()
                assertEquals(expected.vaultId,actual.vaultId);assertEquals(expected.snapshotId,actual.snapshotId);assertEquals(expected.createdAt,actual.createdAt)
                assertEquals(expected.expenses.toSet(),actual.expenses.toSet())
                expected.finance.domains().forEach {(domain,rows)->assertEquals(domain,rows.toSet(),actual.finance.domains().getValue(domain).toSet())}
                assertEquals(expected.attachments.toSet(),actual.attachments.toSet());expected.attachments.forEach {d->assertArrayEquals(d.bytes(),actual.attachments.single {it.id==d.id}.bytes())}
            }
        } finally {root.fill(0);context.deleteDatabase(name);dir.deleteRecursively();KeyStore.getInstance("AndroidKeyStore").apply {load(null);deleteEntry(alias)};assertEquals(0,NativeFrames.activeHandlesForTests())}
    }
}
