package ca.penny.offline

import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.v2.createAndroidComposeRule
import androidx.test.espresso.IdlingPolicies
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import java.util.concurrent.TimeUnit
import java.io.File
import android.graphics.Bitmap

@RunWith(AndroidJUnit4::class)
class FinanceFlowTest {
    @get:Rule val compose=createAndroidComposeRule<MainActivity>()
    @Before fun setup(){check(InstrumentationRegistry.getInstrumentation().targetContext.packageName=="ca.penny.offline.dev.test");IdlingPolicies.setIdlingResourceTimeout(45,TimeUnit.SECONDS)}
    private fun click(text:String){compose.onNodeWithText(text,useUnmergedTree=true).performClick()}
    private fun section(text:String){compose.onNodeWithTag("finance-list").performScrollToIndex(0);compose.onNodeWithText(text,useUnmergedTree=true).performScrollTo().performClick()}
    private fun field(key:String,value:String){compose.onNodeWithTag("finance-$key").performScrollTo().performTextReplacement(value)}
    private fun messagesFinished() {
        lateinit var vm:PennyViewModel
        compose.activityRule.scenario.onActivity {vm=androidx.lifecycle.ViewModelProvider(it)[PennyViewModel::class.java]}
        compose.waitUntil(10_000) {!vm.state.value.busy && vm.state.value.message==null}
    }
    private fun save(){compose.onNodeWithTag("save-finance").performClick();compose.waitUntil(10_000){compose.onAllNodesWithTag("finance-editor").fetchSemanticsNodes().isEmpty()};messagesFinished()}
    private fun listClick(text:String){compose.onNodeWithTag("finance-list").performScrollToNode(hasText(text));compose.onNodeWithText(text,useUnmergedTree=true).performClick()}
    private fun cardClick(title:String,text:String) {
        val tag="finance-card-$title"
        compose.onNodeWithTag("finance-list").performScrollToNode(hasTestTag(tag) and hasAnyDescendant(hasText(text)))
        compose.onNode(hasText(text) and hasAnyAncestor(hasTestTag(tag)),useUnmergedTree=true).performClick()
    }
    @Test fun budgetsIncomeSavingsRecurringAndHistoricalReportPersist() {
        val suffix=Wire.id().take(8);val month="${1000+suffix.take(3).toInt(16)%800}-02";val date="$month-12"
        val source="Income $suffix";val goal="Savings $suffix";val merchant="Recurring $suffix"
        compose.waitUntil(15_000){compose.onAllNodesWithText("Add expense",useUnmergedTree=true).fetchSemanticsNodes().isNotEmpty()}
        compose.onNodeWithText("Finance",useUnmergedTree=true).performClick()
        click("Enter a month")
        field("month",month);click("Show month")
        section("Budgets");listClick("Add budget");field("limitMinor","100.00");save()
        compose.onNodeWithText("Spent $0.00 of $100.00",useUnmergedTree=true).assertExists()
        section("Income");listClick("Add income source");field("name",source);field("grossMinor","1000.00");save()
        cardClick(source,"Record received");field("amountMinor","800.00");field("receivedDate",date);save()
        section("Savings");listClick("Add savings goal");field("name",goal);field("targetMinor","2000.00");save()
        cardClick(goal,"Add contribution");field("amountMinor","50.00");field("date",date);save()
        section("Recurring");listClick("Add recurring expense");field("merchant",merchant);field("amountMinor","12.00");field("schedule.startDate",date);save()
        listClick("Review expense · $merchant · $date");click("Record expense")
        compose.waitUntil(10_000){compose.onAllNodesWithText("Record this expense?",useUnmergedTree=true).fetchSemanticsNodes().isEmpty()}
        messagesFinished()
        section("Reports")
        compose.onNodeWithText("Received income $800.00",useUnmergedTree=true).assertExists()
        compose.onNodeWithText("Expenses $12.00",useUnmergedTree=true).assertExists()
        compose.onNodeWithText("Net cash $788.00",useUnmergedTree=true).assertExists()
        compose.onNodeWithText("Savings allocated $50.00",useUnmergedTree=true).assertExists()
        compose.activityRule.scenario.recreate()
        compose.waitUntil(15_000){compose.onAllNodesWithText("Received income $800.00",useUnmergedTree=true).fetchSemanticsNodes().isNotEmpty()}
        val instrumentation=InstrumentationRegistry.getInstrumentation();val image=instrumentation.uiAutomation.takeScreenshot()
        File(instrumentation.targetContext.filesDir,"finance-report-test.png").outputStream().use{image.compress(Bitmap.CompressFormat.PNG,100,it)};image.recycle()
        section("Budgets");listClick("Edit budget");field("limitMinor","150.00");save()
        compose.onNodeWithText("Spent $12.00 of $150.00",useUnmergedTree=true).assertExists()
        section("Income");cardClick(source,"Edit source");compose.onNodeWithTag("finance-isActive").performScrollTo().performClick();save()
        // Reference records are deactivated; cash history remains unchanged.
        section("Reports");compose.onNodeWithText("Received income $800.00",useUnmergedTree=true).assertExists()
        compose.onNodeWithTag("finance-list").performScrollToNode(hasText("Export all expenses as CSV"))
        compose.waitUntil(10_000) {compose.onAllNodes(hasText("Export all expenses as CSV") and isEnabled()).fetchSemanticsNodes().isNotEmpty()}
        // Native snackbar temporarily covers this bottom action on short phones.
        compose.waitUntil(10_000) {compose.onAllNodesWithText("Saved on this device",useUnmergedTree=true).fetchSemanticsNodes().isEmpty()}
        instrumentation.uiAutomation.takeScreenshot().also {bitmap->File(instrumentation.targetContext.filesDir,"finance-csv-before.png").outputStream().use {bitmap.compress(Bitmap.CompressFormat.PNG,100,it)};bitmap.recycle()}
        compose.onNode(hasText("Export all expenses as CSV") and isEnabled()).performClick()
        compose.waitUntil(10_000) {compose.onAllNodesWithText("Export a readable CSV?",useUnmergedTree=true).fetchSemanticsNodes().isNotEmpty()}
        compose.onNodeWithText("Export a readable CSV?",useUnmergedTree=true).assertExists()
        click("Cancel")
        val csv=File(instrumentation.targetContext.cacheDir,"finance-csv-$suffix.csv")
        try {
            compose.activityRule.scenario.onActivity { androidx.lifecycle.ViewModelProvider(it)[PennyViewModel::class.java].exportCsv(android.net.Uri.fromFile(csv)) }
            compose.waitUntil(10_000) { csv.exists() && csv.length()>0 }
            val text=csv.readText();org.junit.Assert.assertTrue(text.contains(merchant));org.junit.Assert.assertTrue(text.contains("\"12.00\",\"CAD\""))
        } finally { csv.delete() }
    }
}
