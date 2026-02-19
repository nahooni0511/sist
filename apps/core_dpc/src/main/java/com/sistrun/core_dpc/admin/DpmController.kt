package com.sistrun.core_dpc.admin

import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Build
import android.os.UserManager
import android.util.Log
import com.sistrun.core_dpc.ipc.DeviceOwnerStatusInfo
import com.sistrun.core_dpc.ipc.TaskStatusInfo
import com.sistrun.core_dpc.model.TaskType
import kotlin.math.max

class DpmController(private val context: Context) {

    private val dpm = context.getSystemService(DevicePolicyManager::class.java)
    private val adminComponent = ComponentName(context, CoreDeviceAdminReceiver::class.java)

    fun isDeviceOwnerReady(): DeviceOwnerStatusInfo {
        if (dpm == null) {
            return DeviceOwnerStatusInfo(false, "DevicePolicyManager unavailable")
        }

        if (!dpm.isAdminActive(adminComponent)) {
            return DeviceOwnerStatusInfo(false, "Device admin is not active")
        }

        return if (dpm.isDeviceOwnerApp(context.packageName)) {
            DeviceOwnerStatusInfo(true, "Device Owner ready")
        } else {
            DeviceOwnerStatusInfo(false, "App is not Device Owner")
        }
    }

    fun applyBaselinePolicies(): TaskStatusInfo {
        val taskId = "policy-${System.currentTimeMillis()}"
        val status = isDeviceOwnerReady()
        if (!status.ready || dpm == null) {
            return TaskStatusInfo(
                taskId = taskId,
                taskType = TaskType.APPLY_POLICY.name,
                packageName = context.packageName,
                targetVersionCode = -1,
                status = "FAILED",
                progress = 0,
                resultCode = -1,
                message = status.reason,
                updatedAt = System.currentTimeMillis()
            )
        }

        return try {
            val lockTaskPackages = arrayOf(
                LAUNCHER_PACKAGE,
                "com.sistrun.manager",
                "com.sistrun.core_dpc"
            )
            dpm.setLockTaskPackages(adminComponent, lockTaskPackages)

            // 운영 중 사용자가 임의로 앱을 추가 설치하는 경로를 줄인다.
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                dpm.addUserRestriction(adminComponent, UserManager.DISALLOW_INSTALL_UNKNOWN_SOURCES)
            }
            dpm.addUserRestriction(adminComponent, UserManager.DISALLOW_SAFE_BOOT)

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                runCatching { dpm.setStatusBarDisabled(adminComponent, true) }
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                runCatching { dpm.setKeyguardDisabled(adminComponent, true) }
            }
            val homePinned = ensureLauncherPersistentHome("applyBaselinePolicies")

            TaskStatusInfo(
                taskId = taskId,
                taskType = TaskType.APPLY_POLICY.name,
                packageName = context.packageName,
                targetVersionCode = -1,
                status = "SUCCESS",
                progress = 100,
                resultCode = 0,
                message = "Baseline policies applied (homePinned=$homePinned)",
                updatedAt = System.currentTimeMillis()
            )
        } catch (e: Exception) {
            Log.e(TAG, "Failed to apply baseline policies", e)
            TaskStatusInfo(
                taskId = taskId,
                taskType = TaskType.APPLY_POLICY.name,
                packageName = context.packageName,
                targetVersionCode = -1,
                status = "FAILED",
                progress = 0,
                resultCode = -2,
                message = e.message ?: "Policy apply failure",
                updatedAt = System.currentTimeMillis()
            )
        }
    }

    fun ensureLauncherPersistentHome(reason: String): Boolean {
        val status = isDeviceOwnerReady()
        if (!status.ready || dpm == null) {
            Log.i(TAG, "Skip launcher HOME pinning reason=$reason status=${status.reason}")
            return false
        }

        val launcherComponent = resolveLauncherHomeActivity()
        if (launcherComponent == null) {
            Log.i(TAG, "Skip launcher HOME pinning reason=$reason launcher activity missing")
            return false
        }

        val homeFilter = IntentFilter(Intent.ACTION_MAIN).apply {
            addCategory(Intent.CATEGORY_HOME)
            addCategory(Intent.CATEGORY_DEFAULT)
        }

        return runCatching {
            dpm.clearPackagePersistentPreferredActivities(adminComponent, LAUNCHER_PACKAGE)
            dpm.addPersistentPreferredActivity(adminComponent, homeFilter, launcherComponent)
            Log.i(TAG, "Launcher HOME pinned reason=$reason component=$launcherComponent")
            true
        }.onFailure { error ->
            Log.e(TAG, "Failed to pin launcher HOME reason=$reason", error)
        }.getOrDefault(false)
    }

    private fun resolveLauncherHomeActivity(): ComponentName? {
        val homeIntent = Intent(Intent.ACTION_MAIN).apply {
            addCategory(Intent.CATEGORY_HOME)
            `package` = LAUNCHER_PACKAGE
        }
        @Suppress("DEPRECATION")
        val resolved = context.packageManager.resolveActivity(homeIntent, 0) ?: return null
        val info = resolved.activityInfo ?: return null
        if (info.packageName != LAUNCHER_PACKAGE) {
            return null
        }
        return ComponentName(info.packageName, info.name)
    }

    fun requestReboot(reason: String): TaskStatusInfo {
        val taskId = "reboot-${System.currentTimeMillis()}"
        val status = isDeviceOwnerReady()
        if (!status.ready || dpm == null) {
            return TaskStatusInfo(
                taskId = taskId,
                taskType = TaskType.REBOOT.name,
                packageName = context.packageName,
                targetVersionCode = -1,
                status = "FAILED",
                progress = 0,
                resultCode = REBOOT_NOT_SUPPORTED,
                message = status.reason,
                updatedAt = System.currentTimeMillis()
            )
        }

        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.N) {
            return TaskStatusInfo(
                taskId = taskId,
                taskType = TaskType.REBOOT.name,
                packageName = context.packageName,
                targetVersionCode = -1,
                status = "FAILED",
                progress = 0,
                resultCode = REBOOT_NOT_SUPPORTED,
                message = "REBOOT_NOT_SUPPORTED: SDK ${Build.VERSION.SDK_INT}",
                updatedAt = System.currentTimeMillis()
            )
        }

        return try {
            dpm.reboot(adminComponent)
            TaskStatusInfo(
                taskId = taskId,
                taskType = TaskType.REBOOT.name,
                packageName = context.packageName,
                targetVersionCode = -1,
                status = "RUNNING",
                progress = max(1, reason.length % 100),
                resultCode = 0,
                message = "Reboot requested",
                updatedAt = System.currentTimeMillis()
            )
        } catch (e: Exception) {
            Log.e(TAG, "Reboot failed", e)
            TaskStatusInfo(
                taskId = taskId,
                taskType = TaskType.REBOOT.name,
                packageName = context.packageName,
                targetVersionCode = -1,
                status = "FAILED",
                progress = 0,
                resultCode = REBOOT_NOT_SUPPORTED,
                message = "REBOOT_NOT_SUPPORTED: ${e.message}",
                updatedAt = System.currentTimeMillis()
            )
        }
    }

    fun adminComponent(): ComponentName = adminComponent

    companion object {
        private const val TAG = "CORE_DPC_POLICY"
        const val REBOOT_NOT_SUPPORTED = -3201
        const val LAUNCHER_PACKAGE = "com.sistrun.launcher"
    }
}
