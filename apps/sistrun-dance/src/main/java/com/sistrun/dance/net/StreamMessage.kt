package com.sistrun.dance.net

data class PosePoint(
    val x: Float,
    val y: Float,
    val z: Float = 0f,
    val visibility: Float = 1f
)

sealed interface StreamMessage {
    data class Status(
        val message: String,
        val level: String = "info"
    ) : StreamMessage

    data class Camera(
        val rtspUrl: String?
    ) : StreamMessage

    data class Landmarks(
        val timestampMs: Long,
        val keypoints: List<PosePoint>
    ) : StreamMessage

    data class Frame(
        val timestampMs: Long,
        val width: Int,
        val height: Int,
        val jpegBase64: String
    ) : StreamMessage

    data class Unknown(
        val raw: String
    ) : StreamMessage
}
