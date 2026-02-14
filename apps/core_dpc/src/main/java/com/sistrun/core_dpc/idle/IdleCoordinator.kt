package com.sistrun.core_dpc.idle

import android.content.Context
import android.content.Intent
import android.os.Handler
import android.os.Looper
import android.util.Log

data class IdleSnapshot(
    val lastActivityAt: Long,
    val lastSource: String,
    val timeoutMs: Long,
    val isAccessibilityEnabled: Boolean
)

object IdleCoordinator {
    private const val PREF_NAME = "idle_coordinator"
    private const val KEY_LAST_ACTIVITY_AT = "last_activity_at"
    private const val KEY_LAST_SOURCE = "last_source"
    private const val FUTURE_CLOCK_SKEW_MS = 60_000L
    private const val SOURCE_ACCESSIBILITY = "ACCESSIBILITY_TOUCH"
    private const val SOURCE_HEARTBEAT_PREFIX = "HEARTBEAT"

    private const val TAG_IDLE_TIMEOUT = "IDLE_TIMEOUT"
    private const val TAG_IDLE_ACTIVITY = "IDLE_ACTIVITY"
    private const val TAG_HEARTBEAT = "HEARTBEAT"
    private const val TAG_ACCESSIBILITY = "ACCESSIBILITY"

    private val lock = Any()
    private val handler = Handler(Looper.getMainLooper())

    @Volatile
    private var initialized = false
    private lateinit var appContext: Context
    private var lastActivityAt: Long = 0L
    private var lastSource: String = "INIT"
    private var lastScheduleAt: Long = 0L
    private var timeoutRunnable: Runnable? = null

    fun initialize(context: Context) {
        if (initialized) {
            return
        }
        synchronized(lock) {
            if (initialized) {
                return
            }
            appContext = context.applicationContext
            loadStateLocked()
            if (lastActivityAt <= 0L) {
                lastActivityAt = System.currentTimeMillis()
                lastSource = "INIT"
                persistStateLocked()
            }
            scheduleTimeoutLocked(reason = "initialize", force = true)
            initialized = true
            Log.i(
                TAG_IDLE_TIMEOUT,
                "IdleCoordinator initialized timeoutMs=${IdleConfig.timeoutMs} lastActivityAt=$lastActivityAt"
            )
        }
    }

    fun resetFromAccessibility(context: Context, eventType: Int) {
        ensureInitialized(context)
        synchronized(lock) {
            val now = System.currentTimeMillis()
            lastActivityAt = maxOf(lastActivityAt, now)
            lastSource = SOURCE_ACCESSIBILITY
            persistStateLocked()
            Log.d(TAG_ACCESSIBILITY, "eventType=$eventType at=$now")
            Log.d(TAG_IDLE_ACTIVITY, "reset source=$SOURCE_ACCESSIBILITY at=$now")

            val shouldReschedule = now - lastScheduleAt >= IdleConfig.rescheduleDebounceMs
            if (shouldReschedule) {
                scheduleTimeoutLocked(
                    reason = "accessibility_event:$eventType",
                    force = true
                )
            }
        }
    }

    fun resetFromHeartbeat(context: Context, source: String, atMillis: Long, metaJson: String?) {
        ensureInitialized(context)
        synchronized(lock) {
            val now = System.currentTimeMillis()
            val normalizedSource = source.ifBlank { SOURCE_HEARTBEAT_PREFIX }
            val normalizedAt = when {
                atMillis <= 0L -> now
                atMillis > now + FUTURE_CLOCK_SKEW_MS -> now
                else -> atMillis
            }

            // A heartbeat arrival itself is activity; stale caller timestamps must still reset.
            val effectiveAt = if (normalizedAt < now - IdleConfig.timeoutMs) now else normalizedAt
            lastActivityAt = maxOf(lastActivityAt, effectiveAt)
            lastSource = "$SOURCE_HEARTBEAT_PREFIX:$normalizedSource"
            persistStateLocked()

            Log.d(
                TAG_HEARTBEAT,
                "source=$normalizedSource callerAt=$atMillis effectiveAt=$effectiveAt meta=${metaJson.orEmpty()}"
            )
            Log.d(TAG_IDLE_ACTIVITY, "reset source=$lastSource at=$effectiveAt")
            scheduleTimeoutLocked(reason = "heartbeat:$normalizedSource", force = true)
        }
    }

