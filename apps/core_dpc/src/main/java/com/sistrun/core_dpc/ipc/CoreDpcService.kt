package com.sistrun.core_dpc.ipc

import android.app.Service
import android.content.Intent
import android.content.pm.PackageManager
import android.content.res.Resources
import android.os.Binder
import android.os.Build
import android.os.IBinder
import android.os.Process
import android.util.Log
import com.sistrun.core_dpc.R
import com.sistrun.core_dpc.admin.DpmController
import com.sistrun.core_dpc.idle.AccessibilityStatusChecker
import com.sistrun.core_dpc.idle.IdleCoordinator
import com.sistrun.core_dpc.install.InstallEngine
import com.sistrun.core_dpc.install.ManagedAppRegistry
import com.sistrun.core_dpc.install.TaskStore
import com.sistrun.core_dpc.model.TaskType

class CoreDpcService : Service() {

    private lateinit var taskStore: TaskStore
    private lateinit var managedAppRegistry: ManagedAppRegistry
    private lateinit var installEngine: InstallEngine
    private lateinit var dpmController: DpmController
    private lateinit var managerCallers: Set<String>
    private lateinit var heartbeatCallers: Set<String>
    private lateinit var bindCallers: Set<String>

    override fun onCreate() {
        super.onCreate()
        taskStore = TaskStore(applicationContext)
        managedAppRegistry = ManagedAppRegistry(applicationContext)
        installEngine = InstallEngine(applicationContext, taskStore, managedAppRegistry)
        dpmController = DpmController(applicationContext)
        managerCallers = loadAllowlist(
            resources = resources,
            resId = R.array.core_dpc_manager_callers,
            fallback = DEFAULT_MANAGER_CALLERS
        )
        heartbeatCallers = loadAllowlist(
            resources = resources,
            resId = R.array.core_dpc_heartbeat_callers,
            fallback = DEFAULT_HEARTBEAT_CALLERS
        )
        bindCallers = managerCallers + heartbeatCallers
        IdleCoordinator.initialize(applicationContext)
        Log.i(
            TAG_IPC,
            "CoreDpcService created managerCallers=$managerCallers heartbeatCallers=$heartbeatCallers"
        )
    }

    override fun onBind(intent: Intent?): IBinder {
        val callerUid = Binder.getCallingUid()
        if (callerUid != Process.myUid() && callerUid != Process.SYSTEM_UID) {
            validateCallerUid(callerUid, bindCallers, purpose = "bind")
        }
        return binder
    }

    private val binder = object : ICoreDpcService.Stub() {
        override fun requestInstall(
            packageName: String,
            versionCode: Int,
            url: String,
            sha256: String,
            metadataJson: String
        ): String {
            enforceManagerCaller()
            return installEngine.requestInstall(
                packageName = packageName,
                versionCode = versionCode,
                url = url,
                sha256 = sha256,
                metadataJson = metadataJson,
                taskType = TaskType.INSTALL
            )
        }

        override fun requestUpdate(
            packageName: String,
            versionCode: Int,
            url: String,
            sha256: String,
            metadataJson: String
        ): String {
            enforceManagerCaller()
            return installEngine.requestInstall(
                packageName = packageName,
                versionCode = versionCode,
                url = url,
                sha256 = sha256,
                metadataJson = metadataJson,
                taskType = TaskType.UPDATE
            )
        }

        override fun requestUninstall(packageName: String): String {
            enforceManagerCaller()
            return installEngine.requestUninstall(packageName)
        }

        override fun getTaskStatus(taskId: String): TaskStatusInfo {
            enforceManagerCaller()
            return taskStore.getTaskStatus(taskId) ?: TaskStatusInfo(
                taskId = taskId,
                taskType = "UNKNOWN",
                packageName = "",
                targetVersionCode = -1,
                status = "NOT_FOUND",
                progress = 0,
                resultCode = -404,
                message = "Task not found",
                updatedAt = System.currentTimeMillis()
            )
        }

        override fun listInstalledManagedApps(): MutableList<ManagedAppInfo> {
            enforceManagerCaller()
            val infos = mutableListOf<ManagedAppInfo>()
            managedAppRegistry.listManagedPackages().forEach { packageName ->
                try {
                    @Suppress("DEPRECATION")
                    val packageInfo = packageManager.getPackageInfo(packageName, 0)
                    val versionCode = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                        packageInfo.longVersionCode.toInt()
                    } else {
                        @Suppress("DEPRECATION")
                        packageInfo.versionCode
                    }
                    infos += ManagedAppInfo(
                        packageName = packageName,
                        versionName = packageInfo.versionName ?: "",
                        versionCode = versionCode,
                        installed = true
                    )
                } catch (_: Exception) {
                    infos += ManagedAppInfo(
                        packageName = packageName,
                        versionName = "",
                        versionCode = -1,
                        installed = false
                    )
                }
            }
            return infos
        }

