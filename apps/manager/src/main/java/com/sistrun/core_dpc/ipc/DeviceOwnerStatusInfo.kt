package com.sistrun.core_dpc.ipc

import android.os.Parcelable
import kotlinx.parcelize.Parcelize

@Parcelize
data class DeviceOwnerStatusInfo(
    val ready: Boolean,
    val reason: String
) : Parcelable
