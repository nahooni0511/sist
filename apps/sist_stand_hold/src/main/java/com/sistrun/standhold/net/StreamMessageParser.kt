package com.sistrun.standhold.net

import com.google.gson.JsonObject
import com.google.gson.JsonParser

object StreamMessageParser {

    fun parse(raw: String): StreamMessage {
        return try {
            val root = JsonParser.parseString(raw).asJsonObject
            when (root.optString("type")) {
                "server_info" -> parseServerInfo(root)
                "status" -> parseStatus(root)
                "frame" -> parseFrame(root)
                "landmarks" -> parseLandmarks(root)
                "session_started" -> parseSessionStarted(root)
                "session_progress" -> parseSessionProgress(root)
                "result" -> parseResult(root)
                "error" -> parseError(root)
                else -> StreamMessage.Unknown(raw)
            }
        } catch (_: Exception) {
            StreamMessage.Unknown(raw)
        }
    }

    private fun parseServerInfo(root: JsonObject): StreamMessage.ServerInfo {
        return StreamMessage.ServerInfo(
            name = root.optString("name"),
            version = root.optString("version"),
            cameraSource = root.optString("camera_source"),
            platform = root.optString("platform"),
            scoringDevice = root.optString("scoring_device"),
            cudaAvailable = root.optBoolean("cuda_available"),
            mediapipeAvailable = root.optBoolean("mediapipe_available", true),
        )
    }

    private fun parseStatus(root: JsonObject): StreamMessage.Status {
        return StreamMessage.Status(
            message = root.optString("message"),
            level = root.optString("level", "info"),
        )
    }

    private fun parseFrame(root: JsonObject): StreamMessage.Frame {
        return StreamMessage.Frame(
            timestampMs = root.optLong("timestamp_ms", System.currentTimeMillis()),
            width = root.optInt("width", 0),
            height = root.optInt("height", 0),
            jpegBase64 = root.optString("jpeg_base64"),
            currentScore = root.optFloatOrNull("current_score"),
        )
    }

    private fun parseLandmarks(root: JsonObject): StreamMessage.Landmarks {
        val points = mutableListOf<PosePoint>()
        root.getAsJsonArray("keypoints")?.forEach { item ->
            val obj = item.asJsonObject
            points += PosePoint(
                x = obj.optFloat("x"),
                y = obj.optFloat("y"),
                z = obj.optFloat("z"),
                visibility = obj.optFloat("visibility", 1f),
                presence = obj.optFloat("presence", 1f),
            )
        }

        return StreamMessage.Landmarks(
            timestampMs = root.optLong("timestamp_ms", System.currentTimeMillis()),
            keypoints = points,
        )
    }

    private fun parseSessionStarted(root: JsonObject): StreamMessage.SessionStarted {
        return StreamMessage.SessionStarted(
            templateName = root.optString("template_name"),
            countdownSec = root.optInt("countdown_sec", 10),
            deadlineTimestampMs = root.optLong("deadline_timestamp_ms", 0L),
        )
    }

    private fun parseSessionProgress(root: JsonObject): StreamMessage.SessionProgress {
        return StreamMessage.SessionProgress(
            remainingMs = root.optLong("remaining_ms", 0L),
            currentScore = root.optFloatOrNull("current_score"),
            bestScore = root.optFloatOrNull("best_score"),
        )
    }

    private fun parseResult(root: JsonObject): StreamMessage.Result {
        return StreamMessage.Result(
            templateName = root.optString("template_name"),
            bestScore = root.optFloat("best_score"),
            bestFrameJpegBase64 = root.optString("best_frame_jpeg_base64"),
            referenceImageBase64 = root.optString("reference_image_base64"),
            feedback = root.optString("feedback"),
            feedbackModel = root.optString("feedback_model"),
        )
    }

    private fun parseError(root: JsonObject): StreamMessage.Error {
        return StreamMessage.Error(
            message = root.optString("message", "server error"),
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

    private fun JsonObject.optFloatOrNull(key: String): Float? {
        val primitive = this.get(key) ?: return null
        if (!primitive.isJsonPrimitive || primitive.asJsonPrimitive.isString && primitive.asString.isBlank()) {
            return null
        }
        return runCatching { primitive.asFloat }.getOrNull()
    }

    private fun JsonObject.optBoolean(key: String, default: Boolean = false): Boolean {
        val primitive = this.get(key) ?: return default
        return if (primitive.isJsonPrimitive) primitive.asBoolean else default
    }
}
