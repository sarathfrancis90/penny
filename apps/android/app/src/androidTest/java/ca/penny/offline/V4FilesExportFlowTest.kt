package ca.penny.offline

import android.os.SystemClock
import android.view.accessibility.AccessibilityNodeInfo
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.v2.createAndroidComposeRule
import androidx.lifecycle.ViewModelProvider
import androidx.test.platform.app.InstrumentationRegistry
import kotlinx.coroutines.*
import java.io.File
import java.util.concurrent.atomic.AtomicReference
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test

class V4FilesExportFlowTest {
    @get:Rule val compose=createAndroidComposeRule<MainActivity>()
    @Test fun dismissDuringConfirmationCannotLaunchLatePicker() {
        val ins=InstrumentationRegistry.getInstrumentation();val key="pny1-"+"07".repeat(32)
        assertEquals("ca.penny.offline.dev.test",ins.targetContext.packageName);RecoveryKeyStore(ins.targetContext).confirm(key,key)
        lateinit var model:PennyViewModel;compose.activityRule.scenario.onActivity {model=ViewModelProvider(it)[PennyViewModel::class.java]}
        compose.waitUntil(15000) {model.state.value.ready && !model.state.value.busy}
        compose.onNodeWithText("Your vault").performClick();compose.onNodeWithTag("vault-list").performScrollToNode(hasText("Create encrypted backup"));compose.onNodeWithText("Create encrypted backup").performClick()
        compose.waitUntil(15000) {compose.onAllNodesWithText("I saved my key").fetchSemanticsNodes().isNotEmpty()}
        compose.onNodeWithText("I saved my key").performClick();compose.onNodeWithTag("recovery-reentry").performTextInput(key)
        val entered=java.util.concurrent.CountDownLatch(1);val release=java.util.concurrent.CountDownLatch(1)
        val blocker=Thread {synchronized(CloudCoordinator.lock) {entered.countDown();check(release.await(15,java.util.concurrent.TimeUnit.SECONDS))}}.apply {start()}
        try {assertTrue(entered.await(5,java.util.concurrent.TimeUnit.SECONDS));compose.onNodeWithText("Verify and choose file").performClick()
            compose.waitUntil(5000) {model.state.value.busy};compose.onNodeWithText("Cancel").performClick()
        } finally {release.countDown();blocker.join(15000)}
        compose.waitUntil(15000) {!model.state.value.busy}
        compose.onNodeWithText("Create encrypted backup").assertIsDisplayed();compose.onNodeWithTag("recovery-reentry").assertDoesNotExist()
        compose.waitForIdle()
        var activePackage:String?=null
        compose.waitUntil(10_000) {
            activePackage=ins.uiAutomation.rootInActiveWindow?.packageName?.toString()
            activePackage!=null // A missing accessibility window proves neither app nor picker.
        }
        assertEquals("The settled foreground window must be Penny, never a late picker",ins.targetContext.packageName,activePackage)
    }
    @Test fun recoveryConfirmationCreateDocumentAndVerifiedExportUseActualPicker() {
        val ins=InstrumentationRegistry.getInstrumentation();val context=ins.targetContext
        assertEquals("ca.penny.offline.dev.test",context.packageName)
        val key="pny1-"+"07".repeat(32);RecoveryKeyStore(context).confirm(key,key)
        lateinit var model:PennyViewModel;compose.activityRule.scenario.onActivity {model=ViewModelProvider(it)[PennyViewModel::class.java]}
        compose.waitUntil(15000) {model.state.value.ready && !model.state.value.busy}
        val success=AtomicReference<String?>();val scope=CoroutineScope(Dispatchers.Default)
        val observer=scope.launch {model.state.collect {s->s.message?.let {if(it.startsWith("Encrypted file exported") || it.startsWith("Backup export")) success.set(it)}}}
        fun find(node:AccessibilityNodeInfo?,predicate:(AccessibilityNodeInfo)->Boolean):AccessibilityNodeInfo? {
            if(node==null) return null;if(predicate(node)) return node
            for(i in 0 until node.childCount) find(node.getChild(i),predicate)?.let {return it};return null
        }
        fun waitNode(predicate:(AccessibilityNodeInfo)->Boolean):AccessibilityNodeInfo {
            val end=SystemClock.elapsedRealtime()+15000
            while(SystemClock.elapsedRealtime()<end) {find(ins.uiAutomation.rootInActiveWindow,predicate)?.let {return it};SystemClock.sleep(100)}
            error("Required DocumentsUI control unavailable")
        }
        try {
            compose.onNodeWithText("Your vault").performClick()
            compose.onNodeWithTag("vault-list").performScrollToNode(hasText("Create encrypted backup"));compose.onNodeWithText("Create encrypted backup").performClick()
            compose.waitUntil(15000) {compose.onAllNodesWithText("I saved my key").fetchSemanticsNodes().isNotEmpty()}
            compose.onNodeWithText("I saved my key").performClick()
            compose.onNodeWithTag("recovery-reentry").performTextInput(key)
            compose.onNodeWithText("Verify and choose file").performClick()
            compose.waitUntil(15000) {!model.state.value.busy}
            compose.waitForIdle() // The keyed launcher is installed by recomposition.
            val name=waitNode {it.className?.toString()=="android.widget.EditText" && it.text?.toString()?.startsWith("Penny-")==true}.text.toString()
            assertTrue(name.endsWith(".pennybackup"));assertTrue(name.length>50)
            val evidence=File(context.filesDir,"files-export-ui").apply {mkdirs()};File(evidence,"filename.txt").writeText(name)
            ins.uiAutomation.takeScreenshot()?.let {bitmap->File(evidence,"picker.png").outputStream().use {bitmap.compress(android.graphics.Bitmap.CompressFormat.PNG,100,it)};bitmap.recycle()}
                ?: File(evidence,"screenshot-unavailable.txt").writeText("UiAutomation returned null; secure window flags retained.")
            val save=waitNode {it.isEnabled && it.isClickable && it.text?.toString()?.equals("Save",ignoreCase=true)==true}
            assertTrue(save.performAction(AccessibilityNodeInfo.ACTION_CLICK))
            val end=SystemClock.elapsedRealtime()+30000
            while(success.get()==null && SystemClock.elapsedRealtime()<end) SystemClock.sleep(100)
            assertTrue(success.get(),success.get()?.startsWith("Encrypted file exported and read back successfully.")==true)
            File(evidence,"result.txt").writeText(checkNotNull(success.get()))
        } finally {observer.cancel();scope.cancel()}
    }
}
