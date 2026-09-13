package ca.penny.offline

import android.graphics.Bitmap
import android.net.Uri
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.v2.createAndroidComposeRule
import androidx.lifecycle.ViewModelProvider
import androidx.test.espresso.IdlingPolicies
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File
import java.util.concurrent.TimeUnit

@RunWith(AndroidJUnit4::class)
class ReceiptFlowTest {
    @get:Rule val compose = createAndroidComposeRule<MainActivity>()
    @Before fun boundIdleWait() { IdlingPolicies.setIdlingResourceTimeout(45, TimeUnit.SECONDS) }
    @Test fun unreadableTextRetainsImageForManualEntryViewAndDelete() {
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        check(instrumentation.targetContext.packageName == "ca.penny.offline.dev.test")
        val file = File(instrumentation.targetContext.cacheDir, "receipt-ui-${Wire.id()}.png")
        file.writeBytes(instrumentation.context.assets.open("receipt.png").use { it.readBytes() })
        val merchant = "Receipt-ui-${Wire.id().take(8)}"
        try {
            compose.waitUntil(15_000) { compose.onAllNodesWithText("Add expense", useUnmergedTree = true).fetchSemanticsNodes().isNotEmpty() }
            // Feed the exact URI boundary used by the picker. This verifies the
            // native capture/save/view journey, not the external provider UI.
            compose.activityRule.scenario.onActivity { ViewModelProvider(it)[PennyViewModel::class.java].scan(Uri.fromFile(file)) }
            compose.waitUntil(35_000) { compose.onAllNodesWithTag("merchant").fetchSemanticsNodes().isNotEmpty() }
            compose.onNodeWithTag("merchant").performTextInput(merchant)
            compose.onNodeWithTag("amount").performTextInput("9.87")
            compose.onNodeWithTag("expense-editor").performScrollToNode(hasTestTag("save-expense"))
            compose.onNodeWithTag("save-expense").performClick()
            compose.waitUntil(10_000) { compose.onAllNodesWithText(merchant, useUnmergedTree = true).fetchSemanticsNodes().isNotEmpty() }
            compose.activityRule.scenario.recreate()
            compose.waitUntil(15_000) { compose.onAllNodesWithText(merchant, useUnmergedTree = true).fetchSemanticsNodes().isNotEmpty() }
            compose.onNodeWithText(merchant, useUnmergedTree = true).performClick()
            compose.onNodeWithTag("expense-editor").performScrollToNode(hasText("View receipt"))
            compose.onNodeWithText("View receipt", useUnmergedTree = true).performClick()
            compose.onNodeWithContentDescription("Receipt image").assertIsDisplayed()
            val screenshot = instrumentation.uiAutomation.takeScreenshot()
            File(instrumentation.targetContext.filesDir, "receipt-viewer-test.png").outputStream().use { screenshot.compress(Bitmap.CompressFormat.PNG, 100, it) }
            screenshot.recycle()
            compose.onNodeWithText("Done", useUnmergedTree = true).performClick()
            compose.onNodeWithText("Remove receipt", useUnmergedTree = true).performClick()
            compose.onAllNodesWithText("Remove receipt", useUnmergedTree = true).onLast().performClick()
            compose.waitUntil(10_000) { compose.onAllNodesWithText("View receipt", useUnmergedTree = true).fetchSemanticsNodes().isEmpty() }
            compose.onNodeWithTag("expense-editor").performScrollToNode(hasText("Delete expense"))
            compose.onNodeWithText("Delete expense", useUnmergedTree = true).performClick()
            compose.onAllNodesWithText("Delete expense", useUnmergedTree = true).onLast().performClick()
            compose.waitUntil(10_000) { compose.onAllNodesWithText(merchant, useUnmergedTree = true).fetchSemanticsNodes().isEmpty() }
        } finally { file.delete() }
    }
}
