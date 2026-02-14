package com.sistrun.dance.net

import com.google.gson.JsonObject
import com.google.gson.JsonParser

object StreamMessageParser {

    fun parse(raw: String): StreamMessage {
        return try {
            val root = JsonParser.parseString(raw).asJsonObject
            when (root.optString("type")) {
                "status" -> parseStatus(root)
                "camera" -> parseCamera(root)
                "landmarks" -> parseLandmarks(root)
                "frame" -> parseFrame(root)
                else -> StreamMessage.Unknown(raw)
            }
        } catch (_: Exception) {
            StreamMessage.Unknown(raw)
        }
    }

    private fun parseStatus(root: JsonObject): StreamMessage.Status {
        return StreamMessage.Status(
            message = root.optString("message", ""),
            level = root.optString("level", "info")
        )
    }

    private fun parseCamera(root: JsonObject): StreamMessage.Camera {
        return StreamMessage.Camera(rtspUrl = root.optString("rtsp_url").takeIf { it.isNotBlank() })
    }

    private fun parseLandmarks(root: JsonObject): StreamMessage.Landmarks {
        val points = mutableListOf<PosePoint>()
        val keypoints = root.getAsJsonArray("keypoints")
        if (keypoints != null) {
            keypoints.forEach { item ->
                val obj = item.asJsonObject
                points += PosePoint(
                    x = obj.optFloat("x"),
                    y = obj.optFloat("y"),
                    z = obj.optFloat("z"),
                    visibility = obj.optFloat("visibility", 1f)
                )
            }
        }

        return StreamMessage.Landmarks(
            timestampMs = root.optLong("timestamp_ms", System.currentTimeMillis()),
            keypoints = points
        )
    }

    private fun parseFrame(root: JsonObject): StreamMessage.Frame {
        return StreamMessage.Frame(
            timestampMs = root.optLong("timestamp_ms", System.currentTimeMillis()),
            width = root.optInt("width", 0),
            height = root.optInt("height", 0),
            jpegBase64 = root.optString("jpeg_base64")
        )
    }

    private fun JsonObject.optString(key: String, default: String = ""): String {
        val primitive = this.get(key) ?: return default
        return if (primitive.isJsonPrimitive) primitive.asString else default
    }

    private fun JsonObject.optInt(key: String, default: Int = 0): Int {
        val primitive = this.get(key) ?: return default
        return if (primitive.isJsonPrimitive) primitive.asInt else default
    }

    private fun JsonObject.optLong(key: String, default: Long = 0L): Long {
        val primitive = this.get(key) ?: return default
        return if (primitive.isJsonPrimitive) primitive.asLong else default
    }

    private fun JsonObject.optFloat(key: String, default: Float = 0f): Float {
        val primitive = this.get(key) ?: return default
        return if (primitive.isJsonPrimitive) primitive.asFloat else default
    }
}
