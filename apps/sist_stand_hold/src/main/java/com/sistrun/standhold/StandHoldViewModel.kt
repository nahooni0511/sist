package com.sistrun.standhold

import android.content.res.AssetManager
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.util.Base64
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.sistrun.standhold.camera.EncodedCameraFrame
import com.sistrun.standhold.net.AiBoxEvent
import com.sistrun.standhold.net.AiBoxSocketClient
import com.sistrun.standhold.net.PosePoint
import com.sistrun.standhold.net.StreamMessage
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.channels.BufferOverflow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.flow.collect
import kotlinx.coroutines.launch
import java.io.ByteArrayOutputStream
import java.util.Locale
import java.util.concurrent.atomic.AtomicLong
import kotlin.math.ceil

data class TemplatePreview(
    val fileName: String,
    val bitmap: Bitmap,
)

data class StandHoldUiState(
    val isConnected: Boolean = false,
    val status: String = "AI BOX 연결 대기",
    val templates: List<TemplatePreview> = emptyList(),
    val selectedTemplateIndex: Int = 0,
    val liveFrame: Bitmap? = null,
    val landmarks: List<PosePoint> = emptyList(),
    val countdownSec: Int? = null,
    val currentScore: Float? = null,
    val bestScore: Float? = null,
    val showResult: Boolean = false,
    val resultReference: Bitmap? = null,
    val resultBestFrame: Bitmap? = null,
    val resultScore: Float? = null,
    val feedback: String = "",
    val feedbackModel: String = "",
    val serverInfo: String = "",
)

class StandHoldViewModel : ViewModel() {

    private data class TemplateEntry(
        val fileName: String,
        val bitmap: Bitmap,
        val base64Jpeg: String,
    )

    private val socketClient = AiBoxSocketClient()
    private var connectJob: Job? = null
    private val connectionToken = AtomicLong(0L)
    private var templateEntries: List<TemplateEntry> = emptyList()
    private val outboundCameraFrames = MutableSharedFlow<EncodedCameraFrame>(
        extraBufferCapacity = 1,
        onBufferOverflow = BufferOverflow.DROP_OLDEST,
    )

    private val _uiState = MutableStateFlow(StandHoldUiState())
    val uiState: StateFlow<StandHoldUiState> = _uiState.asStateFlow()

    init {
        viewModelScope.launch(Dispatchers.IO) {
            outboundCameraFrames.collect { frame ->
                if (!_uiState.value.isConnected) {
                    return@collect
                }
                socketClient.sendCommand(
                    mapOf(
                        "type" to "client_frame",
                        "timestamp_ms" to frame.timestampMs,
                        "width" to frame.width,
                        "height" to frame.height,
                        "rotation_degrees" to frame.rotationDegrees,
                        "jpeg_base64" to frame.jpegBase64,
                    ),
                )
            }
        }
    }

    fun loadTemplates(assetManager: AssetManager) {
        if (templateEntries.isNotEmpty()) {
            return
        }

        viewModelScope.launch(Dispatchers.IO) {
            val candidates = assetManager.list("")
                ?.filter { isImageFile(it) }
                ?.sorted()
                .orEmpty()

            if (candidates.isEmpty()) {
                _uiState.update { it.copy(status = "asset 폴더에 기준 사진이 없습니다.") }
                return@launch
            }

            val loaded = mutableListOf<TemplateEntry>()
            for (name in candidates) {
                val bmp = runCatching {
                    assetManager.open(name).use { stream ->
                        BitmapFactory.decodeStream(stream)
                    }
                }.getOrNull() ?: continue

                val uploadBitmap = resizeIfNeeded(bmp, maxWidth = 768)
                val base64 = bitmapToBase64Jpeg(uploadBitmap, quality = 87)
                loaded += TemplateEntry(
                    fileName = name,
                    bitmap = bmp,
                    base64Jpeg = base64,
                )
            }

            if (loaded.isEmpty()) {
                _uiState.update { it.copy(status = "기준 사진 로딩에 실패했습니다.") }
                return@launch
            }

            templateEntries = loaded
            _uiState.update {
                it.copy(
                    templates = loaded.map { item ->
                        TemplatePreview(
                            fileName = item.fileName,
                            bitmap = item.bitmap,
                        )
                    },
                    selectedTemplateIndex = 0,
                    resultReference = loaded.first().bitmap,
                    status = if (it.isConnected) it.status else "AI BOX 연결 대기",
                )
            }
        }
    }

