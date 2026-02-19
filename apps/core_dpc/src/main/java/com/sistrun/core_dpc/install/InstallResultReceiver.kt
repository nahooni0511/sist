package com.sistrun.core_dpc.install

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageInstaller
import android.util.Log
import com.sistrun.core_dpc.admin.DpmController
import com.sistrun.core_dpc.model.TaskState
import com.sistrun.core_dpc.model.TaskType

class InstallResultReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != ACTION_INSTALL_RESULT) {
            return
        }

        val taskId = intent.getStringExtra(EXTRA_TASK_ID).orEmpty()
        if (taskId.isBlank()) {
            Log.w(TAG, "Missing taskId in install callback")
            return
        }

        val taskStore = TaskStore(context)
        val task = taskStore.getTask(taskId)
        if (task == null) {
            Log.w(TAG, "Task not found for callback taskId=$taskId")
            return
        }

        val status = intent.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE)
        val statusMessage = intent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE).orEmpty()

        when (status) {
            PackageInstaller.STATUS_SUCCESS -> {
                taskStore.updateTask(taskId) {
                    it.copy(
                        status = TaskState.SUCCESS,
                        progress = 100,
                        resultCode = 0,
                        message = "Completed"
                    )
                }
                if (task.taskType == TaskType.UNINSTALL) {
                    ManagedAppRegistry(context).unregister(task.packageName)
                } else {
                    ManagedAppRegistry(context).register(task.packageName)
                    if (task.packageName == DpmController.LAUNCHER_PACKAGE) {
                        val applied = DpmController(context.applicationContext)
                            .ensureLauncherPersistentHome("install_result_success")
                        Log.i(TAG, "Launcher install detected, HOME pinning applied=$applied")
                    }
                }
                Log.i(TAG, "Task success taskId=$taskId package=${task.packageName}")
            }

            PackageInstaller.STATUS_PENDING_USER_ACTION -> {
                taskStore.updateTask(taskId) {
                    it.copy(
                        status = TaskState.FAILED,
                        progress = 100,
                        resultCode = ERR_PENDING_USER_ACTION,
                        message = "PENDING_USER_ACTION: silent install unavailable"
                    )
                }
                Log.w(TAG, "Task pending user action taskId=$taskId message=$statusMessage")
            }

            else -> {
                taskStore.updateTask(taskId) {
                    it.copy(
                        status = TaskState.FAILED,
                        progress = 100,
                        resultCode = status,
                        message = if (statusMessage.isBlank()) "Install failed" else statusMessage
                    )
                }
                Log.e(TAG, "Task failed taskId=$taskId status=$status message=$statusMessage")
            }
        }
    }

    companion object {
        private const val TAG = "CORE_DPC_INSTALL"
        const val ACTION_INSTALL_RESULT = "com.sistrun.core_dpc.ACTION_INSTALL_RESULT"
        const val EXTRA_TASK_ID = "extra_task_id"
        const val ERR_PENDING_USER_ACTION = -2001
    }
}
