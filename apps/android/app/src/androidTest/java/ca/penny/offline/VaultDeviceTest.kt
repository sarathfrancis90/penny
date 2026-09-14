package ca.penny.offline

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.net.Uri
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import kotlinx.coroutines.runBlocking
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File
import java.security.KeyStore
import org.json.JSONObject
import androidx.test.platform.app.InstrumentationRegistry

@RunWith(AndroidJUnit4::class)
class VaultDeviceTest {
    private val context get() = ApplicationProvider.getApplicationContext<android.content.Context>()
    private fun fixture(name: String) = InstrumentationRegistry.getInstrumentation().context.assets.open(name).use { it.readBytes() }
    @Test fun largeReceiptReopensBeyondCursorWindowSize() {
        val suffix = Wire.id(); val name = "test-$suffix.db"; val alias = "penny.test.$suffix"
        val image = Bitmap.createBitmap(850, 650, Bitmap.Config.ARGB_8888)
        val random = java.util.Random(1)
        image.setPixels(IntArray(850 * 650) { random.nextInt() or 0xff000000.toInt() }, 0, 850, 0, 0, 850, 650)
        val output = java.io.ByteArrayOutputStream()
        image.compress(Bitmap.CompressFormat.PNG, 100, output); image.recycle()
        val bytes = output.toByteArray()
        assertTrue("Large receipt fixture must exercise SQLite CursorWindow boundary: ${bytes.size}", bytes.size in 1_600_000..Attachment.maxBytes)
        val expense = Expense(merchant = "Large receipt", amountMinor = 100, expenseDate = "2026-09-13")
        val attachment = Attachment.fromBytes(expense.id, bytes)
        val store = VaultStore(context, name, alias)
        try {
            store.save(expense, listOf(attachment)); store.close()
            VaultStore(context, name, alias).use { reopened ->
                assertArrayEquals(bytes, reopened.attachments().single().bytes())
                val recovery = Backup.recoveryKey()
                assertArrayEquals(bytes, Backup.decrypt(Backup.encrypt(reopened.snapshot(), recovery), recovery).attachments.single().bytes())
            }
        } finally {
            store.close(); android.database.sqlite.SQLiteDatabase.deleteDatabase(File(context.noBackupFilesDir, name))
            KeyStore.getInstance("AndroidKeyStore").apply { load(null); deleteEntry(alias) }
        }
    }
    @Test fun receiptRestoreIsEncryptedCompleteAndRollsBackOnStorageFailure() {
        val suffix = Wire.id(); val name = "test-$suffix.db"; val alias = "penny.test.$suffix"
        val store = VaultStore(context, name, alias)
        try {
            val key = JSONObject(String(fixture("golden-vector-v2.json"))).getString("recoveryKey")
            val incoming = Backup.decrypt(fixture("backup-v2.pennybackup"), key)
            val nativeIos = Backup.decrypt(fixture("native-exports/ios-v2.pennybackup"), key)
            assertEquals(incoming.expenses, nativeIos.expenses)
            assertEquals(incoming.attachments, nativeIos.attachments)
            ReceiptImage.validate(incoming.attachments)
            store.replace(nativeIos)
            assertEquals(incoming.expenses.toSet(), store.all().toSet())
            assertEquals(incoming.attachments, store.attachments())
            assertArrayEquals(fixture("receipt.png"), store.attachments().single().bytes())
            val raw = File(context.noBackupFilesDir, name).readBytes()
            assertFalse(String(raw, Charsets.ISO_8859_1).contains("Café Toronto"))
            assertFalse(String(raw, Charsets.ISO_8859_1).contains(incoming.attachments.single().dataBase64))
            val old = store.snapshot()
            store.writableDatabase.execSQL("CREATE TEMP TRIGGER fail_replace BEFORE INSERT ON vault_rows WHEN NEW.domain='expenses' BEGIN SELECT RAISE(ABORT, 'injected write failure'); END")
            assertTrue(runCatching { store.replace(incoming.copy(expenses = incoming.expenses.map { it.copy(merchant = "Replacement") })) }.isFailure)
            store.writableDatabase.execSQL("DROP TRIGGER fail_replace")
            assertEquals(old.expenses, store.all()); assertEquals(old.attachments, store.attachments()); assertEquals(old.vaultId, store.vaultId())
            val malformed = incoming.attachments.single().bytes().copyOf().apply {
                // Intact PNG framing and CRC, corrupt zlib stream: only pixel decode can reject it.
                this[41] = 0
                val length = java.nio.ByteBuffer.wrap(this, 33, 4).int
                val corruptBytes = this
                val crc = java.util.zip.CRC32().apply { update(corruptBytes, 37, length + 4) }.value
                java.nio.ByteBuffer.wrap(this, 41 + length, 4).putInt(crc.toInt())
            }
            val damaged = incoming.copy(attachments = listOf(Attachment.fromBytes(incoming.expenses.single().id, malformed)))
            assertTrue(runCatching { store.replace(damaged) }.isFailure)
            assertEquals(old.attachments, store.attachments())
            val prepared = Backup.encrypt(store.snapshot(), key)
            File(context.filesDir, "android-runtime-v2.pennybackup").writeBytes(prepared)
            assertEquals(old.attachments, Backup.decrypt(prepared, key).attachments)
            val previewRevision = store.revision()
            val newer = incoming.expenses.single().copy(merchant = "Saved after restore preview")
            store.save(newer)
            assertTrue(runCatching { store.replace(incoming, expectedRevision = previewRevision) }.isFailure)
            assertEquals(newer, store.all().single()); assertEquals(old.attachments, store.attachments())
            store.delete(incoming.expenses.single().id)
            assertTrue(store.all().isEmpty()); assertTrue(store.attachments().isEmpty())
        } finally {
            store.close()
            android.database.sqlite.SQLiteDatabase.deleteDatabase(File(context.noBackupFilesDir, name))
            KeyStore.getInstance("AndroidKeyStore").apply { load(null); deleteEntry(alias) }
        }
    }
    @Test fun ciphertextPersistsAndConfirmedBackupRecoversLostKey() {
        val suffix = Wire.id(); val name = "test-$suffix.db"; val alias = "penny.test.$suffix"
        val expense = Expense(merchant = "Private merchant test", amountMinor = 1234, expenseDate = "2026-09-13")
        val store = VaultStore(context, name, alias)
        val vaultId = store.vaultId()
        try {
            store.save(expense); store.close()
            val reopened = VaultStore(context, name, alias)
            assertEquals(listOf(expense), reopened.all())
            val bytes = File(context.noBackupFilesDir, name).readBytes()
            assertFalse(String(bytes, Charsets.ISO_8859_1).contains(expense.merchant))
            val keys = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
            keys.deleteEntry(alias)
            assertTrue(runCatching { reopened.all() }.isFailure)
            reopened.replace(Snapshot(vaultId, listOf(expense)))
            assertEquals(listOf(expense), reopened.all())
            reopened.close()
        } finally {
            store.close()
            android.database.sqlite.SQLiteDatabase.deleteDatabase(File(context.noBackupFilesDir, name))
            KeyStore.getInstance("AndroidKeyStore").apply { load(null); deleteEntry(alias) }
        }
    }
    @Test fun bundledReceiptOcrWorksWithDeviceNetworksDisabled() = runBlocking {
        val automation=InstrumentationRegistry.getInstrumentation().uiAutomation
        fun shell(command: String)=android.os.ParcelFileDescriptor.AutoCloseInputStream(automation.executeShellCommand(command)).bufferedReader().use {it.readText().trim()}
        val wifi=shell("settings get global wifi_on");val data=shell("settings get global mobile_data")
        val oldAirplane=android.provider.Settings.Global.getInt(context.contentResolver,"airplane_mode_on",0)!=0
        fun airplane(enabled:Boolean) {
            if((android.provider.Settings.Global.getInt(context.contentResolver,"airplane_mode_on",0)!=0)==enabled) return
            shell("cmd activity start -a android.settings.WIRELESS_SETTINGS")
            fun findSwitch(node:android.view.accessibility.AccessibilityNodeInfo?):android.view.accessibility.AccessibilityNodeInfo? {
                if(node==null) return null
                if(node.className?.toString()=="android.widget.Switch") return node
                for(i in 0 until node.childCount) findSwitch(node.getChild(i))?.let {return it}
                return null
            }
            val end=System.nanoTime()+5_000_000_000
            var control:android.view.accessibility.AccessibilityNodeInfo?=null
            while(control==null && System.nanoTime()<end) {
                val label=automation.rootInActiveWindow?.findAccessibilityNodeInfosByText("Airplane mode")?.firstOrNull()
                var parent=label
                repeat(4) { if(control==null) control=findSwitch(parent);parent=parent?.parent }
                if(control==null) Thread.sleep(50)
            }
            checkNotNull(control) {"Airplane switch unavailable"}.let {if(it.isChecked!=enabled) {
                var clickable:android.view.accessibility.AccessibilityNodeInfo?=it
                while(clickable!=null && !clickable.isClickable) clickable=clickable.parent
                checkNotNull(clickable).let {target->check(target.performAction(android.view.accessibility.AccessibilityNodeInfo.ACTION_CLICK))}
            }}
            while((android.provider.Settings.Global.getInt(context.contentResolver,"airplane_mode_on",0)!=0)!=enabled && System.nanoTime()<end) Thread.sleep(50)
            check((android.provider.Settings.Global.getInt(context.contentResolver,"airplane_mode_on",0)!=0)==enabled)
        }
        if(android.os.Build.VERSION.SDK_INT<28) airplane(true) else {shell("svc wifi disable");shell("svc data disable")}
        val image = Bitmap.createBitmap(900, 500, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(image); canvas.drawColor(Color.WHITE)
        val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.BLACK; textSize = 58f }
        listOf("PENNY COFFEE", "Subtotal 10.92", "Tax 1.42", "TOTAL $12.34").forEachIndexed { index, text -> canvas.drawText(text, 50f, 90f + index * 100f, paint) }
        val file = File(context.cacheDir, "ocr-test.png")
        val ai = LocalIntelligence()
        try {
            // ACCESS_NETWORK_STATE is a normal app permission for WorkManager.
            // Do not use the API29-only shell identity helper on the API26 floor.
            val connectivity=context.getSystemService(android.net.ConnectivityManager::class.java)
            val deadline=System.nanoTime()+5_000_000_000
            while(connectivity.activeNetwork!=null && System.nanoTime()<deadline) Thread.sleep(50)
            assertNull("Actual device network must be disconnected before bundled OCR",connectivity.activeNetwork)
            file.outputStream().use { image.compress(Bitmap.CompressFormat.PNG, 100, it) }
            val draft = ai.receipt(context, Uri.fromFile(file))
            assertTrue(draft.merchant.orEmpty().contains("PENNY"))
            assertEquals("12.34", draft.amount)
        } finally { ai.close(); file.delete(); image.recycle();if(android.os.Build.VERSION.SDK_INT<28) airplane(oldAirplane) else {if(wifi!="0") shell("svc wifi enable");if(data!="0") shell("svc data enable")} }
    }
}
