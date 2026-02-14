package com.sistrun.dance.net

import java.io.BufferedReader
import java.io.BufferedWriter
import java.io.InputStreamReader
import java.io.OutputStreamWriter
import java.net.InetSocketAddress
import java.net.Socket

sealed interface AiBoxEvent {
    data class Connected(val host: String, val port: Int) : AiBoxEvent
    data class Message(val payload: StreamMessage) : AiBoxEvent
    data class Error(val reason: String) : AiBoxEvent
    data object Disconnected : AiBoxEvent
}

class AiBoxSocketClient {

    @Volatile
    private var socket: Socket? = null

    fun disconnect() {
        runCatching { socket?.close() }
        socket = null
    }

    suspend fun connect(host: String, port: Int, onEvent: (AiBoxEvent) -> Unit) {
        val localSocket = Socket()
        var connected = false
        try {
            localSocket.connect(InetSocketAddress(host, port), CONNECT_TIMEOUT_MS)
            socket = localSocket
            connected = true
            onEvent(AiBoxEvent.Connected(host, port))

            val writer = BufferedWriter(OutputStreamWriter(localSocket.getOutputStream()))
            writer.write(HELLO_MESSAGE)
            writer.newLine()
            writer.flush()

            val reader = BufferedReader(InputStreamReader(localSocket.getInputStream()))
            while (!localSocket.isClosed) {
                val line = reader.readLine() ?: break
                if (line.isBlank()) {
                    continue
                }
                onEvent(AiBoxEvent.Message(StreamMessageParser.parse(line)))
            }
        } catch (exception: Exception) {
            onEvent(AiBoxEvent.Error(exception.message ?: "Socket connection failed"))
        } finally {
            if (connected) {
                onEvent(AiBoxEvent.Disconnected)
            }
            runCatching { localSocket.close() }
            socket = null
        }
    }

    companion object {
        private const val CONNECT_TIMEOUT_MS = 5_000
        private const val HELLO_MESSAGE = "{\"type\":\"hello\",\"client\":\"sistrun-dance\",\"version\":\"0.1.0\"}"
    }
}
