package ca.penny.offline

import android.accessibilityservice.AccessibilityService
import android.content.pm.PackageManager
import android.view.accessibility.AccessibilityNodeInfo
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.v2.createAndroidComposeRule
import androidx.test.espresso.IdlingPolicies
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.*
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import java.util.concurrent.TimeUnit

@org.junit.FixMethodOrder(org.junit.runners.MethodSorters.NAME_ASCENDING)
class CaptureFlowTest {
    @get:Rule val compose=createAndroidComposeRule<MainActivity>()
    @Before fun bounded() { IdlingPolicies.setIdlingResourceTimeout(45,TimeUnit.SECONDS);check(InstrumentationRegistry.getInstrumentation().targetContext.packageName=="ca.penny.offline.dev.test") }
    @Test fun actualCameraDenialKeepsManualExpenseAvailable() {
        val instrumentation=InstrumentationRegistry.getInstrumentation()
        assertEquals(PackageManager.PERMISSION_DENIED,instrumentation.targetContext.checkSelfPermission(android.Manifest.permission.CAMERA))
        compose.waitUntil(15_000) { compose.onAllNodesWithText("Add expense",useUnmergedTree=true).fetchSemanticsNodes().isNotEmpty() }
        compose.onNodeWithText("Add expense",useUnmergedTree=true).performClick()
        compose.onNodeWithText("Français · Canada",useUnmergedTree=true).performClick()
        compose.onNodeWithTag("expense-editor").performScrollToNode(hasText("Photograph receipt"))
        compose.onNodeWithText("Photograph receipt",useUnmergedTree=true).performClick()
        compose.onNodeWithText("Allow camera",useUnmergedTree=true).performClick()
        val end=System.nanoTime()+10_000_000_000
        var denied=false
        while(!denied && System.nanoTime()<end) {
            val root=instrumentation.uiAutomation.rootInActiveWindow
            if(root != null) denied=clickDeny(root)
            if(!denied) Thread.sleep(50)
        }
        assertTrue("Actual Android permission denial button was found",denied)
        compose.onNodeWithText("Camera permission denied. You can still attach a photo or enter the expense manually.").assertIsDisplayed()
        compose.onNodeWithText("Use manual entry",useUnmergedTree=true).performClick()
        val merchant="Denied-camera-${Wire.id().take(8)}"
        compose.onNodeWithTag("expense-editor").performScrollToNode(hasTestTag("merchant"))
        compose.onNodeWithTag("merchant").performTextInput(merchant)
        compose.onNodeWithTag("amount").performTextInput("7.89")
        compose.onNodeWithTag("expense-editor").performScrollToNode(hasTestTag("save-expense"))
        compose.onNodeWithTag("save-expense").performClick()
        lateinit var vm:PennyViewModel
        compose.activityRule.scenario.onActivity {vm=androidx.lifecycle.ViewModelProvider(it)[PennyViewModel::class.java]}
        // The merchant still matches the closing editor until the durable save
        // finishes. Wait for its dismissal and the covering save snackbar first.
        compose.waitUntil(10_000) {
            !vm.state.value.busy && vm.state.value.message==null &&
                compose.onAllNodesWithTag("expense-editor").fetchSemanticsNodes().isEmpty() &&
                compose.onAllNodesWithText(merchant,useUnmergedTree=true).fetchSemanticsNodes().isNotEmpty()
        }
        compose.onNodeWithText(merchant,useUnmergedTree=true).performClick()
        compose.waitUntil(10_000) {compose.onAllNodesWithTag("amount").fetchSemanticsNodes().isNotEmpty()}
        compose.onNodeWithTag("amount").assertTextContains("7.89")
        compose.onNodeWithTag("expense-editor").performScrollToNode(hasText("Delete expense"))
        compose.onNodeWithText("Delete expense",useUnmergedTree=true).performClick()
        compose.onAllNodesWithText("Delete expense",useUnmergedTree=true).onLast().performClick()
    }
    @Test fun recoveryReentryMismatchRefusesExportAndPickerCancellationKeepsVault() {
        val instrumentation=InstrumentationRegistry.getInstrumentation()
        val key=Backup.recoveryKey(); RecoveryKeyStore(instrumentation.targetContext).confirm(key,key)
        compose.onNodeWithText("Your vault",useUnmergedTree=true).performClick()
        compose.onNodeWithTag("vault-list").performScrollToNode(hasText("Create encrypted backup"))
        compose.onNodeWithText("Create encrypted backup",useUnmergedTree=true).performScrollTo().performClick()
        compose.waitUntil(10_000) { compose.onAllNodesWithText("I saved my key",useUnmergedTree=true).fetchSemanticsNodes().isNotEmpty() }
        compose.onNodeWithText("Copy recovery key",useUnmergedTree=true).performClick()
        instrumentation.runOnMainSync {
            val clipboard=instrumentation.targetContext.getSystemService(android.content.Context.CLIPBOARD_SERVICE) as android.content.ClipboardManager
            assertTrue(clipboard.primaryClipDescription?.extras?.getBoolean("android.content.extra.IS_SENSITIVE")==true)
        }
        compose.onNodeWithText("I saved my key",useUnmergedTree=true).performClick()
        compose.onNodeWithTag("recovery-reentry").performTextInput(Backup.recoveryKey())
        compose.onNodeWithText("Verify and choose file",useUnmergedTree=true).performClick()
        compose.waitUntil(10_000) { compose.onAllNodesWithText("Recovery keys do not match. Re-enter the key you saved.").fetchSemanticsNodes().isNotEmpty() }
        assertEquals(key,RecoveryKeyStore(instrumentation.targetContext).load())
        compose.onNodeWithTag("recovery-reentry").performTextReplacement(key)
        compose.onNodeWithText("Verify and choose file",useUnmergedTree=true).performClick()
        val end=System.nanoTime()+10_000_000_000
        while(instrumentation.uiAutomation.rootInActiveWindow?.packageName?.toString()?.endsWith(".documentsui")!=true && System.nanoTime()<end) Thread.sleep(50)
        assertTrue("External document picker is visible",instrumentation.uiAutomation.rootInActiveWindow?.packageName?.toString()?.endsWith(".documentsui")==true)
        // The picker may first consume Back to dismiss its filename keyboard.
        repeat(3) {
            if(instrumentation.uiAutomation.rootInActiveWindow?.packageName?.toString()?.endsWith(".documentsui")==true) {
                instrumentation.uiAutomation.performGlobalAction(AccessibilityService.GLOBAL_ACTION_BACK)
                Thread.sleep(400)
            }
        }
        compose.waitUntil(10_000) { runCatching { compose.onAllNodesWithText("Create encrypted backup",useUnmergedTree=true).fetchSemanticsNodes().isNotEmpty() }.getOrDefault(false) }
        compose.onNodeWithTag("recovery-reentry").assertDoesNotExist()
        assertTrue(java.io.File(instrumentation.targetContext.noBackupFilesDir,"encrypted-exports").listFiles().orEmpty().isEmpty())
    }
    @Test fun zCameraCallbackPreparesInMemoryAndSavesReceipt() {
        val instrumentation=InstrumentationRegistry.getInstrumentation()
        // Denial is exercised separately. Configure this sandbox camera-success case
        // independently of Android's retained "don't ask again" permission history.
        if(android.os.Build.VERSION.SDK_INT>=28) instrumentation.uiAutomation.grantRuntimePermission(instrumentation.targetContext.packageName,android.Manifest.permission.CAMERA)
        compose.waitUntil(15_000) { compose.onAllNodesWithText("Add expense",useUnmergedTree=true).fetchSemanticsNodes().isNotEmpty() }
        compose.onNodeWithText("Add expense",useUnmergedTree=true).performClick()
        compose.onNodeWithTag("expense-editor").performScrollToNode(hasText("Photograph receipt"))
        compose.onNodeWithText("Photograph receipt",useUnmergedTree=true).performClick()
        if(android.os.Build.VERSION.SDK_INT<28) {
            compose.onNodeWithText("Allow camera",useUnmergedTree=true).performClick()
            fun allow(node:AccessibilityNodeInfo?):Boolean {
                if(node==null) return false
                if(node.viewIdResourceName?.endsWith(":id/permission_allow_button")==true) return node.performAction(AccessibilityNodeInfo.ACTION_CLICK)
                for(i in 0 until node.childCount) if(allow(node.getChild(i))) return true
                return false
            }
            val end=System.nanoTime()+10_000_000_000;var allowed=false
            while(!allowed && System.nanoTime()<end) {allowed=allow(instrumentation.uiAutomation.rootInActiveWindow);if(!allowed) Thread.sleep(50)}
            assertTrue("Actual Android8 permission Allow button",allowed)
        }
        compose.waitUntil(15_000) { compose.onAllNodes(hasText("Take receipt photo") and isEnabled()).fetchSemanticsNodes().isNotEmpty() }
        // Wait on the merged Button: the unmerged Text child lacks its parent's Disabled semantics.
        compose.onNode(hasText("Take receipt photo") and isEnabled()).performClick()
        lateinit var captureVm:PennyViewModel
        compose.activityRule.scenario.onActivity { captureVm=androidx.lifecycle.ViewModelProvider(it)[PennyViewModel::class.java] }
        compose.waitUntil(35_000) { captureVm.state.value.receiptBytes!=null && !captureVm.state.value.busy }
        compose.onNodeWithTag("expense-editor").performScrollToNode(hasContentDescription("Optimized receipt copy preview"))
        compose.onNodeWithContentDescription("Optimized receipt copy preview").assertIsDisplayed()
        val screenshot=instrumentation.uiAutomation.takeScreenshot()
        java.io.File(instrumentation.targetContext.filesDir,"camera-optimized-preview.png").outputStream().use { screenshot.compress(android.graphics.Bitmap.CompressFormat.PNG,100,it) };screenshot.recycle()
        val merchant="Camera-memory-${Wire.id().take(8)}"
        compose.onNodeWithTag("expense-editor").performScrollToNode(hasTestTag("merchant"))
        compose.onNodeWithTag("merchant").performTextReplacement(merchant)
        compose.onNodeWithTag("amount").performTextReplacement("4.56")
        compose.onNodeWithTag("expense-editor").performScrollToNode(hasTestTag("save-expense"))
        compose.waitUntil(35_000) { compose.onAllNodes(hasTestTag("save-expense") and isEnabled()).fetchSemanticsNodes().isNotEmpty() }
        compose.onNodeWithTag("save-expense").performClick()
        compose.waitUntil(10_000) { compose.onAllNodesWithText(merchant,useUnmergedTree=true).fetchSemanticsNodes().isNotEmpty() }
        VaultStore(instrumentation.targetContext).use { store ->
            val expense=store.all().single { it.merchant==merchant }
            val receipt=store.attachments().single { it.expenseId==expense.id }
            assertEquals("image/jpeg",receipt.mediaType); ReceiptImage.decode(receipt.bytes()).recycle()
            val key=Backup.recoveryKey(); assertArrayEquals(receipt.bytes(),Backup.decrypt(Backup.encrypt(store.snapshot(),key),key).attachments.single { it.id==receipt.id }.bytes())
            store.delete(expense.id)
        }
    }
    private fun clickDeny(node: AccessibilityNodeInfo): Boolean {
        if(node.viewIdResourceName?.endsWith(":id/permission_deny_button")==true || node.text?.toString() in listOf("Don't allow","Don’t allow")) return node.performAction(AccessibilityNodeInfo.ACTION_CLICK)
        for(i in 0 until node.childCount) { val child=node.getChild(i) ?: continue; if(clickDeny(child)) return true }
        return false
    }
}
