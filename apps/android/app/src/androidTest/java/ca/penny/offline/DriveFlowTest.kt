package ca.penny.offline

import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Rule
import org.junit.Test
import org.junit.Assert.*
import java.io.File

class DriveFlowTest {
    @get:Rule val compose=createAndroidComposeRule<MainActivity>()
    @Test fun unconfiguredDriveIsDisabledAndManualCoreRemainsAvailable() {
        assertEquals("ca.penny.offline.dev.test",compose.activity.packageName)
        assertFalse(DriveConfiguration.available(compose.activity))
        compose.onNodeWithText("Your vault").performClick()
        compose.onNodeWithTag("vault-list").performScrollToNode(hasText("Enable Drive backup"))
        compose.onNodeWithText("Enable Drive backup").assertIsNotEnabled()
        compose.onNodeWithTag("vault-list").performScrollToNode(hasText("Find backups in Drive"))
        compose.onNodeWithText("Find backups in Drive").assertIsNotEnabled()
        compose.onNodeWithTag("vault-list").performScrollToNode(hasText("Create encrypted backup"))
        compose.onNodeWithText("Create encrypted backup").assertIsEnabled()
        compose.onNodeWithText("Restore a backup").assertIsEnabled()
        compose.onNodeWithTag("vault-list").performScrollToNode(hasText("Private Google Drive backup"))
        InstrumentationRegistry.getInstrumentation().uiAutomation.takeScreenshot().let {bitmap ->
            File(compose.activity.filesDir,"drive-default-disabled.png").outputStream().use {bitmap.compress(android.graphics.Bitmap.CompressFormat.PNG,100,it)};bitmap.recycle()
        }
    }
}
