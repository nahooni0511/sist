package com.sistrun.manager.market

data class MarketApp(
    val appId: String,
    val packageName: String,
    val displayName: String,
    val latestVersionName: String,
    val latestVersionCode: Int,
    val changelog: String,
    val autoUpdate: Boolean,
    val downloadUrl: String,
    val sha256: String,
    val installedVersionCode: Int
) {
    val needsInstallOrUpdate: Boolean
        get() = installedVersionCode < latestVersionCode
}

data class UpdateCandidate(
    val appId: String,
    val displayName: String,
    val packageName: String,
    val installedVersionCode: Int,
    val targetVersionCode: Int,
    val targetVersionName: String,
    val changelog: String,
    val downloadUrl: String,
    val sha256: String
)

data class UpdateCheckResult(
    val settings: Map<String, String>,
    val updates: List<UpdateCandidate>
)

data class DeviceCommand(
    val id: String,
    val type: String,
    val payloadJson: String
)
