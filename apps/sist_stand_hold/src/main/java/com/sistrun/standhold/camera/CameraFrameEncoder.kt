package com.sistrun.standhold.camera

import android.graphics.ImageFormat
import android.graphics.Rect
import android.graphics.YuvImage
import android.util.Base64
import androidx.camera.core.ImageProxy
import java.io.ByteArrayOutputStream

data class EncodedCameraFrame(
    val timestampMs: Long,
    val width: Int,
    val height: Int,
    val rotationDegrees: Int,
    val jpegBase64: String,
)

object CameraFrameEncoder {

    fun encode(imageProxy: ImageProxy, jpegQuality: Int = 70): EncodedCameraFrame? {
        if (imageProxy.format != ImageFormat.YUV_420_888) {
            return null
        }
        if (imageProxy.width <= 0 || imageProxy.height <= 0) {
            return null
        }

        val nv21 = runCatching { yuv420ToNv21(imageProxy) }.getOrNull() ?: return null
        val width = imageProxy.width
        val height = imageProxy.height

        val output = ByteArrayOutputStream()
        val compressed = YuvImage(nv21, ImageFormat.NV21, width, height, null)
            .compressToJpeg(Rect(0, 0, width, height), jpegQuality.coerceIn(35, 90), output)
        if (!compressed) {
            return null
        }

        val timestampMs = (imageProxy.imageInfo.timestamp / 1_000_000L).takeIf { it > 0L }
            ?: System.currentTimeMillis()

        return EncodedCameraFrame(
            timestampMs = timestampMs,
            width = width,
            height = height,
            rotationDegrees = imageProxy.imageInfo.rotationDegrees,
            jpegBase64 = Base64.encodeToString(output.toByteArray(), Base64.NO_WRAP),
        )
    }

    private fun yuv420ToNv21(imageProxy: ImageProxy): ByteArray {
        val width = imageProxy.width
        val height = imageProxy.height
        val output = ByteArray(width * height + (width * height / 2))

        val yPlane = imageProxy.planes[0]
        val uPlane = imageProxy.planes[1]
        val vPlane = imageProxy.planes[2]

        val yBuffer = yPlane.buffer
        val yRowStride = yPlane.rowStride
        val yPixelStride = yPlane.pixelStride

        var outIndex = 0
        for (row in 0 until height) {
            val rowOffset = row * yRowStride
            for (col in 0 until width) {
                output[outIndex++] = yBuffer.get(rowOffset + (col * yPixelStride))
            }
        }

        val uBuffer = uPlane.buffer
        val vBuffer = vPlane.buffer
        val uRowStride = uPlane.rowStride
        val vRowStride = vPlane.rowStride
        val uPixelStride = uPlane.pixelStride
        val vPixelStride = vPlane.pixelStride

        for (row in 0 until (height / 2)) {
            val uRowOffset = row * uRowStride
            val vRowOffset = row * vRowStride
            for (col in 0 until (width / 2)) {
                output[outIndex++] = vBuffer.get(vRowOffset + (col * vPixelStride))
                output[outIndex++] = uBuffer.get(uRowOffset + (col * uPixelStride))
            }
        }
        return output
    }
}
