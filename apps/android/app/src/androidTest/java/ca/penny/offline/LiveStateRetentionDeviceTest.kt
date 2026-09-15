package ca.penny.offline

import android.content.ContextWrapper
import androidx.test.platform.app.InstrumentationRegistry
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import java.io.File
import java.security.KeyStore

/** Finite current-cap retention check, not a capacity or latency benchmark. */
class LiveStateRetentionDeviceTest {
    @Test fun fiftyMetadataEditsKeepOneGenerationAndOriginalReceiptCiphertext() {
        val ins=InstrumentationRegistry.getInstrumentation();val target=ins.targetContext
        assertEquals("ca.penny.offline.dev.test",target.packageName)
        fun json(path:String)=ins.context.assets.open(path).use {StrictJson.objectFrom(it.readBytes())}
        val plan=json("live-state-v1/retention.json")
        assertEquals(50,plan.getInt("mutationCount"))
        val contract=json("live-state-v1/"+plan.getString("baseFixture"))
        val source=Snapshot.decode(json("v4-native-writer-v1/android-finance.snapshot.json"))
        val edit=Expense.decode(contract.getJSONObject("expenseAfter"),3)
        val dir=File(target.noBackupFilesDir,"retention-${Wire.id()}").apply {mkdir()}
        val context=object:ContextWrapper(target) {override fun getNoBackupFilesDir()=dir}
        val alias="penny.test.retention.${Wire.id()}"
        try {VaultStore(context,"vault.db",alias).use {store->
            store.liveState()
            val key=Backup.key(contract.getString("publicSyntheticRecoveryKey"))
            try {store.restoreV4(ins.context.assets.open("v4-native-writer-v1/android-finance.pennybackup"),key)} finally {key.fill(0)}
            fun receiptFiles()=dir.walkTopDown().filter {it.extension=="pennyreceipt"}.associate {it.relativeTo(dir).path to (it.length() to CloudContract.sha256(it.readBytes()))}
            fun counts()=listOf("vault_generations","vault_rows","vault_receipts").associateWith {table->
                store.readableDatabase.rawQuery("SELECT count(*) FROM $table",null).use {r->r.moveToFirst();r.getLong(0)}
            }
            fun sqliteBytes()=dir.listFiles().orEmpty().filter {it.name.startsWith("vault.db")}.sumOf {it.length()}
            val beforeFiles=receiptFiles();val beforeCounts=counts();val beforeBytes=sqliteBytes();val revision=store.revision()
            assertEquals(1L,beforeCounts.getValue("vault_generations"));assertTrue(beforeCounts.getValue("vault_generations")<=plan.getLong("settledMaximumMetadataGenerations"));assertEquals(1L,beforeCounts.getValue("vault_receipts"))
            val peakCounts=beforeCounts.toMutableMap();var peakBytes=beforeBytes
            var live=store.liveState();val originalReceipts=live.receipts;var finalExpense=edit
            store.generations.fault={if(it==VaultGenerations.Point.SNAPSHOT_HYDRATION) error("Metadata edit requested aggregate hydration")}
            repeat(plan.getInt("mutationCount")) {index->
                finalExpense=if(index==49) edit else edit.copy(note=plan.getString("intermediateNotePrefix")+(index+1))
                live=store.editExpense(live,finalExpense)
                assertEquals(originalReceipts,live.receipts);assertEquals(beforeFiles,receiptFiles())
                val current=counts();assertEquals(beforeCounts,current)
                current.forEach {(table,count)->peakCounts[table]=maxOf(peakCounts.getValue(table),count)}
                peakBytes=maxOf(peakBytes,sqliteBytes())
            }
            assertEquals(revision+50,store.revision());store.generations.fault={}
            val expected=source.copy(expenses=source.expenses.map {if(it.id==edit.id) finalExpense else it})
            fun verify(actual:Snapshot) {
                assertEquals(expected.vaultId,actual.vaultId);assertEquals(expected.snapshotId,actual.snapshotId);assertEquals(expected.createdAt,actual.createdAt)
                assertEquals(expected.expenses.toSet(),actual.expenses.toSet());assertEquals(expected.finance,actual.finance);assertEquals(expected.attachments,actual.attachments)
                expected.attachments.zip(actual.attachments).forEach {(a,b)->assertArrayEquals(a.bytes(),b.bytes())}
            }
            verify(store.snapshot());VaultStore(context,"vault.db",alias).use {verify(it.snapshot())}
            assertEquals(beforeFiles,receiptFiles());assertEquals(beforeCounts,counts())
            val report=JSONObject().put("api",android.os.Build.VERSION.SDK_INT).put("edits",50)
                .put("beforeCounts",JSONObject(beforeCounts)).put("peakCounts",JSONObject(peakCounts)).put("afterCounts",JSONObject(counts()))
                .put("beforeSqliteFileBytes",beforeBytes).put("sampledPeakSqliteFileBytes",peakBytes).put("afterSqliteFileBytes",sqliteBytes())
                .put("receiptFileCount",beforeFiles.size).put("receiptFileBytes",beforeFiles.values.sumOf {it.first})
                .put("receiptCiphertextUnchanged",true).put("revisionDelta",store.revision()-revision)
                .put("expenseCount",expected.expenses.size).put("finalExpenseTotalMinor",Money.total(expected.expenses))
                .put("scope","50 finite live metadata edits; retained SQL rows and receipt ciphertext, not a performance or increased-capacity claim")
            File(target.filesDir,"live-retention.json").writeText(report.toString(2))
            println("PENNY_LIVE_RETENTION $report")
        }} finally {dir.deleteRecursively();KeyStore.getInstance("AndroidKeyStore").apply {load(null);deleteEntry(alias)}}
    }
}
