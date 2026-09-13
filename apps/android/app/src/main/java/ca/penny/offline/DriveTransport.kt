package ca.penny.offline

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import org.json.JSONArray
import java.net.URL
import java.net.URLEncoder
import javax.net.ssl.HttpsURLConnection

class DriveFailure(val reason: String): Exception(reason)

/** The only app-owned HTTP transport. Fixed Google Drive origin, no redirects or persisted tokens. */
class DriveTransport(private val token: String,private val guard: ()->Unit,private val openConnection: (URL)->HttpsURLConnection = {it.openConnection() as HttpsURLConnection}): CloudTransport {
    companion object {const val scope="https://www.googleapis.com/auth/drive.appdata"}
    private fun encode(value: String)=URLEncoder.encode(value,"UTF-8")
    private data class Response(val bytes: ByteArray,val location: String?)
    private suspend fun request(path: String,max: Int): ByteArray=response(path,max).bytes
    private suspend fun response(path: String,max: Int,body: ByteArray?=null,contentType: String="application/json",method: String="POST",headers: Map<String,String> = emptyMap()): Response=withContext(Dispatchers.IO) {
        guard();check(java.net.CookieHandler.getDefault()==null) {"Custom global cookie handling is not supported for Drive"};require(path.startsWith("/drive/v3/") || path.startsWith("/upload/drive/v3/"));require(!path.contains("#") && !path.contains("\r") && !path.contains("\n"))
        val connection=openConnection(URL("https://www.googleapis.com$path"))
        try {
            connection.instanceFollowRedirects=false;connection.connectTimeout=15000;connection.readTimeout=20000
            connection.setRequestProperty("Authorization","Bearer $token");connection.setRequestProperty("Accept","application/json");connection.useCaches=false
            headers.forEach {(name,value)->connection.setRequestProperty(name,value)}
            if(body!=null) {connection.requestMethod=method;connection.doOutput=true;connection.setRequestProperty("Content-Type",contentType);connection.setFixedLengthStreamingMode(body.size);guard();connection.outputStream.use {it.write(body);it.flush()};guard()}
            val status=connection.responseCode;guard()
            if(status !in 200..299) throw DriveFailure(when(status) {401->"credentials_expired";403->"permission_or_quota";429->"quota";in 500..599->"transient";in 300..399->"redirect_refused";else->"provider_failure"})
            val length=connection.contentLengthLong;require(length<=max)
            val bytes=connection.inputStream.use {input->val out=java.io.ByteArrayOutputStream();val buffer=ByteArray(8192);while(true) {guard();val count=input.read(buffer);guard();if(count<0) break;require(out.size()+count<=max);out.write(buffer,0,count)};out.toByteArray()};guard();Response(bytes,connection.getHeaderField("Location"))
        } finally {connection.disconnect()}
    }
    override suspend fun accountTag(): String {
        val j=StrictJson.objectFrom(request("/drive/v3/about?fields=user(permissionId)",4096));val identity=Wire.string(j.getJSONObject("user"),"permissionId")
        // permissionId is Google's opaque Drive identity; never an email, account name or token.
        require(Regex("[A-Za-z0-9_-]{1,128}").matches(identity))
        return CloudContract.accountTag("drive",identity)
    }
    override suspend fun upload(name: String,bytes: ByteArray): CloudItem {
        require(CloudContract.recognized(name));require(bytes.size in 1..Backup.maxEnvelopeBytes)
        val metadata=StrictJson.bytes(JSONObject().put("name",name).put("parents",JSONArray().put("appDataFolder")))
        // Resumable creation supports the full 20 MiB portable envelope. A failed session
        // is abandoned; manual retry reserves a new revision and creates new objects.
        val session=response("/upload/drive/v3/files?uploadType=resumable&fields=id,name",4096,metadata,
            headers=mapOf("X-Upload-Content-Type" to "application/octet-stream","X-Upload-Content-Length" to bytes.size.toString()))
        guard()
        val path=sessionPath(checkNotNull(session.location))
        val j=StrictJson.objectFrom(response(path,4096,bytes,"application/octet-stream","PUT").bytes)
        return item(j).also {require(it.name==name)}
    }
    internal fun sessionPath(location: String): String {
        CloudContract.text(location,1,4096)
        val uri=java.net.URI(location)
        require(uri.scheme=="https" && uri.host=="www.googleapis.com" && uri.port==-1 && uri.rawUserInfo==null && uri.rawFragment==null && uri.rawPath=="/upload/drive/v3/files") {"unsafe_upload_session"}
        val query=checkNotNull(uri.rawQuery);require(!query.contains("\r") && !query.contains("\n"))
        val parts=query.split("&").map {it.split("=",limit=2)};require(parts.all {it.size==2})
        val keys=parts.map {it[0]};require(keys.toSet().size==keys.size && keys.toSet()==setOf("uploadType","upload_id"))
        require(parts.single {it[0]=="uploadType"}[1]=="resumable")
        require(Regex("[A-Za-z0-9_-]{1,2048}").matches(parts.single {it[0]=="upload_id"}[1]))
        return uri.rawPath+"?"+query
    }
    private fun item(j: JSONObject)=CloudItem(Wire.string(j,"id"),Wire.string(j,"name")).also {CloudContract.text(it.id,1,1024);CloudContract.text(it.name,0,256)}
    override suspend fun download(item: CloudItem,maxBytes: Int): ByteArray {
        require(maxBytes in 1..Backup.maxEnvelopeBytes);CloudContract.text(item.id,1,1024)
        return request("/drive/v3/files/${encode(item.id)}?alt=media",maxBytes)
    }
    override suspend fun page(token: String?): CloudPage {
        token?.let {CloudContract.text(it,1,2048)}
        val path="/drive/v3/files?spaces=appDataFolder&pageSize=100&q=trashed%3Dfalse&fields=nextPageToken,incompleteSearch,files(id,name)"+(token?.let {"&pageToken=${encode(it)}"} ?: "")
        val j=StrictJson.objectFrom(request(path,1024*1024));require(!j.has("incompleteSearch") || (j.get("incompleteSearch") is Boolean && !j.getBoolean("incompleteSearch"))) {"listing_incomplete"}
        val rows=j.getJSONArray("files");require(rows.length()<=100)
        return CloudPage((0 until rows.length()).map {item(rows.getJSONObject(it))},if(j.has("nextPageToken")) Wire.string(j,"nextPageToken") else null)
    }
}
