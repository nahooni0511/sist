package com.sistrun.integratetest

import android.content.pm.ActivityInfo
import android.content.Intent
import android.os.Bundle
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AppCompatActivity
import com.google.gson.Gson
import com.google.gson.JsonElement
import com.google.gson.JsonObject
import com.google.gson.JsonParser
import com.sistrun.integratetest.databinding.ActivityMainBinding
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import java.util.Locale
import java.util.concurrent.TimeUnit

class MainActivity : AppCompatActivity() {

    private lateinit var binding: ActivityMainBinding
    private val gson = Gson()

    private var activeSport: SportType = SportType.SQUAT
    private var isConnected = false
    private var statusText = "AI BOX 연결 대기"
    private var activeEndpointText = "연결 종목: -"
    private var activeConnectionToken = 0L
    private var activeClient: SportWebSocketClient? = null

    private var squatCount = 0
    private var squatExist = false
    private var squatProjectOver = false

    private var longJumpDistance: Float? = null
    private var longJumpGameOver = false
    private var longJumpSingleJump = false
    private var longJumpOnlineJump = false
    private var longJumpFallJump = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_LANDSCAPE
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                // Kiosk mode: OS back action is intentionally disabled.
            }
        })

        binding.backButton.setOnClickListener {
            navigateToHomeScreen()
        }

        binding.connectButton.setOnClickListener {
            if (isConnected) {
                disconnectActiveClient("연결 해제")
            } else {
                connectToSelectedSport()
            }
        }

        binding.startMeasureButton.setOnClickListener {
            sendControlMessage(start = true)
        }

        binding.stopMeasureButton.setOnClickListener {
            sendControlMessage(start = false)
        }

        binding.sportRadioGroup.setOnCheckedChangeListener { _, _ ->
            activeSport = selectedSportFromUi()
            renderUi()
            if (isConnected) {
                connectToSelectedSport(switching = true)
            }
        }

        syncAiBoxIpFromSharedSetting()
        renderUi()
    }

    override fun onResume() {
        super.onResume()
        requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_LANDSCAPE
        syncAiBoxIpFromSharedSetting()
    }

    override fun onDestroy() {
        disconnectActiveClient("연결 종료")
        super.onDestroy()
    }

    private fun selectedSportFromUi(): SportType {
        return if (binding.longJumpRadioButton.isChecked) {
            SportType.LONG_JUMP
        } else {
            SportType.SQUAT
        }
    }

    private fun connectToSelectedSport(switching: Boolean = false) {
        val host = normalizeHost(binding.aiBoxIpEditText.text?.toString().orEmpty())
        if (host.isBlank()) {
            statusText = "AI BOX IP를 입력하세요."
            renderUi()
            return
        }

        val sport = selectedSportFromUi()
        activeSport = sport

        disconnectActiveClient(if (switching) "종목 전환 중..." else null)

        val token = ++activeConnectionToken
        statusText = if (switching) {
            "${sport.label} 종목으로 전환 중..."
        } else {
            "${sport.label} 연결 중..."
        }
        activeEndpointText = "연결 종목: ${sport.label} (${sport.path})"
        renderUi()

        activeClient = SportWebSocketClient(host, AI_BOX_PORT, sport.path, object : SportWebSocketClient.Listener {
            override fun onOpen() {
                runOnUiThread {
                    if (token != activeConnectionToken) {
                        return@runOnUiThread
                    }
                    isConnected = true
                    statusText = "${sport.label} 연결됨"
                    renderUi()
                    sendControlMessage(start = false)
                }
            }

            override fun onMessage(text: String) {
                runOnUiThread {
                    if (token != activeConnectionToken) {
                        return@runOnUiThread
                    }
                    handleIncomingMessage(text, sport)
                }
            }

            override fun onFailure(reason: String) {
                runOnUiThread {
                    if (token != activeConnectionToken) {
                        return@runOnUiThread
                    }
                    isConnected = false
                    statusText = "연결 오류: $reason"
                    renderUi()
                }
            }

            override fun onClosed() {
                runOnUiThread {
                    if (token != activeConnectionToken) {
                        return@runOnUiThread
                    }
                    isConnected = false
                    statusText = "연결 종료"
                    activeEndpointText = "연결 종목: -"
                    renderUi()
                }
            }
        })
        activeClient?.connect()
    }

    private fun disconnectActiveClient(disconnectMessage: String?) {
        activeConnectionToken += 1
        activeClient?.close()
        activeClient = null
        if (isConnected || disconnectMessage != null) {
            isConnected = false
            if (!disconnectMessage.isNullOrBlank()) {
                statusText = disconnectMessage
            }
            activeEndpointText = "연결 종목: -"
            renderUi()
        }
    }

    private fun sendControlMessage(start: Boolean) {
        if (!isConnected) {
            statusText = "먼저 AI BOX 연결이 필요합니다."
            renderUi()
            return
        }

        val payload = when (activeSport) {
            SportType.SQUAT -> buildSquatPayload(start)
            SportType.LONG_JUMP -> buildLongJumpPayload(start)
        }

        val sent = activeClient?.send(payload) == true
        if (!sent) {
            statusText = "명령 전송 실패"
            renderUi()
            return
        }

        statusText = if (start) {
            "${activeSport.label} 측정 시작 명령 전송"
        } else {
            "${activeSport.label} 측정 중지 명령 전송"
        }
        renderUi()
    }

    private fun buildSquatPayload(start: Boolean): String {
        val statusTemplate = mapOf(
            "PersonCheck" to true,
            "UPhandCheck" to false,
            "HeadImage" to false,
            "Count" to start,
        )
        val statuses = List(5) { statusTemplate }
        return gson.toJson(mapOf("PostStatus" to statuses))
    }

    private fun buildLongJumpPayload(start: Boolean): String {
        val status = mapOf(
            "PersonCheck" to true,
            "HeadImage" to false,
            "UPhandCheck" to false,
            "Measure" to start,
            "SaveImage" to false,
            "SaveVideo" to false,
        )
        return gson.toJson(mapOf("PostStatus" to listOf(status)))
    }

    private fun handleIncomingMessage(raw: String, sport: SportType) {
        binding.rawMessageTextView.text = raw.take(MAX_RAW_TEXT_LENGTH)

        val root = runCatching { JsonParser.parseString(raw) }.getOrNull()
        if (root == null) {
            statusText = "수신 데이터 파싱 실패"
            renderUi()
            return
        }

        when (sport) {
            SportType.SQUAT -> updateSquatResult(root)
            SportType.LONG_JUMP -> updateLongJumpResult(root)
        }

        renderUi()
    }

    private fun updateSquatResult(root: JsonElement) {
        val firstObject = root.asFirstObjectOrNull() ?: return

        squatCount = firstObject.optInt("CountNum", squatCount)
        squatExist = firstObject.optBoolean("Exist", squatExist)
        squatProjectOver = firstObject.optBoolean("ProjectOver", squatProjectOver)

        if (squatProjectOver) {
            statusText = "스쿼트 라운드 종료"
        }
    }

    private fun updateLongJumpResult(root: JsonElement) {
        val obj = root.asObjectOrNull() ?: return

        longJumpDistance = obj.optFloatOrNull("Distance") ?: longJumpDistance
        longJumpGameOver = obj.optBoolean("GameOver", longJumpGameOver)
        longJumpSingleJump = obj.optBoolean("SingleJump", longJumpSingleJump)
        longJumpOnlineJump = obj.optBoolean("OnlineJump", longJumpOnlineJump)
        longJumpFallJump = obj.optBoolean("FallJump", longJumpFallJump)

        if (longJumpGameOver) {
            statusText = "멀리뛰기 라운드 종료"
        }
    }

    private fun renderUi() {
        binding.connectButton.text = if (isConnected) getString(R.string.disconnect) else getString(R.string.connect)
        binding.selectedSportTextView.text = "선택 종목: ${activeSport.label}"
        binding.connectionStatusTextView.text = statusText
        binding.activeEndpointTextView.text = activeEndpointText

        binding.startMeasureButton.isEnabled = isConnected
        binding.stopMeasureButton.isEnabled = isConnected

        binding.squatCountTextView.text = "횟수: $squatCount"
        binding.squatStateTextView.text =
            "상태: 감지=${toKoreanBool(squatExist)}, 종료=${toKoreanBool(squatProjectOver)}"

        val jumpDistanceText = longJumpDistance?.let {
            String.format(Locale.US, "%.1f", it)
        } ?: "-"
        binding.longJumpDistanceTextView.text = "거리: $jumpDistanceText"
        binding.longJumpFlagsTextView.text = "상태: 종료=${toKoreanBool(longJumpGameOver)}, " +
            "단발=${toKoreanBool(longJumpSingleJump)}, " +
            "라인=${toKoreanBool(longJumpOnlineJump)}, " +
            "낙하=${toKoreanBool(longJumpFallJump)}"
    }

    private fun toKoreanBool(value: Boolean): String = if (value) "예" else "아니오"

    private fun syncAiBoxIpFromSharedSetting() {
        val sharedIp = SharedAiBoxIpResolver.read(this) ?: return
        val current = binding.aiBoxIpEditText.text?.toString()?.trim().orEmpty()
        if (current != sharedIp) {
            binding.aiBoxIpEditText.setText(sharedIp)
        }
    }

    private fun normalizeHost(raw: String): String {
        return raw.trim()
            .removePrefix("ws://")
            .removePrefix("wss://")
            .substringBefore('/')
            .substringBefore(':')
            .trim()
    }

    private fun navigateToHomeScreen() {
        disconnectActiveClient("연결 종료")
        startActivity(
            Intent(Intent.ACTION_MAIN).apply {
                addCategory(Intent.CATEGORY_HOME)
                flags = Intent.FLAG_ACTIVITY_NEW_TASK
            },
        )
    }

    private enum class SportType(val label: String, val path: String) {
        SQUAT(label = "스쿼트", path = "/DeepSquat/Start"),
        LONG_JUMP(label = "멀리뛰기", path = "/Standjump/Start"),
    }

    companion object {
        private const val AI_BOX_PORT = 8888
        private const val MAX_RAW_TEXT_LENGTH = 800
    }
}

