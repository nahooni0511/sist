package com.sistrun.dance

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.util.Base64
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.sistrun.dance.net.AiBoxEvent
import com.sistrun.dance.net.AiBoxSocketClient
import com.sistrun.dance.net.PosePoint
import com.sistrun.dance.net.StreamMessage
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.util.concurrent.atomic.AtomicLong

enum class StreamMode {
    NONE,
    RTSP,
    EMBEDDED_FRAME
}

data class DanceUiState(
    val isConnected: Boolean = false,
    val status: String = "AI BOX 연결 대기",
    val streamMode: StreamMode = StreamMode.NONE,
    val rtspUrl: String? = null,
    val latestFrame: Bitmap? = null,
    val landmarks: List<PosePoint> = emptyList()
)

class DanceViewModel : ViewModel() {

    private val socketClient = AiBoxSocketClient()
    private var connectJob: Job? = null
    private val connectionToken = AtomicLong(0L)

    private val _uiState = MutableStateFlow(DanceUiState())
    val uiState: StateFlow<DanceUiState> = _uiState.asStateFlow()

    fun connect(aiBoxIp: String, fallbackRtspUrl: String?) {
        if (aiBoxIp.isBlank()) {
            _uiState.update { it.copy(status = "AI BOX IP를 입력하세요.") }
            return
        }

        disconnect()
        _uiState.update {
            it.copy(
                status = "$aiBoxIp:8090 연결 중...",
                rtspUrl = fallbackRtspUrl?.takeIf(String::isNotBlank),
                streamMode = if (fallbackRtspUrl.isNullOrBlank()) StreamMode.NONE else StreamMode.RTSP,
                latestFrame = null,
                landmarks = emptyList()
            )
        }
        val token = connectionToken.incrementAndGet()

        connectJob = viewModelScope.launch(Dispatchers.IO) {
            socketClient.connect(aiBoxIp, AI_BOX_PORT) eventLoop@{ event ->
                if (token != connectionToken.get()) {
                    return@eventLoop
                }
                when (event) {
                    is AiBoxEvent.Connected -> {
                        _uiState.update { state ->
                            state.copy(
                                isConnected = true,
                                status = "AI BOX 연결됨 (${event.host}:${event.port})"
                            )
                        }
                    }

                    is AiBoxEvent.Message -> handleStreamMessage(event.payload)

                    is AiBoxEvent.Error -> {
                        _uiState.update { state ->
                            state.copy(
                                status = "연결 오류: ${event.reason}",
                                isConnected = false
                            )
                        }
                    }

                    AiBoxEvent.Disconnected -> {
                        _uiState.update { state ->
                            state.copy(
                                isConnected = false,
                                status = "AI BOX 연결 종료"
                            )
                        }
                    }
                }
            }
        }
    }

    fun disconnect() {
        connectionToken.incrementAndGet()
        connectJob?.cancel()
        connectJob = null
        socketClient.disconnect()
        _uiState.update {
            it.copy(
                isConnected = false,
                status = "AI BOX 연결 대기",
                streamMode = StreamMode.NONE,
                latestFrame = null,
                landmarks = emptyList()
            )
        }
    }

    override fun onCleared() {
        disconnect()
    }

    private fun handleStreamMessage(message: StreamMessage) {
        when (message) {
            is StreamMessage.Status -> {
                _uiState.update { it.copy(status = message.message) }
            }

            is StreamMessage.Camera -> {
                val rtspUrl = message.rtspUrl
                if (!rtspUrl.isNullOrBlank()) {
                    _uiState.update {
                        it.copy(
                            streamMode = StreamMode.RTSP,
                            rtspUrl = rtspUrl,
                            latestFrame = null,
                            status = "RTSP 스트림 수신: $rtspUrl"
                        )
                    }
                }
            }

            is StreamMessage.Landmarks -> {
                _uiState.update { it.copy(landmarks = message.keypoints) }
            }

            is StreamMessage.Frame -> {
                val bitmap = decodeBitmap(message.jpegBase64)
                if (bitmap != null) {
                    _uiState.update {
                        it.copy(
                            streamMode = StreamMode.EMBEDDED_FRAME,
                            latestFrame = bitmap,
                            status = "영상 프레임 + 랜드마크 수신 중"
                        )
                    }
                }
            }

            is StreamMessage.Unknown -> {
                _uiState.update { it.copy(status = "알 수 없는 메시지 수신") }
            }
        }
    }

    private fun decodeBitmap(base64Jpeg: String): Bitmap? {
        if (base64Jpeg.isBlank()) {
            return null
        }
        return runCatching {
            val bytes = Base64.decode(base64Jpeg, Base64.DEFAULT)
            BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
        }.getOrNull()
    }

    companion object {
        private const val AI_BOX_PORT = 8090
    }
}
