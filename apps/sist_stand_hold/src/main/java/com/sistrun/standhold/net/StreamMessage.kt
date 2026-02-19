package com.sistrun.standhold.net

data class PosePoint(
    val x: Float,
    val y: Float,
    val z: Float = 0f,
    val visibility: Float = 1f,
    val presence: Float = 1f,
)

sealed interface StreamMessage {
    data class ServerInfo(
        val name: String,
        val version: String,
        val cameraSource: String,
        val platform: String,
        val scoringDevice: String,
        val cudaAvailable: Boolean,
        val mediapipeAvailable: Boolean,
    ) : StreamMessage

    data class Status(
        val message: String,
        val level: String = "info",
    ) : StreamMessage

    data class Frame(
        val timestampMs: Long,
        val width: Int,
        val height: Int,
        val jpegBase64: String,
        val currentScore: Float?,
    ) : StreamMessage

    data class Landmarks(
        val timestampMs: Long,
        val keypoints: List<PosePoint>,
    ) : StreamMessage

    data class SessionStarted(
        val templateName: String,
        val countdownSec: Int,
        val deadlineTimestampMs: Long,
    ) : StreamMessage

    data class SessionProgress(
        val remainingMs: Long,
        val currentScore: Float?,
        val bestScore: Float?,
    ) : StreamMessage

    data class Result(
        val templateName: String,
        val bestScore: Float,
        val bestFrameJpegBase64: String,
        val referenceImageBase64: String,
        val feedback: String,
        val feedbackModel: String,
    ) : StreamMessage

    data class Error(
        val message: String,
    ) : StreamMessage

    data class Unknown(
        val raw: String,
    ) : StreamMessage
}
