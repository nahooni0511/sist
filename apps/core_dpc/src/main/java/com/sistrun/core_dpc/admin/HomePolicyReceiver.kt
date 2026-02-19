package com.sistrun.core_dpc.admin

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

class HomePolicyReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent?) {
        val action = intent?.action ?: return
        val packageName = intent.data?.schemeSpecificPart.orEmpty()
        val shouldApply = when (action) {
            Intent.ACTION_BOOT_COMPLETED,
            Intent.ACTION_LOCKED_BOOT_COMPLETED,
            Intent.ACTION_MY_PACKAGE_REPLACED -> true

            Intent.ACTION_PACKAGE_ADDED,
            Intent.ACTION_PACKAGE_REPLACED,
            Intent.ACTION_PACKAGE_CHANGED -> {
                packageName == DpmController.LAUNCHER_PACKAGE || packageName == context.packageName
            }

            else -> false
        }
        if (!shouldApply) {
            return
        }

        val trigger = if (packageName.isBlank()) action else "$action:$packageName"
        val applied = DpmController(context.applicationContext)
            .ensureLauncherPersistentHome(trigger)
        Log.i(TAG, "Launcher HOME pinning trigger=$trigger applied=$applied")
    }

    companion object {
        private const val TAG = "CORE_DPC_POLICY"
    }
}
