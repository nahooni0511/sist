package com.sistrun.standhold.net

import com.google.gson.Gson
import java.io.BufferedReader
import java.io.BufferedWriter
import java.io.InputStreamReader
import java.io.OutputStreamWriter
import java.net.InetSocketAddress
import java.net.Socket
import java.util.concurrent.atomic.AtomicReference

sealed interface AiBoxEvent {
    data class Connected(val host: String, val port: Int) : AiBoxEvent
    data class Message(val payload: StreamMessage) : AiBoxEvent
    data class Error(val reason: String) : AiBoxEvent
    data object Disconnected : AiBoxEvent
}

class AiBoxSocketClient {

    private val gson = Gson()
    private val socketRef = AtomicReference<Socket?>(null)
    private val writerRef = AtomicReference<BufferedWriter?>(null)
    private val writeLock = Any()

    fun disconnect() {
        runCatching { socketRef.getAndSet(null)?.close() }
        writerRef.set(null)
    }

    fun sendCommand(payload: Map<String, Any?>): Boolean {
        val json = gson.toJson(payload)
        return sendRawJson(json)
    }

    fun sendRawJson(rawJson: String): Boolean {
        val writer = writerRef.get() ?: return false
        return runCatching {
            synchronized(writeLock) {
                writer.write(rawJson)
                writer.newLine()
                writer.flush()
            }
        }.isSuccess
    }

    suspend fun connect(host: String, port: Int, onEvent: (AiBoxEvent) -> Unit) {
        val localSocket = Socket()
        var connected = false
        try {
            localSocket.connect(InetSocketAddress(host, port), CONNECT_TIMEOUT_MS)
            socketRef.set(localSocket)
            connected = true

            val writer = BufferedWriter(OutputStreamWriter(localSocket.getOutputStream()))
            writerRef.set(writer)

            onEvent(AiBoxEvent.Connected(host, port))
            sendRawJson(HELLO_MESSAGE)

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
            writerRef.set(null)
            socketRef.set(null)
            runCatching { localSocket.close() }
        }
    }

    companion object {
        private const val CONNECT_TIMEOUT_MS = 5_000
        private const val HELLO_MESSAGE = "{\"type\":\"hello\",\"client\":\"sist_stand_hold\",\"version\":\"0.1.0\"}"
    }
}
