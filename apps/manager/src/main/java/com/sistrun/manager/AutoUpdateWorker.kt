package com.sistrun.manager

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.Worker
import androidx.work.WorkerParameters
import com.sistrun.manager.ipc.CoreDpcBlockingClient
import com.sistrun.manager.market.DeviceCommand
import com.sistrun.manager.market.ApiClient
import com.sistrun.manager.settings.ManagerPrefs
import org.json.JSONObject
import java.util.concurrent.TimeUnit

class AutoUpdateWorker(
    context: Context,
    params: WorkerParameters
) : Worker(context, params) {

    override fun doWork(): Result {
        val config = ManagerPrefs.load(applicationContext)
        if (!config.autoUpdateEnabled) {
            return Result.success()
        }

        return try {
            val installedVersions = fetchInstalledVersionsFromCoreDpc()
            val updateResult = ApiClient.checkUpdates(config.serverUrl, config.deviceId, installedVersions)
            ManagerPrefs.applyServerSettings(applicationContext, updateResult.settings)

            if (updateResult.updates.isNotEmpty()) {
                val taskCount = CoreDpcBlockingClient.call(applicationContext) { service ->
                    updateResult.updates.forEach { candidate ->
                        val metadata = JSONObject().apply {
                            put("source", "auto_update_worker")
                            put("changelog", candidate.changelog)
                        }.toString()

                        if (candidate.installedVersionCode < 0) {
                            service.requestInstall(
                                candidate.packageName,
                                candidate.targetVersionCode,
                                candidate.downloadUrl,
                                candidate.sha256,
                                metadata
                            )
                        } else {
                            service.requestUpdate(
                                candidate.packageName,
                                candidate.targetVersionCode,
                                candidate.downloadUrl,
                                candidate.sha256,
                                metadata
                            )
                        }
                    }
                    updateResult.updates.size
                } ?: 0

                notifyUpdates(taskCount)
            }

            runPendingCommands(config.serverUrl, config.deviceId)

            Result.success()
        } catch (_: Exception) {
            Result.retry()
        }
    }

    private fun fetchInstalledVersionsFromCoreDpc(): Map<String, Int> {
        return CoreDpcBlockingClient.call(applicationContext) { service ->
            service.listInstalledManagedApps()
                .filter { it.installed }
                .associate { it.packageName to it.versionCode }
        } ?: emptyMap()
    }

    private fun notifyUpdates(count: Int) {
        createChannelIfNeeded()

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(applicationContext, Manifest.permission.POST_NOTIFICATIONS)
            != PackageManager.PERMISSION_GRANTED
        ) {
            return
        }

        val launchIntent = Intent(applicationContext, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            putExtra(EXTRA_CHECK_UPDATES_NOW, true)
        }
        val flags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        } else {
            PendingIntent.FLAG_UPDATE_CURRENT
        }
        val pendingIntent = PendingIntent.getActivity(applicationContext, 1001, launchIntent, flags)

        val notification = NotificationCompat.Builder(applicationContext, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.stat_sys_download_done)
            .setContentTitle("Sistrun Manager")
            .setContentText("core_dpc로 자동업데이트 작업 ${count}개를 전달했습니다.")
            .setContentIntent(pendingIntent)
            .setAutoCancel(true)
            .build()

        NotificationManagerCompat.from(applicationContext).notify(9001, notification)
    }

    private fun runPendingCommands(serverUrl: String, deviceId: String) {
        val commands = ApiClient.pullCommands(serverUrl, deviceId, max = 10)
        Log.i(COMMAND_TAG, "Pulled ${commands.size} command(s) for device=$deviceId")
        commands.forEach { command ->
            Log.i(COMMAND_TAG, "Executing command id=${command.id} type=${command.type}")
            val result = executeCommand(command)
            ApiClient.reportCommandResult(
                serverUrl = serverUrl,
                deviceId = deviceId,
                commandId = command.id,
                status = result.status,
                resultMessage = result.message,
                resultCode = result.code
            )
            Log.i(COMMAND_TAG, "Reported command id=${command.id} status=${result.status} code=${result.code}")
        }
    }

    private fun executeCommand(command: DeviceCommand): CommandExecutionResult {
        return try {
            val payload = JSONObject(command.payloadJson)
            when (command.type) {
                "INSTALL_APP", "UPDATE_APP" -> {
                    val packageName = payload.optString("packageName")
                    val versionCode = payload.optInt("versionCode", -1)
                    val url = payload.optString("url")
                    val sha256 = payload.optString("sha256")
                    val metadata = payload.optJSONObject("metadata")?.toString() ?: "{}"

                    if (packageName.isBlank() || versionCode <= 0 || url.isBlank()) {
                        return CommandExecutionResult("FAILED", -10, "Invalid install/update payload")
                    }

                    val taskId = CoreDpcBlockingClient.call(applicationContext) { service ->
                        if (command.type == "INSTALL_APP") {
                            service.requestInstall(packageName, versionCode, url, sha256, metadata)
                        } else {
                            service.requestUpdate(packageName, versionCode, url, sha256, metadata)
                        }
                    }
                    if (taskId.isNullOrBlank()) {
                        CommandExecutionResult("FAILED", -11, "core_dpc IPC failed")
                    } else {
                        CommandExecutionResult("SUCCESS", 0, "Task queued: $taskId")
                    }
                }

                "REBOOT" -> {
                    val reason = payload.optString("reason", "remote-command")
                    val status = CoreDpcBlockingClient.call(applicationContext) { service ->
                        service.requestReboot(reason)
                    } ?: return CommandExecutionResult("FAILED", -12, "core_dpc IPC failed")

                    if (status.status == "FAILED") {
                        CommandExecutionResult("FAILED", status.resultCode, status.message)
                    } else {
                        CommandExecutionResult("SUCCESS", status.resultCode, status.message)
                    }
                }

                "APPLY_POLICY" -> {
                    val status = CoreDpcBlockingClient.call(applicationContext) { service ->
                        service.applyBaselinePolicy()
                    } ?: return CommandExecutionResult("FAILED", -13, "core_dpc IPC failed")

                    if (status.status == "FAILED") {
                        CommandExecutionResult("FAILED", status.resultCode, status.message)
                    } else {
                        CommandExecutionResult("SUCCESS", status.resultCode, status.message)
                    }
                }

                else -> CommandExecutionResult("FAILED", -14, "Unsupported command type: ${command.type}")
            }
        } catch (e: Exception) {
            CommandExecutionResult("FAILED", -15, e.message ?: "Command execution error")
        }
    }

    private fun createChannelIfNeeded() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            return
        }

        val manager = applicationContext.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        val existing = manager.getNotificationChannel(CHANNEL_ID)
        if (existing != null) {
            return
        }

        manager.createNotificationChannel(
            NotificationChannel(
                CHANNEL_ID,
                "Auto Updates",
                NotificationManager.IMPORTANCE_DEFAULT
            )
        )
    }

    companion object {
        private const val UNIQUE_WORK_NAME = "sistrun-auto-update-check"
        private const val CHANNEL_ID = "sistrun-manager-updates"
        private const val COMMAND_TAG = "COMMAND_AGENT"
        const val EXTRA_CHECK_UPDATES_NOW = "extra_check_updates_now"

        fun schedule(context: Context) {
            val constraints = Constraints.Builder()
                .setRequiredNetworkType(NetworkType.CONNECTED)
                .build()

            val request = PeriodicWorkRequestBuilder<AutoUpdateWorker>(6, TimeUnit.HOURS)
                .setConstraints(constraints)
                .build()

            WorkManager.getInstance(context).enqueueUniquePeriodicWork(
                UNIQUE_WORK_NAME,
                ExistingPeriodicWorkPolicy.UPDATE,
                request
            )
        }
    }
}

private data class CommandExecutionResult(
    val status: String,
    val code: Int,
    val message: String
)
