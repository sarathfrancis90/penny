package ca.penny.offline

import android.Manifest
import android.content.pm.PackageManager
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageCapture
import androidx.camera.core.ImageCaptureException
import androidx.camera.core.ImageProxy
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.compose.ui.window.Dialog
import androidx.core.content.ContextCompat
import androidx.lifecycle.compose.LocalLifecycleOwner

/** In-memory CameraX capture. No output-file overload or app-owned plaintext file. */
@Composable fun ReceiptCamera(onCaptured: (android.graphics.Bitmap,Int)->Unit, onDismiss: ()->Unit) {
    val context=LocalContext.current; val lifecycle=LocalLifecycleOwner.current
    var allowed by remember { mutableStateOf(ContextCompat.checkSelfPermission(context,Manifest.permission.CAMERA)==PackageManager.PERMISSION_GRANTED) }
    var requested by remember { mutableStateOf(false) }; var error by remember { mutableStateOf<String?>(null) }
    var ready by remember { mutableStateOf(false) }; var capturing by remember { mutableStateOf(false) }
    val active=remember { java.util.concurrent.atomic.AtomicBoolean(true) }
    val permission=rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { allowed=it; requested=true }
    val preview=remember { PreviewView(context).apply { implementationMode=PreviewView.ImplementationMode.COMPATIBLE; scaleType=PreviewView.ScaleType.FIT_CENTER } }
    val capture=remember { ImageCapture.Builder().setResolutionSelector(androidx.camera.core.resolutionselector.ResolutionSelector.Builder().setResolutionStrategy(androidx.camera.core.resolutionselector.ResolutionStrategy(android.util.Size(1600,1200),androidx.camera.core.resolutionselector.ResolutionStrategy.FALLBACK_RULE_CLOSEST_LOWER_THEN_HIGHER)).build()).setCaptureMode(ImageCapture.CAPTURE_MODE_MINIMIZE_LATENCY).build() }
    DisposableEffect(allowed) {
        active.set(true)
        var provider: ProcessCameraProvider?=null
        val observer=androidx.lifecycle.Observer<PreviewView.StreamState> { ready=it==PreviewView.StreamState.STREAMING }
        preview.previewStreamState.observe(lifecycle,observer)
        if(allowed) {
            val future=ProcessCameraProvider.getInstance(context)
            future.addListener({ if(active.get()) try {
                provider=future.get()
                val live=Preview.Builder().build().also { it.setSurfaceProvider(preview.surfaceProvider) }
                provider!!.bindToLifecycle(lifecycle,CameraSelector.DEFAULT_BACK_CAMERA,live,capture)
            } catch(_: Exception) { error="Camera unavailable. Choose a photo or enter details manually." } },ContextCompat.getMainExecutor(context))
        }
        onDispose { active.set(false);preview.previewStreamState.removeObserver(observer);provider?.unbindAll() }
    }
    Dialog(onDismissRequest=onDismiss,properties=androidx.compose.ui.window.DialogProperties(usePlatformDefaultWidth=false)) {
        Surface(Modifier.fillMaxSize()) { Column(Modifier.fillMaxSize().safeDrawingPadding().padding(20.dp),verticalArrangement=Arrangement.spacedBy(12.dp)) {
            Text("Photograph receipt",style=MaterialTheme.typography.titleLarge)
            if(allowed) Box(Modifier.fillMaxWidth().weight(1f).clipToBounds()) { AndroidView(factory={preview},modifier=Modifier.fillMaxSize()) }
            else {
                Text(if(requested) "Camera permission denied. You can still attach a photo or enter the expense manually." else "Allow camera access to photograph a receipt. Captures stay in memory until you save the encrypted receipt.")
                if(!requested) Button(onClick={permission.launch(Manifest.permission.CAMERA)}) { Text("Allow camera") }
            }
            error?.let { Text(it,color=MaterialTheme.colorScheme.error) }
            if(allowed) Button(enabled=ready && !capturing,onClick={
                capturing=true; capture.targetRotation=preview.display?.rotation ?: android.view.Surface.ROTATION_0
                capture.takePicture(ContextCompat.getMainExecutor(context),object: ImageCapture.OnImageCapturedCallback() {
                    override fun onCaptureSuccess(image: ImageProxy) {
                        try {
                            if(active.get()) { require(image.width in 1..4096 && image.height in 1..4096 && image.width.toLong()*image.height <= 16_000_000); val bitmap=image.toBitmap(); onCaptured(bitmap,image.imageInfo.rotationDegrees) }
                        } catch(_: Exception) { error="Capture could not be read. Try again or enter details manually."; capturing=false }
                        finally { image.close() }
                    }
                    override fun onError(exception: ImageCaptureException) { if(active.get()) { error="Capture failed. Try again or enter details manually."; capturing=false } }
                })
            }) { Text("Take receipt photo") }
            TextButton(onClick=onDismiss) { Text("Use manual entry") }
        } }
    }
}
