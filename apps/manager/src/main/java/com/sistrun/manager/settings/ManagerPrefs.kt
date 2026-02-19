package com.sistrun.manager.settings

import android.content.Context
import android.provider.Settings
import org.json.JSONObject
import java.util.UUID

data class ManagerConfig(
    val serverUrl: String,
    val deviceId: String,
    val aiBoxIp: String,
    val autoUpdateEnabled: Boolean,
    val extras: Map<String, String>
)

object ManagerPrefs {
    private const val PREF_NAME = "manager_config"
    private const val KEY_SERVER_URL = "server_url"
    private const val KEY_DEVICE_ID = "device_id"
    private const val KEY_AI_BOX_IP = "ai_box_ip"
    private const val KEY_AUTO_UPDATE = "auto_update"
    private const val KEY_EXTRA_JSON = "extra_json"

    private const val DEFAULT_SERVER_URL = "http://192.168.68.66:4000"
    private const val DEFAULT_AI_BOX_IP = "192.168.0.10"

    fun load(context: Context): ManagerConfig {
        val prefs = context.getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE)
        val serverUrl = prefs.getString(KEY_SERVER_URL, DEFAULT_SERVER_URL).orEmpty()
        val deviceId = prefs.getString(KEY_DEVICE_ID, null) ?: createDefaultDeviceId(context)
        val aiBoxIp = prefs.getString(KEY_AI_BOX_IP, DEFAULT_AI_BOX_IP).orEmpty()
        val autoUpdate = prefs.getBoolean(KEY_AUTO_UPDATE, true)
        val extras = parseExtras(prefs.getString(KEY_EXTRA_JSON, "{}"))

        if (!prefs.contains(KEY_DEVICE_ID)) {
            prefs.edit().putString(KEY_DEVICE_ID, deviceId).apply()
        }

        return ManagerConfig(
            serverUrl = serverUrl,
            deviceId = deviceId,
            aiBoxIp = aiBoxIp,
            autoUpdateEnabled = autoUpdate,
            extras = extras
        )
    }

    fun save(
        context: Context,
        serverUrl: String,
        deviceId: String,
        aiBoxIp: String,
        autoUpdateEnabled: Boolean,
        extras: Map<String, String>
    ) {
        context.getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE)
            .edit()
            .putString(KEY_SERVER_URL, serverUrl.trim())
            .putString(KEY_DEVICE_ID, deviceId.trim())
            .putString(KEY_AI_BOX_IP, aiBoxIp.trim())
            .putBoolean(KEY_AUTO_UPDATE, autoUpdateEnabled)
            .putString(KEY_EXTRA_JSON, JSONObject(extras).toString())
            .apply()
    }

    fun applyServerSettings(context: Context, serverSettings: Map<String, String>) {
        if (serverSettings.isEmpty()) {
            return
        }
        val current = load(context)
        val nextServerUrl = serverSettings["API_BASE_URL"] ?: current.serverUrl
        val nextAiBoxIp = serverSettings["AI_BOX_IP"] ?: current.aiBoxIp

        val mutableExtras = current.extras.toMutableMap()
        serverSettings.forEach { (key, value) ->
            if (key != "API_BASE_URL" && key != "AI_BOX_IP") {
                mutableExtras[key] = value
            }
        }

        save(
            context = context,
            serverUrl = nextServerUrl,
            deviceId = current.deviceId,
            aiBoxIp = nextAiBoxIp,
            autoUpdateEnabled = current.autoUpdateEnabled,
            extras = mutableExtras
        )
    }

    fun sharedSettings(context: Context): Map<String, String> {
        val config = load(context)
        val values = mutableMapOf<String, String>()
        values[SHARED_KEY_API_BASE_URL] = config.serverUrl
        values[SHARED_KEY_DEVICE_ID] = config.deviceId
        values[SHARED_KEY_AI_BOX_IP] = config.aiBoxIp
        values.putAll(config.extras)
        return values
    }

    fun updateSharedSetting(context: Context, key: String, value: String): Boolean {
        val normalizedKey = key.trim()
        if (normalizedKey.isBlank()) {
            return false
        }

        val current = load(context)
        return when (normalizedKey) {
            SHARED_KEY_API_BASE_URL -> {
                save(
                    context = context,
                    serverUrl = value,
                    deviceId = current.deviceId,
                    aiBoxIp = current.aiBoxIp,
                    autoUpdateEnabled = current.autoUpdateEnabled,
                    extras = current.extras
                )
                true
            }

            SHARED_KEY_DEVICE_ID -> {
                save(
                    context = context,
                    serverUrl = current.serverUrl,
                    deviceId = value,
                    aiBoxIp = current.aiBoxIp,
                    autoUpdateEnabled = current.autoUpdateEnabled,
                    extras = current.extras
                )
                true
            }

            SHARED_KEY_AI_BOX_IP -> {
                save(
                    context = context,
                    serverUrl = current.serverUrl,
                    deviceId = current.deviceId,
                    aiBoxIp = value,
                    autoUpdateEnabled = current.autoUpdateEnabled,
                    extras = current.extras
                )
                true
            }

            else -> {
                val extras = current.extras.toMutableMap()
                extras[normalizedKey] = value
                save(
                    context = context,
                    serverUrl = current.serverUrl,
                    deviceId = current.deviceId,
                    aiBoxIp = current.aiBoxIp,
                    autoUpdateEnabled = current.autoUpdateEnabled,
                    extras = extras
                )
                true
            }
        }
    }

    fun extrasToMultiline(extras: Map<String, String>): String {
        return extras.entries
            .sortedBy { it.key }
            .joinToString(separator = "\n") { "${it.key}=${it.value}" }
    }

    fun multilineToExtras(multiline: String): Map<String, String> {
        val map = mutableMapOf<String, String>()
        multiline.lines().forEach { line ->
            val trimmed = line.trim()
            if (trimmed.isBlank() || !trimmed.contains("=")) {
                return@forEach
            }
            val index = trimmed.indexOf('=')
            val key = trimmed.substring(0, index).trim()
            val value = trimmed.substring(index + 1).trim()
            if (key.isNotBlank()) {
                map[key] = value
            }
        }
        return map
    }

    private fun parseExtras(raw: String?): Map<String, String> {
        if (raw.isNullOrBlank()) {
            return emptyMap()
        }

        return try {
            val json = JSONObject(raw)
            buildMap {
                val keys = json.keys()
                while (keys.hasNext()) {
                    val key = keys.next()
                    put(key, json.optString(key, ""))
                }
            }
        } catch (_: Exception) {
            emptyMap()
        }
    }

    private fun createDefaultDeviceId(context: Context): String {
        val androidId = Settings.Secure.getString(context.contentResolver, Settings.Secure.ANDROID_ID)
        if (!androidId.isNullOrBlank()) {
            return "device-$androidId"
        }
        return "device-${UUID.randomUUID()}"
    }

    const val SHARED_KEY_API_BASE_URL = "API_BASE_URL"
    const val SHARED_KEY_DEVICE_ID = "DEVICE_ID"
    const val SHARED_KEY_AI_BOX_IP = "AI_BOX_IP"
}
