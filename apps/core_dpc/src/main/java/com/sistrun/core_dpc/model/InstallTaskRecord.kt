package com.sistrun.core_dpc.model

data class InstallTaskRecord(
    val taskId: String,
    val taskType: TaskType,
    val packageName: String,
    val targetVersionCode: Int,
    val downloadUrl: String,
    val sha256: String,
    val metadataJson: String,
    val status: TaskState,
    val progress: Int,
    val resultCode: Int,
    val message: String,
    val retryCount: Int,
    val createdAt: Long,
    val updatedAt: Long
)
