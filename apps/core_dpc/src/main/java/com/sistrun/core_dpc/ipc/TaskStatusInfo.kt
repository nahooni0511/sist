package com.sistrun.core_dpc.ipc

import android.os.Parcelable
import kotlinx.parcelize.Parcelize

@Parcelize
data class TaskStatusInfo(
    val taskId: String,
    val taskType: String,
    val packageName: String,
    val targetVersionCode: Int,
    val status: String,
    val progress: Int,
    val resultCode: Int,
    val message: String,
    val updatedAt: Long
) : Parcelable
