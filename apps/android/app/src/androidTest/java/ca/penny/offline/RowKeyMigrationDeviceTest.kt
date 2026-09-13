package ca.penny.offline

import android.content.ContentValues
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator

@RunWith(AndroidJUnit4::class)
class RowKeyMigrationDeviceTest {
    private val instrumentation=InstrumentationRegistry.getInstrumentation()
    private val context get()=instrumentation.targetContext
    private fun fixture()=Snapshot.decode(StrictJson.objectFrom(instrumentation.context.assets.open("snapshot-v3.json").use {it.readBytes()}))
    private fun isolated(block: (String,String)->Unit) {
        val id=Wire.id();val name="test-rowkey-$id.db";val alias="penny.test.rowkey.$id"
        try {block(name,alias)} finally {android.database.sqlite.SQLiteDatabase.deleteDatabase(File(context.noBackupFilesDir,name));KeyStore.getInstance("AndroidKeyStore").apply {load(null);deleteEntry(alias)}}
    }
    private fun legacy(store:VaultStore,alias:String,snapshot:Snapshot) {
        val secret=KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES,"AndroidKeyStore").apply {
            init(KeyGenParameterSpec.Builder(alias,KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT).setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).setKeySize(256).build())
        }.generateKey()
        val db=store.writableDatabase;db.beginTransaction()
        try {
            db.execSQL("UPDATE metadata SET value=? WHERE key='vaultId'",arrayOf(snapshot.vaultId))
            fun write(table:String,id:String,json:org.json.JSONObject) {
                val aad=when(table) {"expenses"->id;"attachments"->"receipt:$id";else->"$table:$id"}
                val cipher=Cipher.getInstance("AES/GCM/NoPadding").apply {init(Cipher.ENCRYPT_MODE,secret);updateAAD(aad.toByteArray())}
                val plain=StrictJson.bytes(json)
                val output=java.io.ByteArrayOutputStream();var offset=0
                while(offset<plain.size) {val count=minOf(16*1024,plain.size-offset);cipher.update(plain,offset,count)?.let {output.write(it)};offset+=count}
                output.write(cipher.doFinal());val sealed=cipher.iv+output.toByteArray()
                assertEquals("Legacy seed has complete ciphertext",plain.size+28,sealed.size)
                db.insertOrThrow(table,null,ContentValues().apply {put("id",id);put("sealed",sealed)})
            }
            snapshot.expenses.forEach {write("expenses",it.id,it.json())};snapshot.attachments.forEach {write("attachments",it.id,it.json())}
            snapshot.finance.domains().forEach {(table,rows)->rows.forEach {write(table,it.id,it.json())}}
            db.setTransactionSuccessful()
        } finally {db.endTransaction()}
    }
    private fun state(store:VaultStore)=buildMap<String,String> {
        (listOf("expenses","attachments")+FinanceData.limits.keys).forEach {table->store.readableDatabase.rawQuery("SELECT id,hex(sealed) FROM $table",null).use {while(it.moveToNext()) put("$table/${it.getString(0)}",it.getString(1))}}
        store.readableDatabase.rawQuery("SELECT key,value FROM metadata",null).use {while(it.moveToNext())put("metadata/${it.getString(0)}",it.getString(1))}
    }
    private fun equalRecords(expected:Snapshot,actual:Snapshot) {assertEquals(expected.vaultId,actual.vaultId);assertEquals(expected.expenses.toSet(),actual.expenses.toSet());assertEquals(expected.attachments.toSet(),actual.attachments.toSet());assertEquals(expected.finance,actual.finance)}
    @Test fun legacyAllDomainMigrationRollsBackThenReopensAndSharesGeneration()=isolated {name,alias->
        val original=fixture()
        VaultStore(context,name,alias).use {store->
            legacy(store,alias,original);val before=state(store)
            store.writableDatabase.execSQL("CREATE TEMP TRIGGER fail_migration BEFORE UPDATE ON savingsEntries BEGIN SELECT RAISE(ABORT,'injected late migration failure'); END")
            assertTrue(runCatching {store.snapshot()}.isFailure)
            assertEquals(before,state(store))
            store.writableDatabase.execSQL("DROP TRIGGER fail_migration")
            equalRecords(original,store.snapshot())
            assertNotEquals(before,state(store))
            VaultStore(context,name,alias).use {second->
                equalRecords(original,second.snapshot())
                val next=original.copy(expenses=original.expenses.map {it.copy(note="Replacement generation")})
                second.replace(next)
                // First store must authenticate the current key after the other connection restores.
                equalRecords(next,store.snapshot())
                val changed=next.expenses.first().copy(note="Saved from prior connection")
                store.save(changed);assertEquals(changed,second.all().first {it.id==changed.id})
                val stable=state(store)
                second.writableDatabase.execSQL("CREATE TEMP TRIGGER fail_restore BEFORE INSERT ON incomeEntries BEGIN SELECT RAISE(ABORT,'injected restore failure'); END")
                assertTrue(runCatching {second.replace(original)}.isFailure)
                assertEquals(stable,state(store));assertEquals(changed,second.all().first {it.id==changed.id})
            }
        }
        VaultStore(context,name,alias).use {assertTrue(it.snapshot().expenses.any {row->row.note=="Saved from prior connection"})}
    }
    @Test fun missingOrCorruptWrappedKeyNeverResetsFinanceOnlyVault()=isolated {name,alias->
        val original=fixture().copy(expenses=emptyList(),attachments=emptyList())
        VaultStore(context,name,alias).use {store->
            store.replace(original);store.snapshot()
            store.writableDatabase.execSQL("UPDATE metadata SET value='damaged' WHERE key='dataKey'")
            val damaged=state(store)
            assertTrue(runCatching {store.snapshot()}.isFailure);assertEquals(damaged,state(store))
            store.replace(original);equalRecords(original,store.snapshot())
            store.writableDatabase.execSQL("DELETE FROM metadata WHERE key='dataKey'")
            val missing=state(store)
            assertTrue(runCatching {store.snapshot()}.isFailure);assertEquals(missing,state(store))
            store.replace(original)
            KeyStore.getInstance("AndroidKeyStore").apply {load(null);deleteEntry(alias)}
            val lost=state(store)
            assertTrue(runCatching {store.snapshot()}.isFailure);assertEquals(lost,state(store))
            store.replace(original);equalRecords(original,store.snapshot())
            KeyStore.getInstance("AndroidKeyStore").apply {load(null);deleteEntry(alias)}
            KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES,"AndroidKeyStore").apply {
                init(KeyGenParameterSpec.Builder(alias,KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT).setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).setKeySize(256).build())
            }.generateKey()
            val rotated=state(store)
            assertTrue(runCatching {store.snapshot()}.isFailure);assertEquals(rotated,state(store))
            store.replace(original);equalRecords(original,store.snapshot())
        }
    }
    @Test fun legacyReceiptLargerThanCursorWindowMigratesExactly()=isolated {name,alias->
        val tiny=instrumentation.context.assets.open("receipt.png").use {it.readBytes()}
        val chunk=ByteArray(Attachment.maxBytes-tiny.size);val size=chunk.size-12
        java.nio.ByteBuffer.wrap(chunk).putInt(size).put("npAD".toByteArray())
        val crc=java.util.zip.CRC32().apply {update(chunk,4,size+4)}.value
        java.nio.ByteBuffer.wrap(chunk,chunk.size-4,4).putInt(crc.toInt())
        val bytes=tiny.copyOfRange(0,tiny.size-12)+chunk+tiny.copyOfRange(tiny.size-12,tiny.size)
        val expense=Expense(merchant="Large legacy receipt",amountMinor=1234,expenseDate="2026-09-13")
        val snapshot=Snapshot(Wire.id(),listOf(expense),attachments=listOf(Attachment.fromBytes(expense.id,bytes)))
        VaultStore(context,name,alias).use {store->legacy(store,alias,snapshot);assertArrayEquals(bytes,store.snapshot().attachments.single().bytes())}
        VaultStore(context,name,alias).use {store->assertArrayEquals(bytes,store.snapshot().attachments.single().bytes())}
    }
    @Test fun staleReceiptRemovalRefusesLostOrDamagedKey()=isolated {name,alias->
        val original=fixture()
        VaultStore(context,name,alias).use {store->
            for(failure in listOf("missing DEK","corrupt DEK","missing KEK")) {
                store.replace(original)
                val selected=store.attachments().first().id
                when(failure) {
                    "missing DEK" -> store.writableDatabase.execSQL("DELETE FROM metadata WHERE key='dataKey'")
                    "corrupt DEK" -> store.writableDatabase.execSQL("UPDATE metadata SET value='damaged' WHERE key='dataKey'")
                    else -> KeyStore.getInstance("AndroidKeyStore").apply {load(null);deleteEntry(alias)}
                }
                val before=state(store)
                assertTrue(failure,runCatching {store.deleteAttachment(selected)}.isFailure)
                assertEquals(before,state(store))
            }
        }
    }
}
