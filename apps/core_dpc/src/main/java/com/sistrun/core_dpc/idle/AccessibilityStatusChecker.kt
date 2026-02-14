package com.sistrun.core_dpc.idle

import android.accessibilityservice.AccessibilityServiceInfo
import android.content.ComponentName
import android.content.Context
import android.provider.Settings
import android.view.accessibility.AccessibilityManager

object AccessibilityStatusChecker {
    fun isAccessibilityEnabled(context: Context): Boolean {
        val manager = context.getSystemService(AccessibilityManager::class.java) ?: return false
        val component = ComponentName(context, CoreDpcAccessibilityService::class.java)
        val fullId = component.flattenToString()
        val shortId = component.flattenToShortString()

        val enabledByManager = manager.getEnabledAccessibilityServiceList(
            AccessibilityServiceInfo.FEEDBACK_ALL_MASK
        ).any { info ->
            info.id == fullId || info.id == shortId || matches(info, component)
        }
        if (enabledByManager) {
            return true
        }

        val enabledRaw = Settings.Secure.getString(
            context.contentResolver,
            Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES
        ).orEmpty()
        if (enabledRaw.isBlank()) {
            return false
        }

        return enabledRaw.split(':').any { id ->
            id.equals(fullId, ignoreCase = true) || id.equals(shortId, ignoreCase = true)
        }
    }

    private fun matches(info: AccessibilityServiceInfo, component: ComponentName): Boolean {
        val serviceInfo = info.resolveInfo?.serviceInfo ?: return false
        return serviceInfo.packageName == component.packageName &&
            serviceInfo.name == component.className
    }
}
