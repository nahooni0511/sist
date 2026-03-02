package com.sistrun.appstoreinstaller

import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageInfo
import android.content.pm.PackageInstaller
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.work.Constraints
import androidx.work.Data
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import com.sistrun.appstoreinstaller.download.DownloadStatusStore
import com.sistrun.appstoreinstaller.download.DownloadWorker
import java.io.File
import java.io.FileInputStream
import java.security.MessageDigest
import java.util.UUID
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference

class AppStoreInstallerModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("AppStoreInstaller")

    AsyncFunction("getCapabilitiesAsync") {
      mapOf(
        "packageInspector" to true,
        "packageInstallerSession" to true,
        "workManagerDownloader" to true,
        "canOpenUnknownSourcesSettings" to true
      )
    }

    AsyncFunction("listInstalledPackagesAsync") { packageNames: List<String> ->
      val pm = requireContext().packageManager
      packageNames.mapNotNull { packageName ->
        val info = findPackageInfo(pm, packageName) ?: return@mapNotNull null
        mapOf(
          "packageName" to packageName,
          "versionCode" to packageVersionCode(info),
          "versionName" to (info.versionName ?: "")
        )
      }
    }

    AsyncFunction("canRequestPackageInstallsAsync") {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        requireContext().packageManager.canRequestPackageInstalls()
      } else {
        true
      }
    }

    AsyncFunction("openUnknownSourcesSettingsAsync") {
      val context = requireContext()
      val intent = Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES).apply {
        data = Uri.parse("package:${context.packageName}")
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      }
      context.startActivity(intent)
      null
    }

    AsyncFunction("enqueueDownloadAsync") { request: Map<String, Any?> ->
      val taskId = (request["taskId"] as? String)?.trim().takeUnless { it.isNullOrBlank() }
        ?: throw IllegalArgumentException("taskId is required")
      val url = (request["url"] as? String)?.trim().takeUnless { it.isNullOrBlank() }
        ?: throw IllegalArgumentException("url is required")

      val integrity = request["integrity"] as? Map<*, *> ?: emptyMap<String, Any>()
      val expectedSha = (integrity["expectedSha256"] as? String)?.trim() ?: ""
      val expectedSize = when (val raw = integrity["expectedSize"]) {
        is Number -> raw.toLong()
        is String -> raw.toLongOrNull() ?: -1L
        else -> -1L
      }

      val tlsPin = (integrity["tlsPin"] as? String)?.trim()

      val constraints = Constraints.Builder()
        .setRequiredNetworkType(NetworkType.CONNECTED)
        .setRequiresBatteryNotLow(true)
        .build()

      val data = Data.Builder()
        .putString("taskId", taskId)
        .putString("url", url)
        .putString("expectedSha256", expectedSha)
        .putLong("expectedSize", expectedSize)
        .putString("tlsPin", tlsPin)
        .build()

      val requestBuilder = OneTimeWorkRequestBuilder<DownloadWorker>()
        .setInputData(data)
        .setConstraints(constraints)
        .addTag("app-store-download")

      val workName = "app-store-download-$taskId"
      WorkManager.getInstance(requireContext()).enqueueUniqueWork(
        workName,
        androidx.work.ExistingWorkPolicy.REPLACE,
        requestBuilder.build()
      )

      DownloadStatusStore.writeStatus(requireContext(), taskId, "ENQUEUED", 0L, 0L)
      mapOf("taskId" to taskId)
    }

    AsyncFunction("getDownloadStatusAsync") { taskId: String ->
      val status = DownloadStatusStore.readStatus(requireContext(), taskId)
        ?: mapOf(
          "taskId" to taskId,
          "status" to "FAILED",
          "bytesDownloaded" to 0,
          "totalBytes" to 0,
          "errorMessage" to "status not found"
        )

      if (status is Map<*, *>) {
        status
      } else {
        mapOf(
          "taskId" to status.optString("taskId", taskId),
          "status" to status.optString("status", "FAILED"),
          "bytesDownloaded" to status.optLong("bytesDownloaded", 0L),
          "totalBytes" to status.optLong("totalBytes", 0L),
          "outputUri" to status.optString("outputUri", ""),
          "errorMessage" to status.optString("errorMessage", "")
        )
      }
    }

    AsyncFunction("cancelDownloadAsync") { taskId: String ->
      val workName = "app-store-download-$taskId"
      WorkManager.getInstance(requireContext()).cancelUniqueWork(workName)
      DownloadStatusStore.writeStatus(requireContext(), taskId, "CANCELLED", 0L, 0L)
      null
    }

    AsyncFunction("verifyFileIntegrityAsync") { fileUri: String, integrity: Map<String, Any?> ->
      val file = resolveFile(requireContext(), fileUri)
      if (!file.exists()) {
        throw IllegalStateException("file not found: $fileUri")
      }

      val expectedSha = (integrity["expectedSha256"] as? String)?.trim() ?: ""
      val expectedSize = when (val raw = integrity["expectedSize"]) {
        is Number -> raw.toLong()
        is String -> raw.toLongOrNull() ?: -1L
        else -> -1L
      }

      val actualSize = file.length()
      if (expectedSize > 0L && expectedSize != actualSize) {
        throw IllegalStateException("size mismatch expected=$expectedSize actual=$actualSize")
      }

      val actualSha = if (expectedSha.isNotBlank()) sha256(file) else ""
      if (expectedSha.isNotBlank() && !expectedSha.equals(actualSha, ignoreCase = true)) {
        throw IllegalStateException("sha256 mismatch")
      }

      mapOf(
        "fileUri" to Uri.fromFile(file).toString(),
        "size" to actualSize,
        "sha256" to actualSha
      )
    }

    AsyncFunction("installPackageSessionAsync") { params: Map<String, Any?> ->
      val packageName = (params["packageName"] as? String)?.trim().takeUnless { it.isNullOrBlank() }
        ?: throw IllegalArgumentException("packageName is required")
      val fileUri = (params["fileUri"] as? String)?.trim().takeUnless { it.isNullOrBlank() }
        ?: throw IllegalArgumentException("fileUri is required")
      val isUpdate = params["isUpdate"] as? Boolean ?: false

      installWithSession(requireContext(), packageName, fileUri, isUpdate)
    }

    AsyncFunction("openPendingUserActionAsync") { intentUri: String ->
      val context = requireContext()
      val intent = Intent.parseUri(intentUri, Intent.URI_INTENT_SCHEME)
      intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      context.startActivity(intent)
      null
    }
  }

  private fun requireContext(): Context = appContext.reactContext ?: throw IllegalStateException("context unavailable")

  private fun findPackageInfo(pm: android.content.pm.PackageManager, packageName: String): PackageInfo? {
    return try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        pm.getPackageInfo(packageName, android.content.pm.PackageManager.PackageInfoFlags.of(0))
      } else {
        @Suppress("DEPRECATION")
        pm.getPackageInfo(packageName, 0)
      }
    } catch (_: Throwable) {
      null
    }
  }

  private fun packageVersionCode(info: PackageInfo): Long {
    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
      info.longVersionCode
    } else {
      @Suppress("DEPRECATION")
      info.versionCode.toLong()
    }
  }

  private fun resolveFile(context: Context, uriOrPath: String): File {
    if (uriOrPath.startsWith("file://")) {
      return File(Uri.parse(uriOrPath).path ?: uriOrPath)
    }

    if (uriOrPath.startsWith("content://")) {
      val target = File(context.cacheDir, "session-${UUID.randomUUID()}.apk")
      context.contentResolver.openInputStream(Uri.parse(uriOrPath)).use { input ->
        if (input == null) throw IllegalStateException("cannot read content uri")
        target.outputStream().use { output ->
          input.copyTo(output)
        }
      }
      return target
    }

    return File(uriOrPath)
  }

  private fun sha256(file: File): String {
    val digest = MessageDigest.getInstance("SHA-256")
    FileInputStream(file).use { input ->
      val buffer = ByteArray(8192)
      while (true) {
        val read = input.read(buffer)
        if (read <= 0) break
        digest.update(buffer, 0, read)
      }
    }
    return digest.digest().joinToString("") { "%02x".format(it) }
  }

  private fun installWithSession(
    context: Context,
    packageName: String,
    fileUri: String,
    isUpdate: Boolean
  ): Map<String, Any?> {
    val packageInstaller = context.packageManager.packageInstaller
    val params = PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL).apply {
      setAppPackageName(packageName)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        setRequireUserAction(
          if (isUpdate) {
            PackageInstaller.SessionParams.USER_ACTION_NOT_REQUIRED
          } else {
            PackageInstaller.SessionParams.USER_ACTION_REQUIRED
          }
        )
      }
    }

    val sessionId = packageInstaller.createSession(params)
    val sourceFile = resolveFile(context, fileUri)

    packageInstaller.openSession(sessionId).use { session ->
      sourceFile.inputStream().use { input ->
        session.openWrite("base.apk", 0, sourceFile.length()).use { output ->
          input.copyTo(output)
          session.fsync(output)
        }
      }

      val action = "com.sistrun.appstoreinstaller.INSTALL_RESULT_$sessionId"
      val resultRef = AtomicReference<Map<String, Any?>?>(null)
      val latch = CountDownLatch(1)
      val receiver = object : BroadcastReceiver() {
        override fun onReceive(ctx: Context?, intent: Intent?) {
          if (intent == null) {
            resultRef.set(
              mapOf(
                "code" to "FAILURE",
                "message" to "empty result intent",
                "failureCode" to "EMPTY_INTENT"
              )
            )
            latch.countDown()
            return
          }

          val status = intent.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE)
          val message = intent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE) ?: ""
          when (status) {
            PackageInstaller.STATUS_SUCCESS -> {
              resultRef.set(mapOf("code" to "SUCCESS", "message" to message))
            }
            PackageInstaller.STATUS_PENDING_USER_ACTION -> {
              val pendingIntent = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                intent.getParcelableExtra(PackageInstaller.EXTRA_INTENT, Intent::class.java)
              } else {
                @Suppress("DEPRECATION")
                intent.getParcelableExtra<Intent>(PackageInstaller.EXTRA_INTENT)
              }

              resultRef.set(
                mapOf(
                  "code" to "PENDING_USER_ACTION",
                  "message" to (if (message.isBlank()) "user action required" else message),
                  "userActionIntentUri" to (pendingIntent?.toUri(Intent.URI_INTENT_SCHEME) ?: "")
                )
              )
            }
            else -> {
              resultRef.set(
                mapOf(
                  "code" to "FAILURE",
                  "message" to (if (message.isBlank()) "install failure" else message),
                  "failureCode" to "STATUS_$status"
                )
              )
            }
          }
          latch.countDown()
        }
      }

      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        context.registerReceiver(receiver, IntentFilter(action), Context.RECEIVER_NOT_EXPORTED)
      } else {
        @Suppress("DEPRECATION")
        context.registerReceiver(receiver, IntentFilter(action))
      }

      try {
        val pendingIntent = PendingIntent.getBroadcast(
          context,
          sessionId,
          Intent(action),
          PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE
        )

        session.commit(pendingIntent.intentSender)

        val completed = latch.await(90, TimeUnit.SECONDS)
        if (!completed) {
          return mapOf(
            "code" to "PENDING_USER_ACTION",
            "message" to "install result timeout"
          )
        }

        return resultRef.get() ?: mapOf(
          "code" to "FAILURE",
          "message" to "install result missing",
          "failureCode" to "RESULT_MISSING"
        )
      } finally {
        try {
          context.unregisterReceiver(receiver)
        } catch (_: Throwable) {
          // ignore
        }
      }
    }
  }
}
