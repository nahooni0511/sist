package com.sistrun.core_dpc.ipc

import android.os.Parcelable
import kotlinx.parcelize.Parcelize

@Parcelize
data class ManagedAppInfo(
    val packageName: String,
    val versionName: String,
    val versionCode: Int,
    val installed: Boolean
) : Parcelable
