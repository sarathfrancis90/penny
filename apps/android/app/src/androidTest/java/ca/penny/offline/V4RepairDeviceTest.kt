package ca.penny.offline

import android.content.Context
import android.content.ContextWrapper
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.*
import org.junit.Test
import java.io.ByteArrayInputStream
import java.io.File
import java.security.KeyStore
import javax.crypto.KeyGenerator

class V4RepairDeviceTest {
    private val ins=InstrumentationRegistry.getInstrumentation()
    private fun bytes(path:String)=ins.context.assets.open(path).use {it.readBytes()}
    private fun snapshot(path:String)=Snapshot.decode(StrictJson.objectFrom(bytes(path)))
    private val root get()=ByteArray(32) {7}
    private fun keys()=KeyStore.getInstance("AndroidKeyStore").apply {load(null)}
    private fun provision(alias:String) {KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES,"AndroidKeyStore").apply {init(KeyGenParameterSpec.Builder(alias,KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT).setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).setKeySize(256).build())}.generateKey()}
    private fun fails(block:()->Unit)=checkNotNull(runCatching(block).exceptionOrNull())
    private fun scenario(block:(VaultStore,Context,String,File)->Unit) {
        val target=ins.targetContext;check(target.packageName=="ca.penny.offline.dev.test")
        val dir=File(target.noBackupFilesDir,"repair-${Wire.id()}").apply {mkdir()};val alias="penny.test.repair.${Wire.id()}"
        val context=object:ContextWrapper(target) {override fun getNoBackupFilesDir()=dir}
        try {VaultStore(context,"vault.db",alias).use {store->store.replace(snapshot("local-generation-v1/previous.json"));block(store,context,alias,dir)}}
        finally {dir.deleteRecursively();keys().deleteEntry(alias)}
    }
    private fun original(store:VaultStore,dir:File):Map<String,String> = buildMap {
        val tables=(listOf("expenses","attachments")+FinanceData.limits.keys).associateWith {"id"}+mapOf("metadata" to "key","vault_generations" to "id","vault_rows" to "generationId,domain,id","vault_receipts" to "id")
        tables.forEach {(table,order)->store.readableDatabase.rawQuery("SELECT * FROM $table ORDER BY $order",null).use {r->var n=0;while(r.moveToNext()) put("$table/${n++}",(0 until r.columnCount).joinToString("|") {if(r.isNull(it)) "null" else if(r.getType(it)==android.database.Cursor.FIELD_TYPE_BLOB) CloudContract.sha256(r.getBlob(it)) else r.getString(it)})}}
        dir.walkTopDown().filter {it.extension=="pennyreceipt"}.forEach {put(it.relativeTo(dir).path,CloudContract.sha256(it.readBytes()))}
    }
    private fun prepare(store:VaultStore,operation:RestoreOperation=RestoreOperation(),fault:(V4Restore.Point,File)->Unit={_,_->})=store.prepareV4(ByteArrayInputStream(bytes("v4-native-writer-v1/ios-finance.pennybackup")),root,operation,fault)
    private fun assertRestored(store:VaultStore) {
        val expected=snapshot("v4-native-writer-v1/ios-finance.snapshot.json");val actual=store.snapshot()
        assertEquals(expected.vaultId,actual.vaultId);assertEquals(expected.snapshotId,actual.snapshotId);assertEquals(expected.createdAt,actual.createdAt)
        assertEquals(expected.expenses.toSet(),actual.expenses.toSet());assertEquals(expected.finance,actual.finance);assertEquals(expected.attachments,actual.attachments)
        expected.attachments.zip(actual.attachments).forEach {(a,b)->assertArrayEquals(a.bytes(),b.bytes())}
    }
    @Test fun missingKeyAndCorruptStatePreviewAreReadOnlyThenExplicitRepairReopensAllDomains() {
        assertEquals("3875350e58c5b704fdf3e6dc6f16b80a08a52ec2e5cc6861c091966e22bb89b9",CloudContract.sha256(bytes("v4-repair-v1/acceptance.json")))
        for(mode in listOf("missing-key","state","header","receipt")) scenario {store,context,alias,dir->
            when(mode) {
                "missing-key"->keys().deleteEntry(alias)
                "state"->store.writableDatabase.execSQL("UPDATE metadata SET value='damaged' WHERE key='activeState'")
                "header"->store.writableDatabase.execSQL("UPDATE vault_generations SET sealedHeader=zeroblob(length(sealedHeader))")
                else->dir.walkTopDown().single {it.extension=="pennyreceipt"}.apply {writeBytes(readBytes().also {it[it.lastIndex]=(it.last().toInt() xor 1).toByte()})}
            }
            fails {store.liveState()};val before=original(store,dir);val present=keys().containsAlias(alias)
            val candidate=prepare(store);assertEquals(before,original(store,dir));assertEquals(present,keys().containsAlias(alias))
            store.installPrepared(candidate);candidate.close();fails {store.installPrepared(candidate)};assertRestored(store)
            VaultStore(context,"vault.db",alias).use(::assertRestored)
        }
    }
    @Test fun wrongKeyTruncationTamperReadCloseAndCancellationPreserveUnreadableOriginal() {
        for(mode in listOf("wrong-key","truncate","tamper","read","close","pass1","pass2","source-close","dismiss")) scenario {store,_,alias,dir->
            keys().deleteEntry(alias);val before=original(store,dir);val operation=RestoreOperation();var closed=false
            var data=bytes("v4-native-writer-v1/ios-finance.pennybackup")
            if(mode=="truncate") data=data.copyOf(data.size-1)
            if(mode=="tamper") data[data.lastIndex]=(data.last().toInt() xor 1).toByte()
            val input=object:ByteArrayInputStream(data) {override fun read(b:ByteArray,off:Int,len:Int):Int {if(mode=="read") error("input fault");return super.read(b,off,len)};override fun close() {closed=true;super.close();if(mode=="close") error("close fault")}}
            val work={store.prepareV4(input,if(mode=="wrong-key") ByteArray(32) {8} else root,operation) {point,_->
                if((mode=="pass1" && point==V4Restore.Point.PASS1_READ)||(mode=="pass2" && point==V4Restore.Point.PASS2_READ)||(mode=="source-close" && point==V4Restore.Point.SOURCE_CLOSED)) operation.cancel()
            }}
            if(mode=="dismiss") {val candidate=work();candidate.close();fails {store.installPrepared(candidate)}} else fails {work()}
            assertTrue(closed);assertFalse(keys().containsAlias(alias));assertEquals(before,original(store,dir))
        }
    }
    @Test fun changedSourceNamespaceAndAllKeyTransitionsRejectWithoutRecapture() {
        for(mode in listOf("absent-present","present-absent","present-different","row","receipt","namespace","other-writer")) scenario {store,context,alias,dir->
            if(mode=="absent-present") keys().deleteEntry(alias) else store.writableDatabase.execSQL("UPDATE metadata SET value='damaged' WHERE key='activeState'")
            val candidate=prepare(store)
            when(mode) {
                "absent-present"->provision(alias)
                "present-absent"->keys().deleteEntry(alias)
                "present-different"->{keys().deleteEntry(alias);provision(alias)}
                "row"->store.writableDatabase.execSQL("UPDATE metadata SET value='changed' WHERE key='activeState'")
                "receipt"->dir.walkTopDown().single {it.extension=="pennyreceipt"}.appendBytes(byteArrayOf(1))
                "namespace"->{val file=File(dir,"vault.db");val temp=File(dir,"copied.db");file.copyTo(temp);android.system.Os.rename(temp.absolutePath,file.absolutePath)}
                else->VaultStore(context,"vault.db",alias).use {second->
                    fun version()=store.readableDatabase.rawQuery("PRAGMA data_version",null).use {r->r.moveToFirst();r.getLong(0)}
                    val versionBefore=version();val db=second.writableDatabase
                    db.beginTransaction()
                    try {db.execSQL("UPDATE metadata SET value='temporary' WHERE key='activeState'");db.execSQL("UPDATE metadata SET value='damaged' WHERE key='activeState'");db.setTransactionSuccessful()} finally {db.endTransaction()}
                    assertNotEquals("The other connection must actually commit a pager change",versionBefore,version())
                }
            }
            val before=original(store,dir);val present=keys().containsAlias(alias)
            assertNotNull("Repair must reject $mode",runCatching {store.installPrepared(candidate)}.exceptionOrNull());candidate.close();assertEquals(before,original(store,dir));assertEquals(present,keys().containsAlias(alias))
        }
    }
    @Test fun failuresAfterNewKeyAndPreparedFilesRestoreAbsentKeyAndPriorBytes() {
        for(point in listOf(VaultGenerations.Point.REPAIR_KEY_READY,VaultGenerations.Point.FILES_READY,VaultGenerations.Point.ROWS_READY)) scenario {store,_,alias,dir->
            keys().deleteEntry(alias);val before=original(store,dir);val candidate=prepare(store)
            store.generations.fault={if(it==point) {assertTrue(keys().containsAlias(alias));error("after key before publication")}}
            fails {store.installPrepared(candidate)};candidate.close();store.generations.fault={}
            assertFalse(keys().containsAlias(alias));assertEquals(before,original(store,dir));fails {store.installPrepared(candidate)}
        }
    }
    @Test fun appearanceAndReplacementAtKeyCreationNeverBecomeOwnedCleanupKeys() {
        for(point in listOf(VaultGenerations.Point.REPAIR_KEY_CREATING,VaultGenerations.Point.REPAIR_KEY_READY)) scenario {store,_,alias,dir->
            keys().deleteEntry(alias);val before=original(store,dir);val candidate=prepare(store)
            var proof:ByteArray?=null;val plaintext=ByteArray(32) {42}
            store.generations.fault={if(it==point) {
                if(keys().containsAlias(alias)) keys().deleteEntry(alias)
                provision(alias)
                val key=keys().getKey(alias,null) as javax.crypto.SecretKey
                val cipher=javax.crypto.Cipher.getInstance("AES/GCM/NoPadding");cipher.init(javax.crypto.Cipher.ENCRYPT_MODE,key)
                proof=cipher.iv+cipher.doFinal(plaintext)
            }}
            fails {store.installPrepared(candidate)};candidate.close();store.generations.fault={}
            assertNotNull(proof);assertTrue(keys().containsAlias(alias));assertEquals(before,original(store,dir))
            val cipher=javax.crypto.Cipher.getInstance("AES/GCM/NoPadding");val bytes=checkNotNull(proof)
            cipher.init(javax.crypto.Cipher.DECRYPT_MODE,keys().getKey(alias,null) as javax.crypto.SecretKey,javax.crypto.spec.GCMParameterSpec(128,bytes,0,12))
            assertArrayEquals(plaintext,cipher.doFinal(bytes,12,bytes.size-12))
        }
    }
    @Test fun cancellationAndPostPublicationUncertaintyKeepRecoveryMaterial()=scenario {store,context,alias,dir->
        keys().deleteEntry(alias);val before=original(store,dir);val token=RestoreOperation();val cancelled=prepare(store,token);token.cancel()
        fails {store.installPrepared(cancelled)};cancelled.close();assertFalse(keys().containsAlias(alias));assertEquals(before,original(store,dir))
        val candidate=prepare(store);store.generations.fault={if(it==VaultGenerations.Point.POINTER_COMMITTED) error("post publication uncertainty")}
        fails {store.installPrepared(candidate)};candidate.close();assertTrue(keys().containsAlias(alias));store.generations.fault={}
        // Existing pending recovery verifies the published generation; no claim that old state was restored.
        VaultStore(context,"vault.db",alias).use(::assertRestored)
    }
}
