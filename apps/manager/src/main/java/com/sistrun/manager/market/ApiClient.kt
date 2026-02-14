package com.sistrun.manager.market

import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.io.IOException
import java.util.concurrent.TimeUnit

object ApiClient {
    private val client: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .writeTimeout(30, TimeUnit.SECONDS)
        .build()

    fun fetchMarketApps(serverUrl: String, installedVersions: Map<String, Int>): List<MarketApp> {
        val endpoint = normalize(serverUrl) + "/api/apps"
        val request = Request.Builder().url(endpoint).get().build()
        client.newCall(request).execute().use { response ->
            if (!response.isSuccessful) {
                throw IOException("Failed to fetch apps: ${response.code}")
            }
            val body = response.body?.string().orEmpty()
            val json = JSONObject(body)
            val apps = json.optJSONArray("apps") ?: JSONArray()
            val result = mutableListOf<MarketApp>()

            for (i in 0 until apps.length()) {
                val app = apps.optJSONObject(i) ?: continue
                val latest = app.optJSONObject("latestRelease") ?: continue
                val packageName = app.optString("packageName")
                val installedVersionCode = installedVersions[packageName] ?: -1

                result += MarketApp(
                    appId = app.optString("appId"),
                    packageName = packageName,
                    displayName = app.optString("displayName"),
                    latestVersionName = latest.optString("versionName"),
                    latestVersionCode = latest.optInt("versionCode", -1),
                    changelog = latest.optString("changelog"),
                    autoUpdate = latest.optBoolean("autoUpdate", false),
                    downloadUrl = latest.optString("downloadUrl"),
                    sha256 = latest.optString("sha256"),
                    installedVersionCode = installedVersionCode
                )
            }

            return result.sortedBy { it.displayName }
        }
    }

    fun fetchSettings(serverUrl: String): Map<String, String> {
        val endpoint = normalize(serverUrl) + "/api/settings"
        val request = Request.Builder().url(endpoint).get().build()
        client.newCall(request).execute().use { response ->
            if (!response.isSuccessful) {
                throw IOException("Failed to fetch settings: ${response.code}")
            }

            val body = response.body?.string().orEmpty()
            val json = JSONObject(body)
            val settingsJson = json.optJSONObject("settings") ?: JSONObject()
            return jsonObjectToMap(settingsJson)
        }
    }

    fun checkUpdates(serverUrl: String, deviceId: String, installedVersions: Map<String, Int>): UpdateCheckResult {
        val endpoint = normalize(serverUrl) + "/api/devices/check-updates"
        val packages = JSONArray()
        installedVersions.forEach { (packageName, versionCode) ->
            packages.put(
                JSONObject().apply {
                    put("packageName", packageName)
                    put("versionCode", versionCode)
                }
            )
        }

        val payload = JSONObject().apply {
            put("deviceId", deviceId)
            put("packages", packages)
        }

        val request = Request.Builder()
            .url(endpoint)
            .post(payload.toString().toRequestBody("application/json".toMediaType()))
            .build()

        client.newCall(request).execute().use { response ->
            if (!response.isSuccessful) {
                throw IOException("Failed to check updates: ${response.code}")
            }

            val body = response.body?.string().orEmpty()
            val json = JSONObject(body)
            val settings = jsonObjectToMap(json.optJSONObject("settings") ?: JSONObject())
            val updatesJson = json.optJSONArray("updates") ?: JSONArray()
            val updates = mutableListOf<UpdateCandidate>()

            for (index in 0 until updatesJson.length()) {
                val item = updatesJson.optJSONObject(index) ?: continue
                updates += UpdateCandidate(
                    appId = item.optString("appId"),
                    displayName = item.optString("displayName"),
                    packageName = item.optString("packageName"),
                    installedVersionCode = item.optInt("installedVersionCode", -1),
                    targetVersionCode = item.optInt("targetVersionCode", -1),
                    targetVersionName = item.optString("targetVersionName"),
                    changelog = item.optString("changelog"),
                    downloadUrl = item.optString("downloadUrl"),
                    sha256 = item.optString("sha256")
                )
            }

            return UpdateCheckResult(settings = settings, updates = updates)
        }
    }

    fun pullCommands(serverUrl: String, deviceId: String, max: Int = 5): List<DeviceCommand> {
        val endpoint = normalize(serverUrl) + "/api/devices/$deviceId/commands/pull"
        val payload = JSONObject().apply {
            put("max", max)
        }
        val request = Request.Builder()
            .url(endpoint)
            .post(payload.toString().toRequestBody("application/json".toMediaType()))
            .build()

        client.newCall(request).execute().use { response ->
            if (!response.isSuccessful) {
                throw IOException("Failed to pull commands: ${response.code}")
            }
            val body = response.body?.string().orEmpty()
            val json = JSONObject(body)
            val array = json.optJSONArray("commands") ?: JSONArray()
            val commands = mutableListOf<DeviceCommand>()
            for (index in 0 until array.length()) {
                val item = array.optJSONObject(index) ?: continue
                commands += DeviceCommand(
                    id = item.optString("id"),
                    type = item.optString("type"),
                    payloadJson = item.optJSONObject("payload")?.toString() ?: "{}"
                )
            }
            return commands
        }
    }

    fun reportCommandResult(
        serverUrl: String,
        deviceId: String,
        commandId: String,
        status: String,
        resultMessage: String,
        resultCode: Int
    ) {
        val endpoint = normalize(serverUrl) + "/api/devices/$deviceId/commands/$commandId/result"
        val payload = JSONObject().apply {
            put("status", status)
            put("resultMessage", resultMessage)
            put("resultCode", resultCode)
        }
        val request = Request.Builder()
            .url(endpoint)
            .post(payload.toString().toRequestBody("application/json".toMediaType()))
            .build()

        client.newCall(request).execute().use { response ->
            if (!response.isSuccessful) {
                throw IOException("Failed to report command result: ${response.code}")
            }
        }
    }

    fun normalize(url: String): String = url.trim().removeSuffix("/")

    private fun jsonObjectToMap(obj: JSONObject): Map<String, String> {
        val map = mutableMapOf<String, String>()
        val keys = obj.keys()
        while (keys.hasNext()) {
            val key = keys.next()
            map[key] = obj.optString(key, "")
        }
        return map
    }
}
