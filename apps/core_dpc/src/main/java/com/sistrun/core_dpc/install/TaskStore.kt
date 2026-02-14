package com.sistrun.core_dpc.install

import android.content.Context
import com.sistrun.core_dpc.ipc.TaskStatusInfo
import com.sistrun.core_dpc.model.InstallTaskRecord
import com.sistrun.core_dpc.model.TaskState
import com.sistrun.core_dpc.model.TaskType
import org.json.JSONArray
import org.json.JSONObject
import java.util.UUID

class TaskStore(context: Context) {

    private val prefs = context.getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE)

    @Synchronized
    fun createTask(
        taskType: TaskType,
        packageName: String,
        targetVersionCode: Int,
        downloadUrl: String,
        sha256: String,
        metadataJson: String
    ): InstallTaskRecord {
        val now = System.currentTimeMillis()
        val record = InstallTaskRecord(
            taskId = UUID.randomUUID().toString(),
            taskType = taskType,
            packageName = packageName,
            targetVersionCode = targetVersionCode,
            downloadUrl = downloadUrl,
            sha256 = sha256,
            metadataJson = metadataJson,
            status = TaskState.PENDING,
            progress = 0,
            resultCode = 0,
            message = "Task queued",
            retryCount = 0,
            createdAt = now,
            updatedAt = now
        )
        persist(record)
        addToIndex(record.taskId)
        return record
    }

    @Synchronized
    fun getTask(taskId: String): InstallTaskRecord? {
        val raw = prefs.getString(taskKey(taskId), null) ?: return null
        return runCatching { fromJson(JSONObject(raw)) }.getOrNull()
    }

    @Synchronized
    fun getTaskStatus(taskId: String): TaskStatusInfo? {
        val task = getTask(taskId) ?: return null
        return task.toStatusInfo()
    }

    @Synchronized
    fun updateTask(taskId: String, mutate: (InstallTaskRecord) -> InstallTaskRecord): InstallTaskRecord? {
        val current = getTask(taskId) ?: return null
        val updated = mutate(current).copy(updatedAt = System.currentTimeMillis())
        persist(updated)
        return updated
    }

    @Synchronized
    fun recentTasks(limit: Int): List<InstallTaskRecord> {
        val ids = index().take(limit)
        return ids.mapNotNull { getTask(it) }
    }

    private fun persist(record: InstallTaskRecord) {
        prefs.edit().putString(taskKey(record.taskId), toJson(record).toString()).apply()
    }

    private fun addToIndex(taskId: String) {
        val ids = index().toMutableList()
        ids.remove(taskId)
        ids.add(0, taskId)
        prefs.edit().putString(KEY_INDEX, JSONArray(ids).toString()).apply()
    }

    private fun index(): List<String> {
        val raw = prefs.getString(KEY_INDEX, null) ?: return emptyList()
        val array = runCatching { JSONArray(raw) }.getOrElse { JSONArray() }
        return buildList {
            for (i in 0 until array.length()) {
                add(array.optString(i))
            }
        }
    }

    private fun toJson(record: InstallTaskRecord): JSONObject {
        return JSONObject().apply {
            put("taskId", record.taskId)
            put("taskType", record.taskType.name)
            put("packageName", record.packageName)
            put("targetVersionCode", record.targetVersionCode)
            put("downloadUrl", record.downloadUrl)
            put("sha256", record.sha256)
            put("metadataJson", record.metadataJson)
            put("status", record.status.name)
            put("progress", record.progress)
            put("resultCode", record.resultCode)
            put("message", record.message)
            put("retryCount", record.retryCount)
            put("createdAt", record.createdAt)
            put("updatedAt", record.updatedAt)
        }
    }

    private fun fromJson(json: JSONObject): InstallTaskRecord {
        return InstallTaskRecord(
            taskId = json.optString("taskId"),
            taskType = TaskType.valueOf(json.optString("taskType", TaskType.INSTALL.name)),
            packageName = json.optString("packageName"),
            targetVersionCode = json.optInt("targetVersionCode", -1),
            downloadUrl = json.optString("downloadUrl"),
            sha256 = json.optString("sha256"),
            metadataJson = json.optString("metadataJson"),
            status = TaskState.valueOf(json.optString("status", TaskState.PENDING.name)),
            progress = json.optInt("progress", 0),
            resultCode = json.optInt("resultCode", 0),
            message = json.optString("message"),
            retryCount = json.optInt("retryCount", 0),
            createdAt = json.optLong("createdAt"),
            updatedAt = json.optLong("updatedAt")
        )
    }

    private fun InstallTaskRecord.toStatusInfo(): TaskStatusInfo {
        return TaskStatusInfo(
            taskId = taskId,
            taskType = taskType.name,
            packageName = packageName,
            targetVersionCode = targetVersionCode,
            status = status.name,
            progress = progress,
            resultCode = resultCode,
            message = message,
            updatedAt = updatedAt
        )
    }

    private fun taskKey(taskId: String): String = "task_$taskId"

    companion object {
        private const val PREF_NAME = "core_dpc_task_store"
        private const val KEY_INDEX = "task_index"
    }
}
