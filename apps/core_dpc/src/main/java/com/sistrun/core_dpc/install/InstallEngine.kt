package com.sistrun.core_dpc.install

import android.app.PendingIntent
import android.app.admin.DevicePolicyManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageInstaller
import android.os.Build
import android.util.Log
import com.sistrun.core_dpc.admin.CoreDeviceAdminReceiver
import com.sistrun.core_dpc.model.InstallTaskRecord
import com.sistrun.core_dpc.model.TaskState
import com.sistrun.core_dpc.model.TaskType
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONObject
import java.io.File
import java.io.IOException
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

class InstallEngine(
    private val context: Context,
    private val taskStore: TaskStore,
    private val managedAppRegistry: ManagedAppRegistry
) {

    private val executor: ExecutorService = Executors.newSingleThreadExecutor()
    private val httpClient = OkHttpClient.Builder().build()

    fun requestInstall(
        packageName: String,
        versionCode: Int,
        url: String,
        sha256: String,
        metadataJson: String,
        taskType: TaskType
    ): String {
        val task = taskStore.createTask(
            taskType = taskType,
            packageName = packageName,
            targetVersionCode = versionCode,
            downloadUrl = url,
            sha256 = sha256,
            metadataJson = metadataJson
        )
        managedAppRegistry.register(packageName)
        executeTask(task.taskId)
        return task.taskId
    }

    fun requestUninstall(packageName: String): String {
        val task = taskStore.createTask(
            taskType = TaskType.UNINSTALL,
            packageName = packageName,
            targetVersionCode = -1,
            downloadUrl = "",
            sha256 = "",
            metadataJson = ""
        )
        executeTask(task.taskId)
        return task.taskId
    }

    private fun executeTask(taskId: String) {
        executor.execute {
            val task = taskStore.getTask(taskId) ?: return@execute
            when (task.taskType) {
                TaskType.INSTALL, TaskType.UPDATE -> performInstallTask(task)
                TaskType.UNINSTALL -> performUninstallTask(task)
                else -> markFailed(task, ERR_UNKNOWN_TASK, "Unsupported task type")
            }
        }
    }

    private fun performInstallTask(task: InstallTaskRecord) {
        val dpm = context.getSystemService(DevicePolicyManager::class.java)
        val admin = android.content.ComponentName(context, CoreDeviceAdminReceiver::class.java)
        val isDeviceOwner = dpm?.isAdminActive(admin) == true && dpm.isDeviceOwnerApp(context.packageName)
        if (!isDeviceOwner) {
            markFailed(task, ERR_NOT_DEVICE_OWNER, "Device Owner not ready")
            return
        }

        runWithRetry(task) {
            updateRunning(task.taskId, 5, "Downloading APK")
            val apkFile = downloadApk(task)

            updateRunning(task.taskId, 60, "Verifying APK hash")
            verifySha256(task, apkFile)

            updateRunning(task.taskId, 70, "Verifying APK metadata")
            verifyArchive(task, apkFile)

            updateRunning(task.taskId, 80, "Committing install session")
            commitInstallSession(task, apkFile)
        }
    }

    private fun performUninstallTask(task: InstallTaskRecord) {
        val dpm = context.getSystemService(DevicePolicyManager::class.java)
        val admin = android.content.ComponentName(context, CoreDeviceAdminReceiver::class.java)
        val isDeviceOwner = dpm?.isAdminActive(admin) == true && dpm.isDeviceOwnerApp(context.packageName)
        if (!isDeviceOwner) {
            markFailed(task, ERR_NOT_DEVICE_OWNER, "Device Owner not ready")
            return
        }

        runWithRetry(task) {
            updateRunning(task.taskId, 40, "Requesting uninstall")
            val intent = Intent(context, InstallResultReceiver::class.java).apply {
                action = InstallResultReceiver.ACTION_INSTALL_RESULT
                putExtra(InstallResultReceiver.EXTRA_TASK_ID, task.taskId)
            }
            val flags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            } else {
                PendingIntent.FLAG_UPDATE_CURRENT
            }
            val pendingIntent = PendingIntent.getBroadcast(
                context,
                task.taskId.hashCode(),
                intent,
                flags
            )

            context.packageManager.packageInstaller.uninstall(task.packageName, pendingIntent.intentSender)
            Log.i(TAG, "Queued uninstall for ${task.packageName} task=${task.taskId}")
        }
    }

    private fun runWithRetry(task: InstallTaskRecord, block: () -> Unit) {
        var lastError: Exception? = null
        val maxRetries = 2
        for (attempt in 0..maxRetries) {
            try {
                taskStore.updateTask(task.taskId) {
                    it.copy(
                        status = TaskState.RUNNING,
                        retryCount = attempt,
                        message = "Attempt ${attempt + 1}/${maxRetries + 1}"
                    )
                }
                block()
                return
            } catch (e: Exception) {
                lastError = e
                Log.e(TAG, "Install task failed attempt=${attempt + 1} task=${task.taskId}", e)
                if (attempt < maxRetries) {
                    Thread.sleep((attempt + 1) * 1500L)
                }
            }
        }

        markFailed(task, ERR_NETWORK_OR_IO, lastError?.message ?: "Unknown install error")
    }

    private fun downloadApk(task: InstallTaskRecord): File {
        val target = File(context.cacheDir, "dpc/${task.taskId}.apk")
        target.parentFile?.mkdirs()

        val request = Request.Builder().url(task.downloadUrl).get().build()
        httpClient.newCall(request).execute().use { response ->
            if (!response.isSuccessful) {
                throw IOException("Download failed: HTTP ${response.code}")
            }

            val body = response.body ?: throw IOException("Download body is empty")
            val total = body.contentLength()
            var downloaded = 0L

            target.outputStream().use { output ->
                body.byteStream().use { input ->
                    val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
                    while (true) {
                        val count = input.read(buffer)
                        if (count < 0) {
                            break
                        }
                        output.write(buffer, 0, count)
                        downloaded += count

                        if (total > 0) {
                            val progress = 5 + ((downloaded * 50L) / total).toInt()
                            taskStore.updateTask(task.taskId) {
                                it.copy(
                                    status = TaskState.RUNNING,
                                    progress = progress.coerceIn(5, 55),
                                    message = "Downloading APK (${downloaded / 1024} KB)"
                                )
                            }
                        }
                    }
                }
            }
        }

        return target
    }

    private fun verifySha256(task: InstallTaskRecord, apkFile: File) {
        if (task.sha256.isBlank()) {
            return
        }
        val actual = Hashing.sha256(apkFile)
        if (!task.sha256.equals(actual, ignoreCase = true)) {
            throw IllegalStateException("SHA256 mismatch")
        }

        val metadata = runCatching { JSONObject(task.metadataJson) }.getOrNull()
        val signerHint = metadata?.optString("signerSha256")
        if (!signerHint.isNullOrBlank()) {
            Log.i(TAG, "Signer hint provided but strict signer verification is skipped: $signerHint")
        }
    }

    private fun verifyArchive(task: InstallTaskRecord, apkFile: File) {
        @Suppress("DEPRECATION")
        val archiveInfo = context.packageManager.getPackageArchiveInfo(apkFile.absolutePath, 0)
            ?: throw IllegalStateException("Cannot read APK archive")

        if (archiveInfo.packageName != task.packageName) {
            throw IllegalStateException("Package mismatch. expected=${task.packageName}, actual=${archiveInfo.packageName}")
        }

        val archiveVersionCode = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            archiveInfo.longVersionCode.toInt()
        } else {
            @Suppress("DEPRECATION")
            archiveInfo.versionCode
        }

        if (task.targetVersionCode > 0 && archiveVersionCode != task.targetVersionCode) {
            throw IllegalStateException(
                "Version mismatch. expected=${task.targetVersionCode}, actual=$archiveVersionCode"
            )
        }
    }

    private fun commitInstallSession(task: InstallTaskRecord, apkFile: File) {
        val installer = context.packageManager.packageInstaller
        val params = PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL).apply {
            setAppPackageName(task.packageName)
        }
        val sessionId = installer.createSession(params)
        installer.openSession(sessionId).use { session ->
            session.openWrite("base.apk", 0, apkFile.length()).use { output ->
                apkFile.inputStream().use { input ->
                    input.copyTo(output)
                }
                session.fsync(output)
            }

            val callbackIntent = Intent(context, InstallResultReceiver::class.java).apply {
                action = InstallResultReceiver.ACTION_INSTALL_RESULT
                putExtra(InstallResultReceiver.EXTRA_TASK_ID, task.taskId)
            }
            val flags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            } else {
                PendingIntent.FLAG_UPDATE_CURRENT
            }
            val pendingIntent = PendingIntent.getBroadcast(
                context,
                task.taskId.hashCode(),
                callbackIntent,
                flags
            )
            session.commit(pendingIntent.intentSender)
            Log.i(TAG, "Install session committed task=${task.taskId} session=$sessionId")
        }
    }

    private fun markFailed(task: InstallTaskRecord, code: Int, message: String) {
        taskStore.updateTask(task.taskId) {
            it.copy(
                status = TaskState.FAILED,
                progress = 100,
                resultCode = code,
                message = message
            )
        }
    }

    private fun updateRunning(taskId: String, progress: Int, message: String) {
        taskStore.updateTask(taskId) {
            it.copy(status = TaskState.RUNNING, progress = progress, message = message)
        }
    }

    companion object {
        private const val TAG = "CORE_DPC_INSTALL"
        const val ERR_NOT_DEVICE_OWNER = -1001
        const val ERR_NETWORK_OR_IO = -1002
        const val ERR_UNKNOWN_TASK = -1003
    }
}
