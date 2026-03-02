package com.sistrun.appstoreinstaller.download

import android.content.Context
import android.net.Uri
import androidx.work.Worker
import androidx.work.WorkerParameters
import okhttp3.CertificatePinner
import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.security.MessageDigest
import java.util.concurrent.TimeUnit

class DownloadWorker(
  private val context: Context,
  params: WorkerParameters
) : Worker(context, params) {

  override fun doWork(): Result {
    val taskId = inputData.getString("taskId") ?: return Result.failure()
    val url = inputData.getString("url") ?: return Result.failure()
    val expectedSha = inputData.getString("expectedSha256") ?: ""
    val expectedSize = inputData.getLong("expectedSize", -1L)
    val tlsPin = inputData.getString("tlsPin")

    val downloadsDir = File(context.filesDir, "downloads")
    if (!downloadsDir.exists()) {
      downloadsDir.mkdirs()
    }

    val tempFile = File(downloadsDir, "$taskId.apk.part")
    val finalFile = File(downloadsDir, "$taskId.apk")

    try {
      DownloadStatusStore.writeStatus(context, taskId, "ENQUEUED", 0L, 0L)

      val existing = if (tempFile.exists()) tempFile.length() else 0L
      val requestBuilder = Request.Builder().url(url)
      if (existing > 0L) {
        requestBuilder.addHeader("Range", "bytes=$existing-")
      }

      val clientBuilder = OkHttpClient.Builder()
        .connectTimeout(30, TimeUnit.SECONDS)
        .readTimeout(120, TimeUnit.SECONDS)
        .retryOnConnectionFailure(true)

      val host = Request.Builder().url(url).build().url.host
      if (!tlsPin.isNullOrBlank() && host.isNotBlank()) {
        val pinner = CertificatePinner.Builder()
          .add(host, "sha256/$tlsPin")
          .build()
        clientBuilder.certificatePinner(pinner)
      }

      val response = clientBuilder.build().newCall(requestBuilder.build()).execute()
      if (!response.isSuccessful) {
        throw IllegalStateException("HTTP ${response.code}")
      }

      val body = response.body ?: throw IllegalStateException("response body empty")
      val totalBytes = if (body.contentLength() > 0) existing + body.contentLength() else -1L

      body.byteStream().use { input ->
        FileOutputStream(tempFile, existing > 0L).use { output ->
          val buffer = ByteArray(8192)
          var written = existing
          var read: Int
          while (true) {
            read = input.read(buffer)
            if (read == -1) break
            output.write(buffer, 0, read)
            written += read
            DownloadStatusStore.writeStatus(context, taskId, "RUNNING", written, totalBytes)
          }
          output.flush()
          output.fd.sync()
        }
      }

      val downloadedSize = tempFile.length()
      if (expectedSize > 0L && downloadedSize != expectedSize) {
        throw IllegalStateException("size mismatch expected=$expectedSize actual=$downloadedSize")
      }

      if (expectedSha.isNotBlank()) {
        val actualSha = sha256(tempFile)
        if (!actualSha.equals(expectedSha, ignoreCase = true)) {
          throw IllegalStateException("sha256 mismatch")
        }
      }

      if (finalFile.exists()) {
        finalFile.delete()
      }

      try {
        java.nio.file.Files.move(
          tempFile.toPath(),
          finalFile.toPath(),
          java.nio.file.StandardCopyOption.REPLACE_EXISTING,
          java.nio.file.StandardCopyOption.ATOMIC_MOVE
        )
      } catch (_: Throwable) {
        if (!tempFile.renameTo(finalFile)) {
          throw IllegalStateException("atomic move failed")
        }
      }

      val outputUri = Uri.fromFile(finalFile).toString()
      DownloadStatusStore.writeStatus(
        context,
        taskId,
        "SUCCEEDED",
        finalFile.length(),
        finalFile.length(),
        outputUri = outputUri
      )

      return Result.success(
        androidx.work.Data.Builder()
          .putString("outputUri", outputUri)
          .build()
      )
    } catch (error: Throwable) {
      DownloadStatusStore.writeStatus(
        context,
        taskId,
        "FAILED",
        if (tempFile.exists()) tempFile.length() else 0L,
        expectedSize,
        errorMessage = error.message ?: "download failure"
      )

      return if (runAttemptCount < 2) {
        Result.retry()
      } else {
        Result.failure()
      }
    }
  }

  private fun sha256(file: File): String {
    val digest = MessageDigest.getInstance("SHA-256")
    FileInputStream(file).use { input ->
      val buffer = ByteArray(8192)
      var read: Int
      while (true) {
        read = input.read(buffer)
        if (read <= 0) break
        digest.update(buffer, 0, read)
      }
    }

    return digest.digest().joinToString("") { "%02x".format(it) }
  }
}
