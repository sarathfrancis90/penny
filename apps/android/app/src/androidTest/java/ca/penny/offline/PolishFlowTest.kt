package ca.penny.offline

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.drawable.AdaptiveIconDrawable
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.v2.createAndroidComposeRule
import androidx.test.espresso.IdlingPolicies
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.Assert.*
import java.io.File
import java.util.concurrent.TimeUnit

@RunWith(AndroidJUnit4::class)
class PolishFlowTest {
    @get:Rule val compose=createAndroidComposeRule<MainActivity>()
    private val instrumentation get()=InstrumentationRegistry.getInstrumentation()
    @Before fun setup() {check(instrumentation.targetContext.packageName=="ca.penny.offline.dev.test");IdlingPolicies.setIdlingResourceTimeout(45,TimeUnit.SECONDS)}
    private fun click(text:String) {compose.onNodeWithText(text,useUnmergedTree=true).performClick()}
    private fun selectMonth(value:String) {
        compose.onNodeWithTag("finance-list").performScrollToNode(hasText("Enter a month"));click("Enter a month")
        compose.onNodeWithTag("finance-month").performScrollTo().performTextReplacement(value)
        compose.onNodeWithText("Show month").performScrollTo().performClick()
    }
    private fun capture(name:String) {
        compose.waitForIdle()
        compose.waitUntil(5_000) {
            var hidden=false
            compose.activityRule.scenario.onActivity {hidden=androidx.core.view.ViewCompat.getRootWindowInsets(it.window.decorView)?.isVisible(androidx.core.view.WindowInsetsCompat.Type.ime())!=true}
            hidden
        }
        instrumentation.uiAutomation.waitForIdle(500,5_000)
        val prefix=InstrumentationRegistry.getArguments().getString("pennyVisual") ?: "standard"
        instrumentation.uiAutomation.takeScreenshot().also {bitmap ->
            File(instrumentation.targetContext.filesDir,"p6-$prefix-$name.png").outputStream().use {bitmap.compress(Bitmap.CompressFormat.PNG,100,it)};bitmap.recycle()
        }
    }
    @Test fun accessibleMonthNavigationAndDisplayJourney() {
        compose.waitUntil(15_000) {compose.onAllNodesWithText("Add expense",useUnmergedTree=true).fetchSemanticsNodes().isNotEmpty()}
        capture("overview")
        listOf("Overview","Expenses","Finance","Your vault").forEach {compose.onNodeWithText(it,useUnmergedTree=true).assertIsDisplayed()}
        click("Finance")
        selectMonth("2024-03")
        compose.onNodeWithTag("finance-list").performScrollToIndex(0)
        compose.onNodeWithContentDescription("Previous month").performClick()
        compose.onNodeWithText("2024-02 · CAD").assertExists()
        compose.onNodeWithContentDescription("Next month").performClick()
        compose.onNodeWithText("2024-03 · CAD").assertExists()
        selectMonth("0001-01")
        compose.onNodeWithTag("finance-list").performScrollToIndex(0)
        compose.onNodeWithContentDescription("Previous month").assertIsNotEnabled()
        selectMonth("9999-12")
        compose.onNodeWithTag("finance-list").performScrollToIndex(0)
        compose.onNodeWithContentDescription("Next month").assertIsNotEnabled()
        selectMonth("2026-09")
        compose.onNodeWithTag("finance-list").performScrollToIndex(0)
        capture("finance")
        click("Your vault");capture("vault")
        compose.onNodeWithTag("vault-list").performScrollToNode(hasText("Create encrypted backup"))
        compose.onNodeWithText("Create encrypted backup").assertIsDisplayed()
        click("Expenses")
        var largeText=false
        compose.activityRule.scenario.onActivity {largeText=it.resources.configuration.fontScale>=1.6f}
        if(largeText) compose.onNodeWithTag("vault-list").performScrollToNode(hasText("Add expense"))
        compose.waitUntil(5_000) {compose.onAllNodesWithText("Add expense",useUnmergedTree=true).fetchSemanticsNodes().isNotEmpty()}
        click("Add expense")
        compose.onNodeWithText("Merchant",useUnmergedTree=true).assertExists()
        // Android8 can automatically focus the sheet's first text field.
        // Explicitly dismiss input for this overview of the complete editor.
        androidx.test.espresso.Espresso.closeSoftKeyboard()
        capture("editor")
        // Render the actual packaged launcher icon through the platform, including its mask.
        val context=instrumentation.targetContext
        val icon=context.packageManager.getApplicationIcon(context.packageName)
        assertTrue(icon is AdaptiveIconDrawable)
        val bitmap=Bitmap.createBitmap(256,256,Bitmap.Config.ARGB_8888)
        icon.setBounds(0,0,256,256);icon.draw(Canvas(bitmap))
        File(context.filesDir,"p6-launcher.png").outputStream().use {bitmap.compress(Bitmap.CompressFormat.PNG,100,it)};bitmap.recycle()
    }
}
