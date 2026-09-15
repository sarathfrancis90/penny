package ca.penny.offline

import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.v2.createAndroidComposeRule
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assume.assumeTrue
import org.junit.Rule
import org.junit.Before
import androidx.test.espresso.IdlingPolicies
import java.util.concurrent.TimeUnit
import org.junit.Test
import org.junit.runner.RunWith

/** Invoked in two separate instrumentation processes by verify-process-persistence.sh. */
@RunWith(AndroidJUnit4::class)
class ProcessPersistenceTest {
    @get:Rule val compose = createAndroidComposeRule<MainActivity>()
    @Before fun boundIdleWait() { IdlingPolicies.setIdlingResourceTimeout(45, TimeUnit.SECONDS) }
    private fun marker(): String {
        val args = InstrumentationRegistry.getArguments()
        assumeTrue("Run using the external process persistence script", args.containsKey("pennyMarker"))
        check(InstrumentationRegistry.getInstrumentation().targetContext.packageName == "ca.penny.offline.dev.test")
        return checkNotNull(args.getString("pennyMarker"))
    }
    @Test fun createBeforeForceStop() {
        val merchant = marker()
        compose.waitUntil(15_000) { compose.onAllNodesWithText("Add expense", useUnmergedTree = true).fetchSemanticsNodes().isNotEmpty() }
        compose.onNodeWithText("Add expense", useUnmergedTree = true).performClick()
        compose.onNodeWithTag("merchant").performTextInput(merchant)
        compose.onNodeWithTag("amount").performTextInput("34.56")
        compose.onNodeWithTag("expense-editor").performScrollToNode(hasTestTag("save-expense"))
        compose.onNodeWithTag("save-expense").performClick()
        compose.waitUntil(10_000) { compose.onAllNodesWithText(merchant, useUnmergedTree = true).fetchSemanticsNodes().isNotEmpty() }
        compose.onNodeWithText(merchant, useUnmergedTree = true).assertIsDisplayed()
    }
    @Test fun verifyAfterForceStopAndDelete() {
        val merchant = marker()
        compose.waitUntil(15_000) { compose.onAllNodesWithText(merchant, useUnmergedTree = true).fetchSemanticsNodes().isNotEmpty() }
        compose.onNodeWithText(merchant, useUnmergedTree = true).performClick()
        compose.onNodeWithTag("amount").assertTextContains("34.56")
        compose.onNodeWithTag("expense-editor").performScrollToNode(hasText("Delete expense"))
        compose.onNodeWithText("Delete expense", useUnmergedTree = true).performClick()
        compose.onAllNodesWithText("Delete expense", useUnmergedTree = true).onLast().performClick()
        compose.waitUntil(10_000) { compose.onAllNodesWithText(merchant, useUnmergedTree = true).fetchSemanticsNodes().isEmpty() }
    }
}
