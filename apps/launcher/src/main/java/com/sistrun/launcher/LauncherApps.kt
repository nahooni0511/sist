package com.sistrun.launcher

import android.content.Context
import android.content.Intent
import android.provider.Settings

data class RegisteredApp(
    val label: String,
    val packageName: String,
    val fallbackAction: String? = null,
    val clearTaskOnFallbackLaunch: Boolean = false
)

object LauncherApps {
    private const val SETTINGS_PACKAGE_NAME = "com.android.settings"

    fun registeredApps(): List<RegisteredApp> = listOf(
        RegisteredApp("Sistrun Dance", "com.sistrun.dance"),
        RegisteredApp("Chrome", "com.android.chrome"),
        RegisteredApp(
            "Settings",
            SETTINGS_PACKAGE_NAME,
            Settings.ACTION_SETTINGS,
            clearTaskOnFallbackLaunch = true
        )
    )

    fun resolveLaunchIntent(context: Context, app: RegisteredApp): Intent? {
        val packageIntent = context.packageManager.getLaunchIntentForPackage(app.packageName)
        if (packageIntent != null) {
            return packageIntent
        }

        return app.fallbackAction?.let {
            Intent(it).apply {
                if (app.clearTaskOnFallbackLaunch) {
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK)
                }
            }
        }
    }
}
