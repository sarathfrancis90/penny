package ca.penny.offline

import kotlinx.coroutines.runBlocking
import org.junit.Assert.*
import org.junit.Test
import java.net.URL
import javax.net.ssl.HttpsURLConnection
import java.io.ByteArrayOutputStream

class DriveTransportTest {
    private class Connection(url: URL,val status: Int=200,val bytes: ByteArray=byteArrayOf(),val location: String?=null): HttpsURLConnection(url) {
        val output=ByteArrayOutputStream()
        override fun connect() {}
        override fun disconnect() {}
        override fun usingProxy()=false
        override fun getCipherSuite()="test"
        override fun getLocalCertificates(): Array<java.security.cert.Certificate>?=null
        override fun getServerCertificates(): Array<java.security.cert.Certificate> = emptyArray()
        override fun getResponseCode()=status
        override fun getInputStream()=bytes.inputStream()
        override fun getOutputStream()=output
        override fun getContentLengthLong()=bytes.size.toLong()
        override fun getHeaderField(name: String?): String?=if(name=="Location") location else null
    }
    @Test fun fullCapacityResumableCreateOnlyUsesExactFixedSession() = runBlocking {
        val name="snapshot-${Wire.id()}.pennybackup";val body=ByteArray(6*1024*1024) {7};val seen=mutableListOf<Connection>()
        val transport=DriveTransport("synthetic",{}, {url->Connection(url,bytes=if(seen.isEmpty()) byteArrayOf() else "{\"id\":\"opaque\",\"name\":\"$name\"}".toByteArray(),location=if(seen.isEmpty()) "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&upload_id=synthetic" else null).also(seen::add)})
        assertEquals(name,transport.upload(name,body).name);assertEquals(2,seen.size)
        assertEquals("POST",seen[0].requestMethod);assertEquals("PUT",seen[1].requestMethod)
        assertTrue(seen[0].output.toString().contains("appDataFolder"));assertArrayEquals(body,seen[1].output.toByteArray())
        assertFalse(seen[0].instanceFollowRedirects);assertFalse(seen[1].instanceFollowRedirects)
        for(bad in listOf("http://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&upload_id=x","https://evil.invalid/upload/drive/v3/files?uploadType=resumable&upload_id=x","https://www.googleapis.com.evil.invalid/upload/drive/v3/files?uploadType=resumable&upload_id=x","https://www.googleapis.com/drive/v3/files/existing?uploadType=resumable&upload_id=x","https://user@www.googleapis.com/upload/drive/v3/files?uploadType=resumable&upload_id=x","https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&upload_id=x&upload_id=y")) assertTrue(runCatching {transport.sessionPath(bad)}.isFailure)
    }
    @Test fun redirectsQuotaRevocationBoundsAndLateSessionCannotUpload() = runBlocking {
        for(status in listOf(302,401,403,429,500)) {
            val transport=DriveTransport("synthetic",{}, {url->Connection(url,status)})
            assertTrue(runCatching {transport.accountTag()}.exceptionOrNull() is DriveFailure)
        }
        val huge=DriveTransport("synthetic",{}, {url->Connection(url,bytes=ByteArray(5000))})
        assertTrue(runCatching {huge.accountTag()}.isFailure)
        var active=true;var calls=0
        val late=DriveTransport("synthetic",{check(active)}, {url->calls++;active=false;Connection(url,location="https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&upload_id=synthetic")})
        assertTrue(runCatching {late.upload("snapshot-${Wire.id()}.pennybackup",byteArrayOf(1))}.isFailure);assertEquals(1,calls)
    }
}