    fun connect(aiBoxIp: String, port: Int = AI_BOX_PORT) {
        val host = aiBoxIp.trim()
        if (host.isBlank()) {
            _uiState.update { it.copy(status = "AI BOX IP를 입력하세요.") }
            return
        }

        disconnect()
        _uiState.update {
            it.copy(
                status = "$host:$port 연결 중...",
                showResult = false,
                countdownSec = null,
                currentScore = null,
                bestScore = null,
                landmarks = emptyList(),
            )
        }
        val token = connectionToken.incrementAndGet()

        connectJob = viewModelScope.launch(Dispatchers.IO) {
            socketClient.connect(host, port) eventLoop@{ event ->
                if (token != connectionToken.get()) {
                    return@eventLoop
                }
                when (event) {
                    is AiBoxEvent.Connected -> {
                        _uiState.update { state ->
                            state.copy(
                                isConnected = true,
                                status = "AI BOX 연결됨 (${event.host}:${event.port}) · 시작 버튼을 누르세요.",
                            )
                        }
                    }

                    is AiBoxEvent.Message -> handleStreamMessage(event.payload)

                    is AiBoxEvent.Error -> {
                        _uiState.update { state ->
                            state.copy(
                                status = "연결 오류: ${event.reason}",
                                isConnected = false,
                            )
                        }
                    }

                    AiBoxEvent.Disconnected -> {
                        _uiState.update { state ->
                            state.copy(
                                isConnected = false,
                                status = "AI BOX 연결 종료",
                                countdownSec = null,
                            )
                        }
                    }
                }
            }
        }
    }

    fun disconnect() {
        performDisconnect(status = "AI BOX 연결 대기")
    }

    fun disconnectForBackground() {
        if (!_uiState.value.isConnected && connectJob == null) {
            return
        }
        performDisconnect(status = "앱이 백그라운드로 전환되어 연결 해제")
    }

    private fun performDisconnect(status: String) {
        connectionToken.incrementAndGet()
        connectJob?.cancel()
        connectJob = null
        socketClient.disconnect()

        _uiState.update {
            it.copy(
                isConnected = false,
                status = status,
                countdownSec = null,
                currentScore = null,
                bestScore = null,
                landmarks = emptyList(),
            )
        }
    }

    fun selectTemplate(index: Int) {
        if (templateEntries.isEmpty()) {
            return
        }
        val selected = index.coerceIn(0, templateEntries.lastIndex)
        val connected = _uiState.value.isConnected
        _uiState.update { state ->
            state.copy(
                selectedTemplateIndex = selected,
                resultReference = templateEntries[selected].bitmap,
                status = if (connected) {
                    "기준 자세 선택 완료 · 시작 버튼을 누르세요."
                } else {
                    state.status
                },
            )
        }
    }

    fun startSessionByButton() {
        if (!_uiState.value.isConnected) {
            _uiState.update { it.copy(status = "먼저 AI BOX에 연결한 뒤 시작 버튼을 누르세요.") }
            return
        }
        viewModelScope.launch(Dispatchers.IO) {
            startSession()
        }
    }

    private fun startSession() {
        if (templateEntries.isEmpty()) {
            _uiState.update { it.copy(status = "기준 사진이 아직 준비되지 않았습니다.") }
            return
        }

        val selected = _uiState.value.selectedTemplateIndex.coerceIn(0, templateEntries.lastIndex)
        val template = templateEntries[selected]

        val sent = socketClient.sendCommand(
            mapOf(
                "type" to "start_session",
                "template_name" to template.fileName,
                "reference_image_base64" to template.base64Jpeg,
                "countdown_sec" to DEFAULT_SESSION_SECONDS,
            )
        )

        if (!sent) {
            _uiState.update { it.copy(status = "세션 시작 명령 전송 실패") }
            return
        }

        _uiState.update {
            it.copy(
                showResult = false,
                countdownSec = DEFAULT_SESSION_SECONDS,
                currentScore = null,
                bestScore = null,
                feedback = "",
                feedbackModel = "",
                resultBestFrame = null,
                resultScore = null,
                landmarks = emptyList(),
                status = "${DEFAULT_SESSION_SECONDS}초 카운트 시작...",
            )
        }
    }

    fun submitCameraFrame(frame: EncodedCameraFrame) {
        outboundCameraFrames.tryEmit(frame)
    }

