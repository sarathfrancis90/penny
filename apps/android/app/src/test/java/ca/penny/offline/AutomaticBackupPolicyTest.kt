package ca.penny.offline

import org.junit.Assert.*
import org.junit.Test

class AutomaticBackupPolicyTest {
    @Test fun defaultOffLocalUpgradeAndNarrowRetryClassification() {
        val settings=CloudSettings();assertFalse(settings.automaticEnabled)
        val legacy=settings.json().apply {remove("automaticEnabled");remove("scheduleId");remove("automaticStatus")}
        assertFalse(CloudSettings.decode(legacy).automaticEnabled)
        assertTrue(AutomaticBackup.transient(java.io.IOException("connection")))
        assertTrue(AutomaticBackup.transient(DriveFailure("transient")))
        for(error in listOf(DriveFailure("quota"),DriveFailure("credentials_expired"),DriveFailure("permission_or_quota"),javax.net.ssl.SSLException("trust"),IllegalStateException("account_changed"))) assertFalse(AutomaticBackup.transient(error))
    }
    @Test fun leasePreemptionAndStaleCompletionNeverReleaseNewOwner() {
        CloudCoordinator.cancel();val old=CloudCoordinator.background()!!
        assertNull(CloudCoordinator.background());val foreground=CloudCoordinator.foreground()
        assertTrue(runCatching {CloudCoordinator.check(old)}.isFailure)
        CloudCoordinator.finish(old);assertEquals("foreground",CloudCoordinator.activity.value.kind)
        assertNull(CloudCoordinator.background());CloudCoordinator.finish(foreground)
        val next=CloudCoordinator.background()!!;assertTrue(next>foreground);CloudCoordinator.cancel()
        assertTrue(runCatching {CloudCoordinator.check(next)}.isFailure)
    }
}
