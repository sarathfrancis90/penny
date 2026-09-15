package ca.penny.offline

import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.v2.createAndroidComposeRule
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.espresso.IdlingPolicies
import org.junit.Before
import java.util.concurrent.TimeUnit
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class OfflineFlowTest {
    @get:Rule val compose = createAndroidComposeRule<MainActivity>()
    @Before fun boundIdleWait() {
        check(androidx.test.platform.app.InstrumentationRegistry.getInstrumentation().targetContext.packageName == "ca.penny.offline.dev.test") { "Use -PpennyTestSandbox=true" }
        IdlingPolicies.setIdlingResourceTimeout(45, TimeUnit.SECONDS)
    }
    @Test fun addEditRecreateDelete() {
        val merchant = "Offline test ${Wire.id().take(8)}"
        compose.waitUntil(60_000) { compose.onAllNodesWithText("Add expense", useUnmergedTree = true).fetchSemanticsNodes().isNotEmpty() }
        compose.onNodeWithText("Add expense", useUnmergedTree = true).performClick()
        compose.onNodeWithTag("merchant").performTextInput(merchant)
        compose.onNodeWithTag("amount").performTextInput("12.34")
        compose.onNodeWithTag("amount").performImeAction()
        compose.onNodeWithTag("expense-editor").performScrollToNode(hasTestTag("save-expense"))
        compose.onNodeWithTag("save-expense").performClick()
        compose.waitUntil(10_000) { compose.onAllNodesWithText(merchant, useUnmergedTree = true).fetchSemanticsNodes().isNotEmpty() }
        compose.onNodeWithText(merchant, useUnmergedTree = true).performClick()
        compose.onNodeWithTag("amount").performTextReplacement("23.45")
        compose.onNodeWithTag("amount").performImeAction()
        compose.onNodeWithTag("expense-editor").performScrollToNode(hasTestTag("save-expense"))
        compose.onNodeWithTag("save-expense").performClick()
        compose.waitUntil(10_000) { compose.onAllNodesWithText("$23.45", useUnmergedTree = true).fetchSemanticsNodes().isNotEmpty() }
        compose.activityRule.scenario.recreate()
        compose.waitUntil(15_000) { compose.onAllNodesWithText(merchant, useUnmergedTree = true).fetchSemanticsNodes().isNotEmpty() }
        compose.onNodeWithText(merchant, useUnmergedTree = true).performClick()
        compose.onNodeWithTag("expense-editor").performScrollToNode(hasText("Delete expense"))
        compose.onNodeWithText("Delete expense", useUnmergedTree = true).performClick()
        compose.onAllNodesWithText("Delete expense", useUnmergedTree = true).onLast().performClick()
        compose.waitUntil(10_000) { compose.onAllNodesWithText(merchant, useUnmergedTree = true).fetchSemanticsNodes().isEmpty() }
    }
}
