package com.sistrun.core_dpc.admin

import android.app.admin.DeviceAdminReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

class CoreDeviceAdminReceiver : DeviceAdminReceiver() {

    override fun onEnabled(context: Context, intent: Intent) {
        Log.i(TAG, "Device admin enabled")
        ensureLauncherHome(context, "device_admin_enabled")
    }

    override fun onDisabled(context: Context, intent: Intent) {
        Log.w(TAG, "Device admin disabled")
    }

    override fun onProfileProvisioningComplete(context: Context, intent: Intent) {
        Log.i(TAG, "Provisioning complete")
        ensureLauncherHome(context, "profile_provisioning_complete")
    }

    private fun ensureLauncherHome(context: Context, reason: String) {
        val applied = DpmController(context.applicationContext)
            .ensureLauncherPersistentHome(reason)
        Log.i(TAG, "Launcher HOME pinning reason=$reason applied=$applied")
    }

    companion object {
        private const val TAG = "CORE_DPC_POLICY"
    }
}
