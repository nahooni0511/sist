package com.sistrun.core_dpc.idle

import android.accessibilityservice.AccessibilityService
import android.util.Log
import android.view.accessibility.AccessibilityEvent

class CoreDpcAccessibilityService : AccessibilityService() {
    override fun onServiceConnected() {
        super.onServiceConnected()
        IdleCoordinator.initialize(applicationContext)
        Log.i(TAG_ACCESSIBILITY, "Core DPC accessibility service connected")
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        if (event == null) {
            return
        }
        if (event.eventType !in TRACKED_EVENTS) {
            return
        }
        IdleCoordinator.resetFromAccessibility(applicationContext, event.eventType)
    }

    override fun onInterrupt() {
        Log.w(TAG_ACCESSIBILITY, "Core DPC accessibility service interrupted")
    }

    companion object {
        private const val TAG_ACCESSIBILITY = "ACCESSIBILITY"
        private val TRACKED_EVENTS = setOf(
            AccessibilityEvent.TYPE_VIEW_CLICKED,
            AccessibilityEvent.TYPE_VIEW_SCROLLED,
            AccessibilityEvent.TYPE_VIEW_FOCUSED,
            AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED,
            AccessibilityEvent.TYPE_TOUCH_INTERACTION_START,
            AccessibilityEvent.TYPE_TOUCH_INTERACTION_END
        )
    }
}
