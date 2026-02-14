package com.sistrun.core_dpc

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import com.sistrun.core_dpc.idle.IdleCoordinator

class StartupReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent?) {
        val action = intent?.action ?: return
        if (action == Intent.ACTION_BOOT_COMPLETED || action == Intent.ACTION_LOCKED_BOOT_COMPLETED) {
            IdleCoordinator.initialize(context.applicationContext)
            Log.i(TAG, "Boot completed, core_dpc ready")
        }
    }

    companion object {
        private const val TAG = "CORE_DPC_POLICY"
    }
}