private class SportWebSocketClient(
    host: String,
    port: Int,
    path: String,
    private val listener: Listener,
) {

    interface Listener {
        fun onOpen()
        fun onMessage(text: String)
        fun onFailure(reason: String)
        fun onClosed()
    }

    private val webSocketUrl = "ws://$host:$port$path"
    private var webSocket: WebSocket? = null

    fun connect() {
        val request = Request.Builder()
            .url(webSocketUrl)
            .build()

        webSocket = sharedClient.newWebSocket(request, object : WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: Response) {
                listener.onOpen()
            }

            override fun onMessage(webSocket: WebSocket, text: String) {
                listener.onMessage(text)
            }

            override fun onClosing(webSocket: WebSocket, code: Int, reason: String) {
                webSocket.close(code, reason)
                listener.onClosed()
            }

            override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                listener.onClosed()
            }

            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                listener.onFailure(t.message ?: "websocket failure")
            }
        })
    }

    fun send(payload: String): Boolean {
        return webSocket?.send(payload) == true
    }

    fun close() {
        webSocket?.close(1000, "client close")
        webSocket = null
    }

    companion object {
        private val sharedClient: OkHttpClient = OkHttpClient.Builder()
            .pingInterval(20, TimeUnit.SECONDS)
            .build()
    }
}

private fun JsonElement.asFirstObjectOrNull(): JsonObject? {
    return when {
        isJsonObject -> asJsonObject
        isJsonArray -> {
            val array = asJsonArray
            if (array.size() == 0) {
                null
            } else {
                array[0].asObjectOrNull()
            }
        }

        else -> null
    }
}

private fun JsonElement.asObjectOrNull(): JsonObject? {
    return if (isJsonObject) asJsonObject else null
}

private fun JsonObject.optBoolean(key: String, default: Boolean = false): Boolean {
    val value = get(key) ?: return default
    return runCatching { value.asBoolean }.getOrDefault(default)
}

private fun JsonObject.optInt(key: String, default: Int = 0): Int {
    val value = get(key) ?: return default
    return runCatching { value.asInt }.getOrDefault(default)
}

private fun JsonObject.optFloatOrNull(key: String): Float? {
    val value = get(key) ?: return null
    return runCatching { value.asFloat }.getOrNull()
}