    private fun handleStreamMessage(message: StreamMessage) {
        when (message) {
            is StreamMessage.ServerInfo -> {
                val info = "camera=${message.cameraSource}, scoring=${message.scoringDevice}, cuda=${message.cudaAvailable}"
                _uiState.update {
                    it.copy(
                        serverInfo = info,
                        status = "서버 준비 완료 ($info)",
                    )
                }
            }

            is StreamMessage.Status -> {
                _uiState.update { it.copy(status = message.message) }
            }

            is StreamMessage.Frame -> {
                val bitmap = decodeBitmap(message.jpegBase64)
                _uiState.update {
                    it.copy(
                        liveFrame = bitmap ?: it.liveFrame,
                        currentScore = message.currentScore ?: it.currentScore,
                    )
                }
            }

            is StreamMessage.Landmarks -> {
                _uiState.update { it.copy(landmarks = message.keypoints) }
            }

            is StreamMessage.SessionStarted -> {
                _uiState.update {
                    it.copy(
                        showResult = false,
                        countdownSec = message.countdownSec,
                        status = "${message.countdownSec}초 동안 자세를 유지하세요.",
                    )
                }
            }

            is StreamMessage.SessionProgress -> {
                val remainingSec = ceil(message.remainingMs.coerceAtLeast(0L).toDouble() / 1000.0).toInt()
                _uiState.update {
                    it.copy(
                        countdownSec = if (remainingSec > 0) remainingSec else null,
                        currentScore = message.currentScore ?: it.currentScore,
                        bestScore = message.bestScore ?: it.bestScore,
                    )
                }
            }

            is StreamMessage.Result -> {
                val bestFrame = decodeBitmap(message.bestFrameJpegBase64)
                val referenceFrame = decodeBitmap(message.referenceImageBase64)

                _uiState.update {
                    it.copy(
                        showResult = true,
                        countdownSec = null,
                        resultBestFrame = bestFrame,
                        resultReference = referenceFrame ?: it.resultReference,
                        resultScore = message.bestScore,
                        bestScore = message.bestScore,
                        feedback = message.feedback,
                        feedbackModel = message.feedbackModel,
                        status = "최고점 프레임 분석 완료 (${formatScore(message.bestScore)}점)",
                    )
                }
            }

            is StreamMessage.Error -> {
                _uiState.update { it.copy(status = "서버 오류: ${message.message}") }
            }

            is StreamMessage.Unknown -> {
                // no-op
            }
        }
    }

    override fun onCleared() {
        disconnect()
        super.onCleared()
    }

    private fun decodeBitmap(base64Jpeg: String): Bitmap? {
        if (base64Jpeg.isBlank()) {
            return null
        }

        val normalized = if (base64Jpeg.startsWith("data:image")) {
            base64Jpeg.substringAfter(',', missingDelimiterValue = "")
        } else {
            base64Jpeg
        }
        if (normalized.isBlank()) {
            return null
        }

        return runCatching {
            val bytes = Base64.decode(normalized, Base64.DEFAULT)
            BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
        }.getOrNull()
    }

    private fun bitmapToBase64Jpeg(bitmap: Bitmap, quality: Int): String {
        val output = ByteArrayOutputStream()
        bitmap.compress(Bitmap.CompressFormat.JPEG, quality.coerceIn(40, 95), output)
        return Base64.encodeToString(output.toByteArray(), Base64.NO_WRAP)
    }

    private fun resizeIfNeeded(bitmap: Bitmap, maxWidth: Int): Bitmap {
        if (bitmap.width <= maxWidth) {
            return bitmap
        }
        val ratio = maxWidth.toFloat() / bitmap.width.toFloat()
        val targetHeight = (bitmap.height * ratio).toInt().coerceAtLeast(1)
        return Bitmap.createScaledBitmap(bitmap, maxWidth, targetHeight, true)
    }

    private fun isImageFile(fileName: String): Boolean {
        val lower = fileName.lowercase(Locale.US)
        return lower.endsWith(".jpg") || lower.endsWith(".jpeg") || lower.endsWith(".png") || lower.endsWith(".webp")
    }

    private fun formatScore(value: Float): String = String.format(Locale.US, "%.1f", value)

    companion object {
        private const val AI_BOX_PORT = 8091
        private const val DEFAULT_SESSION_SECONDS = 10
    }
}