    fun forceTimeoutForDebug(context: Context, reason: String = "DEBUG_FORCE_TIMEOUT") {
        ensureInitialized(context)
        Log.w(TAG_IDLE_TIMEOUT, "forceTimeout reason=$reason")
        handleTimeout(reason = reason)
    }

    fun snapshot(context: Context): IdleSnapshot {
        ensureInitialized(context)
        synchronized(lock) {
            return IdleSnapshot(
                lastActivityAt = lastActivityAt,
                lastSource = lastSource,
                timeoutMs = IdleConfig.timeoutMs,
                isAccessibilityEnabled = AccessibilityStatusChecker.isAccessibilityEnabled(appContext)
            )
        }
    }

    private fun ensureInitialized(context: Context) {
        if (!initialized) {
            initialize(context)
        }
    }

    private fun scheduleTimeoutLocked(reason: String, force: Boolean, delayOverrideMs: Long? = null) {
        val now = System.currentTimeMillis()
        if (!force && now - lastScheduleAt < IdleConfig.rescheduleDebounceMs) {
            return
        }

        timeoutRunnable?.let { handler.removeCallbacks(it) }

        val delayMs = delayOverrideMs ?: (IdleConfig.timeoutMs - (now - lastActivityAt)).coerceAtLeast(0L)
        val runnable = Runnable { handleTimeout(reason) }
        timeoutRunnable = runnable
        lastScheduleAt = now
        handler.postDelayed(runnable, delayMs)

        Log.d(
            TAG_IDLE_TIMEOUT,
            "schedule reason=$reason delayMs=$delayMs lastSource=$lastSource lastActivityAt=$lastActivityAt"
        )
    }

    private fun handleTimeout(reason: String) {
        var shouldReturnHome = false
        val idleForMs = synchronized(lock) {
            val now = System.currentTimeMillis()
            val computedIdleForMs = now - lastActivityAt
            if (computedIdleForMs >= IdleConfig.timeoutMs) {
                shouldReturnHome = true
            } else {
                val remaining = IdleConfig.timeoutMs - computedIdleForMs
                scheduleTimeoutLocked(
                    reason = "timeout_recheck:$reason",
                    force = true,
                    delayOverrideMs = remaining
                )
            }
            computedIdleForMs
        }

        if (!shouldReturnHome) {
            return
        }

        Log.w(TAG_IDLE_TIMEOUT, "expired idleForMs=$idleForMs source=$lastSource reason=$reason")
        launchHome()

        synchronized(lock) {
            // Reset baseline to avoid immediate repeat timeout loops.
            lastActivityAt = System.currentTimeMillis()
            lastSource = "TIMEOUT_HOME"
            persistStateLocked()
            scheduleTimeoutLocked(reason = "post_timeout_home", force = true)
        }
    }

    private fun launchHome() {
        val homeIntent = Intent(Intent.ACTION_MAIN).apply {
            addCategory(Intent.CATEGORY_HOME)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        try {
            appContext.startActivity(homeIntent)
            Log.i(TAG_IDLE_TIMEOUT, "HOME intent dispatched")
        } catch (t: Throwable) {
            Log.e(TAG_IDLE_TIMEOUT, "Failed to dispatch HOME intent", t)
        }
    }

    private fun loadStateLocked() {
        val prefs = prefs()
        lastActivityAt = prefs.getLong(KEY_LAST_ACTIVITY_AT, 0L)
        lastSource = prefs.getString(KEY_LAST_SOURCE, "INIT").orEmpty().ifBlank { "INIT" }
    }

    private fun persistStateLocked() {
        prefs().edit()
            .putLong(KEY_LAST_ACTIVITY_AT, lastActivityAt)
            .putString(KEY_LAST_SOURCE, lastSource)
            .apply()
    }

    private fun prefs() = appContext.getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE)
}
