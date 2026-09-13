package ca.penny.offline

import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import java.io.File

class OfflineContractTest {
    private fun fixture(name: String) = checkNotNull(javaClass.classLoader?.getResourceAsStream(name)).readBytes()
    private val golden get() = JSONObject(String(fixture("golden-vector.json")))
    @Test fun conformanceCorpus() {
        val corpus = JSONObject(String(fixture("conformance.json")))
        val money = corpus.getJSONArray("money")
        for (i in 0 until money.length()) {
            val row = money.getJSONObject(i)
            val actual = runCatching { Money.parse(row.getString("input")) }.getOrNull()
            assertEquals(row.toString(), if (row.isNull("expected")) null else row.getLong("expected"), actual)
        }
        for ((name, check) in listOf<Pair<String, (String) -> Unit>>("dates" to Wire::requireDate, "timestamps" to Wire::requireInstant)) {
            val rows = corpus.getJSONArray(name)
            for (i in 0 until rows.length()) { val row = rows.getJSONObject(i); assertEquals(row.toString(), row.getBoolean("valid"), runCatching { check(row.getString("input")) }.isSuccess) }
        }
    }
    @Test fun decryptsSharedGoldenAndRoundTrips() {
        val key = golden.getString("recoveryKey")
        val snapshot = Backup.decrypt(fixture("backup-v1.pennybackup"), key)
        assertEquals(1234L, Money.total(snapshot.expenses))
        assertEquals("Café Toronto ☕", snapshot.expenses.single().merchant)
        val encoded = Backup.encrypt(snapshot, key)
        assertEquals(snapshot, Backup.decrypt(encoded, key))
        File("build/android-backup-v1.pennybackup").apply { parentFile?.mkdirs(); writeBytes(encoded) }
    }
    @Test fun rejectsTamperingAndWrongKey() {
        val key = golden.getString("recoveryKey")
        for (field in listOf("nonce", "tag", "ciphertext")) {
            val json = JSONObject(String(fixture("backup-v1.pennybackup")))
            val data = json.getString(field); json.put(field, (if (data[0] == 'A') "B" else "A") + data.drop(1))
            assertTrue(runCatching { Backup.decrypt(json.toString().toByteArray(), key) }.isFailure)
        }
        assertTrue(runCatching { Backup.decrypt(fixture("backup-v1.pennybackup"), Backup.recoveryKey()) }.isFailure)
    }
    @Test fun rejectsLossyAndMalformedImports() {
        for (text in listOf("{\"x\":1,\"x\":2}", "{\"x\":1,}", "{x:1}", "{\"x\":NaN}", "{\"x\":\"\\uD800\"}", "{}[]")) {
            assertTrue(text, runCatching { StrictJson.objectFrom(text.toByteArray()) }.isFailure)
        }
        assertTrue(runCatching { StrictJson.objectFrom(byteArrayOf(0xC3.toByte(), 0x28)) }.isFailure)
        val snapshot = Snapshot.decode(JSONObject(String(fixture("snapshot-v1.json"))))
        assertTrue(runCatching { snapshot.copy(expenses = snapshot.expenses + snapshot.expenses).validate() }.isFailure)
        assertTrue(runCatching { Snapshot.decode(snapshot.json().put("futureDomain", true)) }.isFailure)
        assertTrue(runCatching { Expense.decode(snapshot.expenses.single().json().put("merchant", 123)) }.isFailure)
        assertTrue(runCatching { Expense.decode(snapshot.expenses.single().json().put("amountMinor", 1.5)) }.isFailure)
    }
    @Test fun receiptParserDoesNotInventTotals() {
        assertEquals("12.34", ReceiptParser.draft("Coffee Shop\nSubtotal 10.92\nTax 1.42\nTOTAL $12.34").amount)
        assertEquals("", ReceiptParser.draft("Coffee Shop\nSubtotal 10.92\nTax 1.42").amount)
    }
    @Test fun sharedExpenseMutationCorpus() {
        val mutations = JSONObject(String(fixture("conformance.json"))).getJSONArray("expenseMutations")
        val original = Snapshot.decode(JSONObject(String(fixture("snapshot-v1.json")))).expenses.single()
        for (i in 0 until mutations.length()) {
            val row = mutations.getJSONObject(i)
            assertEquals(row.getString("name"), row.getBoolean("valid"), runCatching { Expense.decode(original.json().put(row.getString("field"), row.get("value"))) }.isSuccess)
        }
    }
    @Test fun rejectsVaultTooLargeForPortableBackup() {
        val original = Snapshot.decode(JSONObject(String(fixture("snapshot-v1.json"))))
        val notes = "€".repeat(4000)
        val large = original.copy(expenses = List(1500) { original.expenses.single().copy(id = Wire.id(), note = notes) })
        assertTrue(runCatching { Backup.requireCapacity(large) }.isFailure)
        Backup.requireCapacity(original)
    }
    @Test fun receiptSnapshotV2GoldenAndMutations() {
        val vector = JSONObject(String(fixture("golden-vector-v2.json")))
        val snapshot = Backup.decrypt(fixture("backup-v2.pennybackup"), vector.getString("recoveryKey"))
        assertArrayEquals(fixture("receipt.png"), snapshot.attachments.single().bytes())
        val encrypted = Backup.encrypt(snapshot, vector.getString("recoveryKey"))
        assertEquals(snapshot, Backup.decrypt(encrypted, vector.getString("recoveryKey")))
        File("build/android-backup-v2.pennybackup").writeBytes(encrypted)
        val corpus = JSONObject(String(fixture("conformance-v2.json")))
        val mutations = corpus.getJSONArray("attachmentMutations")
        for (i in 0 until mutations.length()) {
            val mutation = mutations.getJSONObject(i)
            val changed = snapshot.json()
            changed.getJSONArray("attachments").getJSONObject(0).put(mutation.getString("field"), mutation.get("value"))
            assertTrue(mutation.getString("name"), runCatching { Snapshot.decode(changed) }.isFailure)
        }
        assertTrue(runCatching { snapshot.copy(attachments = snapshot.attachments + snapshot.attachments).validate() }.isFailure)
        assertTrue(runCatching { snapshot.copy(attachments = List(101) { snapshot.attachments.single().copy(id = Wire.id()) }).validate() }.isFailure)
        assertTrue(runCatching { Snapshot.decode(snapshot.json().put("schemaVersion", 4)) }.isFailure)
        assertTrue(runCatching { Snapshot.decode(snapshot.json().put("schemaVersion", true)) }.isFailure)
        assertEquals(snapshot, Snapshot.decode(snapshot.json().put("schemaVersion", 3.0)))
        assertTrue(runCatching { snapshot.expenses.single().copy(merchant = "\uD800") }.isFailure)
        assertTrue(runCatching { snapshot.expenses.single().copy(note = "\uDC00") }.isFailure)
        corpus.optJSONArray("imageFailures")?.let { rows -> for (i in 0 until rows.length()) {
            val row = rows.getJSONObject(i)
            val changed = snapshot.json().put("attachments", org.json.JSONArray().put(row.getJSONObject("attachment")))
            assertTrue(row.getString("name"), runCatching { Snapshot.decode(changed) }.isFailure)
        } }
        assertEquals(3L, Backup.decrypt(fixture("backup-v1.pennybackup"), golden.getString("recoveryKey")).json().getLong("schemaVersion"))
        corpus.optJSONArray("strictJsonFailures")?.let { rows -> for (i in 0 until rows.length()) {
            assertTrue(rows.getString(i), runCatching { StrictJson.objectFrom(rows.getString(i).toByteArray()) }.isFailure)
        } }
        StrictJson.objectFrom("{\"note\":\"\\ud83d\\ude00\"}".toByteArray())
        val slashText = "</script> / \\/ café 😀"
        val slashJson = StrictJson.bytes(JSONObject().put("value", slashText))
        assertEquals(slashText, StrictJson.objectFrom(slashJson).getString("value"))
        assertTrue(String(slashJson).contains("</script>"))
    }
}
