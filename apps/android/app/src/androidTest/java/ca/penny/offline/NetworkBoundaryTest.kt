package ca.penny.offline

import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.*
import org.junit.Assume.assumeTrue
import org.junit.Test
import java.net.URL
import javax.net.ssl.HttpsURLConnection
import javax.net.ssl.SSLException

/** Opt-in network probe only: no credentials, financial data, SDK prompts or personal content. */
class NetworkBoundaryTest {
    @Test fun platformTlsDefaultDenyAndExactDriveHost() {
        assumeTrue(InstrumentationRegistry.getArguments().getString("pennyNetworkProbe")=="true")
        val drive=URL("https://www.googleapis.com/drive/v3/about?fields=user(permissionId)").openConnection() as HttpsURLConnection
        try {drive.connectTimeout=15000;drive.readTimeout=15000;drive.instanceFollowRedirects=false;val status=drive.responseCode;assertTrue(status in 400..499);println("PLATFORM_TLS_DRIVE_ALLOWED_HTTP_$status (no authorization header)")} finally {drive.disconnect()}
        val telemetry=URL("https://firebaselogging-pa.googleapis.com/").openConnection() as HttpsURLConnection
        try {
            telemetry.connectTimeout=15000;telemetry.readTimeout=15000;telemetry.instanceFollowRedirects=false
            val error=runCatching {telemetry.responseCode}.exceptionOrNull()
            assertTrue("Expected platform TLS trust rejection before HTTP, got ${error?.javaClass?.simpleName}",error is SSLException)
            println("PLATFORM_TLS_TELEMETRY_DENIED_BEFORE_HTTP")
        } finally {telemetry.disconnect()}
    }
}