        override fun isDeviceOwnerReady(): DeviceOwnerStatusInfo {
            enforceManagerCaller()
            return dpmController.isDeviceOwnerReady()
        }

        override fun requestReboot(reason: String): TaskStatusInfo {
            enforceManagerCaller()
            return dpmController.requestReboot(reason)
        }

        override fun applyBaselinePolicy(): TaskStatusInfo {
            enforceManagerCaller()
            return dpmController.applyBaselinePolicies()
        }

        override fun reportUserActivity(source: String, atMillis: Long, metaJson: String) {
            val caller = try {
                enforceHeartbeatCaller()
            } catch (se: SecurityException) {
                Log.w(
                    TAG_HEARTBEAT,
                    "Reject heartbeat callerUid=${Binder.getCallingUid()} source=$source",
                    se
                )
                throw se
            }
            Log.d(TAG_HEARTBEAT, "Heartbeat received caller=$caller source=$source at=$atMillis")
            IdleCoordinator.resetFromHeartbeat(
                context = applicationContext,
                source = source.ifBlank { caller },
                atMillis = atMillis,
                metaJson = metaJson
            )
        }

        override fun isAccessibilityEnabled(): Boolean {
            enforceManagerCaller()
            return AccessibilityStatusChecker.isAccessibilityEnabled(applicationContext)
        }
    }

    private fun enforceManagerCaller(): String {
        return enforceCallerFor(managerCallers, purpose = "manager_api")
    }

    private fun enforceHeartbeatCaller(): String {
        return enforceCallerFor(heartbeatCallers, purpose = "heartbeat_api")
    }

    private fun enforceCallerFor(allowlist: Set<String>, purpose: String): String {
        val uid = Binder.getCallingUid()
        if (uid == Process.myUid()) {
            return packageName
        }
        return validateCallerUid(uid, allowlist, purpose)
    }

    private fun validateCallerUid(uid: Int, allowlist: Set<String>, purpose: String): String {
        val packages = packageManager.getPackagesForUid(uid)?.toList().orEmpty()
        if (packages.isEmpty()) {
            throw SecurityException("IPC caller package missing uid=$uid")
        }

        val allowed = packages.firstOrNull { allowlist.contains(it) }
            ?: throw SecurityException("IPC caller not allowed uid=$uid packages=$packages")

        val signatureMatch = packageManager.checkSignatures(allowed, packageName) == PackageManager.SIGNATURE_MATCH
        if (!signatureMatch) {
            throw SecurityException("IPC signature mismatch caller=$allowed")
        }

        Log.d(TAG_IPC, "IPC caller validated package=$allowed purpose=$purpose uid=$uid")
        return allowed
    }

    private fun loadAllowlist(resources: Resources, resId: Int, fallback: Set<String>): Set<String> {
        val values = resources.getStringArray(resId)
            .map { it.trim() }
            .filter { it.isNotEmpty() }
            .toSet()
        return if (values.isEmpty()) fallback else values
    }

    companion object {
        private const val TAG_IPC = "IPC"
        private const val TAG_HEARTBEAT = "HEARTBEAT"
        const val ACTION_BIND = "com.sistrun.core_dpc.BIND"
        private val DEFAULT_MANAGER_CALLERS = setOf("com.sistrun.manager")
        private val DEFAULT_HEARTBEAT_CALLERS = setOf(
            "com.sistrun.manager",
            "com.sistrun.dance"
        )
    }
}
