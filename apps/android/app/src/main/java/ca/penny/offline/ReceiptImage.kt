package ca.penny.offline

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.ImageDecoder
import android.net.Uri
import java.io.ByteArrayOutputStream

object ReceiptImage {
    const val maxInputBytes = 20 * 1024 * 1024
    data class Prepared(val bytes: ByteArray, val optimized: Boolean)
    fun read(context: Context, uri: Uri): ByteArray = prepare(context,uri).bytes
    fun prepare(context: Context, uri: Uri): Prepared = context.contentResolver.openInputStream(uri).use {
        prepare(BackupExporter.readBounded(checkNotNull(it),maxInputBytes))
    }
    fun prepare(bytes: ByteArray): Prepared {
        require(bytes.isNotEmpty() && bytes.size <= maxInputBytes) { "Choose a receipt image under 20 MiB" }
        if(bytes.size <= Attachment.maxBytes && runCatching { decode(bytes).recycle() }.isSuccess) return Prepared(bytes,false)
        // Conversion never rescues an animated, truncated or unsupported container.
        val png = bytes.size >= 8 && bytes.take(8) == listOf(137,80,78,71,13,10,26,10).map { it.toByte() }
        if(png) requireCompletePng(bytes)
        val jpeg = bytes.size >= 5 && bytes[0] == 0xff.toByte() && bytes[1] == 0xd8.toByte()
        if(jpeg) require(bytes[bytes.size-2] == 0xff.toByte() && bytes.last() == 0xd9.toByte()) { "Receipt JPEG is truncated" }
        val heif = bytes.size >= 16 && String(bytes,4,4,Charsets.US_ASCII) == "ftyp" && String(bytes,8,4,Charsets.US_ASCII) in listOf("heic","heix","mif1")
        require(png || jpeg || heif) { "Choose a static JPEG, PNG or HEIC photo" }
        val bitmap = if(android.os.Build.VERSION.SDK_INT >= 28) {
            ImageDecoder.decodeBitmap(ImageDecoder.createSource(java.nio.ByteBuffer.wrap(bytes))) { decoder, info, _ ->
                require(!info.isAnimated && info.size.width in 1..16000 && info.size.height in 1..16000 && info.size.width.toLong()*info.size.height <= 100_000_000) { "Photo dimensions exceed preparation limits" }
                require(info.mimeType in listOf("image/jpeg","image/png","image/heif","image/heic")) { "Unsupported image format" }
                val scale = minOf(1.0,2048.0/maxOf(info.size.width,info.size.height))
                decoder.setTargetSize(maxOf(1,(info.size.width*scale).toInt()),maxOf(1,(info.size.height*scale).toInt()))
                decoder.allocator = ImageDecoder.ALLOCATOR_SOFTWARE
                decoder.setOnPartialImageListener { false }
            }
        } else {
            require(!heif) { "HEIC preparation needs Android 9 or newer. Choose JPEG or PNG." }
            val bounds = BitmapFactory.Options().apply { inJustDecodeBounds=true }
            BitmapFactory.decodeByteArray(bytes,0,bytes.size,bounds)
            require(bounds.outWidth in 1..16000 && bounds.outHeight in 1..16000 && bounds.outWidth.toLong()*bounds.outHeight <= 100_000_000)
            val options = BitmapFactory.Options().apply { while(maxOf(bounds.outWidth,bounds.outHeight)/inSampleSize.coerceAtLeast(1)>2048) inSampleSize=inSampleSize.coerceAtLeast(1)*2 }
            checkNotNull(BitmapFactory.decodeByteArray(bytes,0,bytes.size,options))
        }
        return try { prepareBitmap(bitmap) } finally { bitmap.recycle() }
    }
    fun prepareBitmap(source: Bitmap, rotation: Int = 0): Prepared {
        require(source.width in 1..16000 && source.height in 1..16000 && source.width.toLong()*source.height <= 100_000_000)
        val matrix = android.graphics.Matrix().apply { postRotate(rotation.toFloat()) }
        var image = Bitmap.createBitmap(source,0,0,source.width,source.height,matrix,true)
        try {
            if(maxOf(image.width,image.height)>2048) {
                val scale=2048.0/maxOf(image.width,image.height)
                val resized=Bitmap.createScaledBitmap(image,maxOf(1,(image.width*scale).toInt()),maxOf(1,(image.height*scale).toInt()),true)
                if(image !== source) image.recycle(); image=resized
            }
            // Flatten transparency onto white so receipt text stays readable.
            val opaque=Bitmap.createBitmap(image.width,image.height,Bitmap.Config.ARGB_8888)
            android.graphics.Canvas(opaque).apply { drawColor(android.graphics.Color.WHITE); drawBitmap(image,0f,0f,null) }
            try {
                for(quality in listOf(90,80,65,45)) {
                    val output=ByteArrayOutputStream(); check(opaque.compress(Bitmap.CompressFormat.JPEG,quality,output))
                    val result=output.toByteArray()
                    if(result.size <= Attachment.maxBytes) { decode(result).recycle(); return Prepared(result,true) }
                }
            } finally { opaque.recycle() }
            error("The prepared image is too large. Choose a smaller receipt photo.")
        } finally { if(image !== source) image.recycle() }
    }
    fun decode(bytes: ByteArray): Bitmap {
        require(bytes.size <= Attachment.maxBytes)
        val type = Attachment.mediaType(bytes)
        if (type == "image/png") requireCompletePng(bytes)
        val options = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeByteArray(bytes, 0, bytes.size, options)
        require(options.outWidth in 1..4096 && options.outHeight in 1..4096 && options.outWidth.toLong() * options.outHeight <= 16_000_000 && options.outMimeType == type) { "Receipt image dimensions or format are invalid" }
        if (android.os.Build.VERSION.SDK_INT >= 28) {
            return ImageDecoder.decodeBitmap(ImageDecoder.createSource(java.nio.ByteBuffer.wrap(bytes))) { decoder, _, _ ->
                decoder.allocator = ImageDecoder.ALLOCATOR_SOFTWARE
                decoder.setOnPartialImageListener { false }
            }
        }
        return checkNotNull(BitmapFactory.decodeByteArray(bytes, 0, bytes.size)) { "Receipt image is damaged" }
    }
    fun validate(attachments: List<Attachment>) { attachments.forEach { decode(it.bytes()).recycle() } }
    // Older BitmapFactory accepts some damaged zlib streams as partial pixels.
    // Authenticate CRCs and consume the entire bounded scanline stream first.
    private fun requireCompletePng(bytes: ByteArray) {
        require(bytes.size >= 45 && java.nio.ByteBuffer.wrap(bytes,8,4).int == 13 && String(bytes,12,4,Charsets.US_ASCII) == "IHDR") { "Invalid PNG header" }
        val width=java.nio.ByteBuffer.wrap(bytes,16,4).int
        val height=java.nio.ByteBuffer.wrap(bytes,20,4).int
        require(width in 1..16000 && height in 1..16000 && width.toLong()*height <= 100_000_000) { "Photo dimensions exceed preparation limits" }
        val depth=bytes[24].toInt() and 255
        val color=bytes[25].toInt() and 255
        val channels=when(color) { 0,3 -> 1; 2 -> 3; 4 -> 2; 6 -> 4; else -> error("Invalid PNG color") }
        require(depth in (when(color) {0 -> listOf(1,2,4,8,16);3 -> listOf(1,2,4,8);else -> listOf(8,16)}))
        require(bytes[26].toInt()==0 && bytes[27].toInt()==0 && bytes[28].toInt() in 0..1)
        fun pass(x:Int,y:Int,dx:Int,dy:Int):Pair<Int,Int> {
            val w=if(width<=x) 0 else (width-x+dx-1)/dx
            val h=if(height<=y) 0 else (height-y+dy-1)/dy
            return ((w*channels*depth+7)/8) to (if(w==0) 0 else h)
        }
        val passes=(if(bytes[28].toInt()==0) listOf(pass(0,0,1,1)) else listOf(
            pass(0,0,8,8),pass(4,0,8,8),pass(0,4,4,8),pass(2,0,4,4),pass(0,2,2,4),pass(1,0,2,2),pass(0,1,1,2))).filter {it.second>0}
        val expectedSize=passes.sumOf {(it.first.toLong()+1)*it.second}
        var passIndex=0
        var rowsRemaining=passes.first().second
        var rowRemaining=0
        val inflater=java.util.zip.Inflater()
        val output=ByteArray(8192)
        var decodedSize=0L
        var position=8
        var sawData=false
        var endedData=false
        var sawPalette=false
        try {
            while(position<bytes.size) {
                require(bytes.size-position>=12) { "Receipt PNG is truncated" }
                val length=java.nio.ByteBuffer.wrap(bytes,position,4).int
                require(length>=0 && length.toLong()+12<=bytes.size-position) { "Receipt PNG is truncated" }
                val type=String(bytes,position+4,4,Charsets.US_ASCII)
                require(type.length==4 && type.all {it in 'A'..'Z' || it in 'a'..'z'} && type[2] in 'A'..'Z') {"Invalid PNG chunk type"}
                require(type !in listOf("acTL","fcTL","fdAT") && (type!="IHDR" || position==8)) { "Animated receipts are not supported" }
                require(type[0] !in 'A'..'Z' || type in listOf("IHDR","PLTE","IDAT","IEND")) {"Unknown critical PNG chunk"}
                if(type=="PLTE") {
                    require(!sawPalette && !sawData && color !in listOf(0,4) && length in 1..768 && length%3==0 && (color!=3 || length/3<=1.shl(depth))) {"Invalid PNG palette"}
                    sawPalette=true
                }
                val crc=java.util.zip.CRC32().apply {update(bytes,position+4,length+4)}.value
                val expected=java.nio.ByteBuffer.wrap(bytes,position+length+8,4).int.toLong() and 0xffffffffL
                require(crc==expected) { "Receipt PNG is damaged" }
                if(type=="IDAT") {
                    require((color!=3 || sawPalette) && !endedData && (!inflater.finished() || length==0)) { "Invalid PNG data sequence" }
                    sawData=true
                    if(length>0) {
                        inflater.setInput(bytes,position+8,length)
                        while(!inflater.needsInput() && !inflater.finished()) {
                            val count=inflater.inflate(output)
                            decodedSize+=count
                            require(decodedSize<=expectedSize && !inflater.needsDictionary()) { "Invalid PNG pixel stream" }
                            var cursor=0
                            while(cursor<count) {
                                if(rowRemaining==0) {
                                    if(rowsRemaining==0) {passIndex++;rowsRemaining=passes[passIndex].second}
                                    require((output[cursor++].toInt() and 255)<=4) { "Invalid PNG row filter" }
                                    rowRemaining=passes[passIndex].first
                                    rowsRemaining--
                                }
                                val used=minOf(rowRemaining,count-cursor)
                                rowRemaining-=used;cursor+=used
                            }
                            require(count>0 || inflater.needsInput() || inflater.finished()) { "Invalid PNG pixel stream" }
                        }
                        require(!inflater.finished() || inflater.remaining==0) { "Trailing PNG compressed data" }
                    }
                } else if(sawData) endedData=true
                position+=length+12
                if(type=="IEND") {
                    require(length==0 && position==bytes.size && sawData && inflater.finished() && decodedSize==expectedSize) { "Incomplete PNG pixels or ending" }
                    return
                }
            }
            error("Receipt PNG is truncated")
        } finally {inflater.end()}
    }
}
