package com.sistrun.appstoreinstaller.download

import android.content.Context
import org.json.JSONObject

object DownloadStatusStore {
  private const val PREF_NAME = "app_store_download_status"

  private fun prefs(context: Context) =
    context.getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE)

  fun writeStatus(
    context: Context,
    taskId: String,
    status: String,
    bytesDownloaded: Long,
    totalBytes: Long,
    outputUri: String? = null,
    errorMessage: String? = null
  ) {
    val json = JSONObject()
      .put("taskId", taskId)
      .put("status", status)
      .put("bytesDownloaded", bytesDownloaded)
      .put("totalBytes", totalBytes)
      .put("outputUri", outputUri)
      .put("errorMessage", errorMessage)

    prefs(context).edit().putString(taskId, json.toString()).apply()
  }

  fun readStatus(context: Context, taskId: String): JSONObject? {
    val raw = prefs(context).getString(taskId, null) ?: return null
    return try {
      JSONObject(raw)
    } catch (_: Throwable) {
      null
    }
  }
}
