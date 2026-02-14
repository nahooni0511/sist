package com.sistrun.core_dpc

import android.content.Intent
import android.content.pm.ApplicationInfo
import android.os.Bundle
import android.provider.Settings
import android.text.format.DateFormat
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.isVisible
import com.sistrun.core_dpc.admin.DpmController
import com.sistrun.core_dpc.databinding.ActivityMainBinding
import com.sistrun.core_dpc.idle.IdleCoordinator
import com.sistrun.core_dpc.idle.IdleSnapshot

class MainActivity : AppCompatActivity() {

    private lateinit var binding: ActivityMainBinding
    private lateinit var dpmController: DpmController

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)

        dpmController = DpmController(this)
        IdleCoordinator.initialize(applicationContext)

        binding.refreshButton.setOnClickListener {
            renderStatus()
        }

        binding.applyPolicyButton.setOnClickListener {
            val result = dpmController.applyBaselinePolicies()
            binding.doReasonText.text = "${result.status}: ${result.message}"
            renderStatus()
        }

        binding.openAccessibilitySettingsButton.setOnClickListener {
            startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS))
        }

        configureDebugButtons()
        renderStatus()
    }

    override fun onResume() {
        super.onResume()
        renderStatus()
    }

    private fun configureDebugButtons() {
        val showDebug = applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE != 0
        binding.heartbeatTestButton.isVisible = showDebug
        binding.forceTimeoutButton.isVisible = showDebug
        if (!showDebug) {
            return
        }

        binding.heartbeatTestButton.setOnClickListener {
            IdleCoordinator.resetFromHeartbeat(
                context = applicationContext,
                source = "DEBUG_BUTTON",
                atMillis = System.currentTimeMillis(),
                metaJson = "{\"origin\":\"MainActivity\"}"
            )
            Toast.makeText(this, R.string.debug_action_done, Toast.LENGTH_SHORT).show()
            renderStatus()
        }

        binding.forceTimeoutButton.setOnClickListener {
            IdleCoordinator.forceTimeoutForDebug(
                context = applicationContext,
                reason = "debug_button"
            )
            Toast.makeText(this, R.string.debug_action_done, Toast.LENGTH_SHORT).show()
            renderStatus()
        }
    }

    private fun renderStatus() {
        renderDoStatus()
        val snapshot = IdleCoordinator.snapshot(applicationContext)
        renderAccessibilityStatus(snapshot)
        renderIdleStatus(snapshot)
    }

    private fun renderDoStatus() {
        val status = dpmController.isDeviceOwnerReady()
        binding.doStatusText.text = if (status.ready) {
            getString(R.string.do_ready_true)
        } else {
            getString(R.string.do_ready_false)
        }
        binding.doReasonText.text = status.reason
    }

    private fun renderAccessibilityStatus(snapshot: IdleSnapshot) {
        binding.accessibilityStatusText.text = if (snapshot.isAccessibilityEnabled) {
            getString(R.string.accessibility_status_on)
        } else {
            getString(R.string.accessibility_status_off)
        }
        binding.accessibilityWarningText.isVisible = !snapshot.isAccessibilityEnabled
    }

    private fun renderIdleStatus(snapshot: IdleSnapshot) {
        val formattedAt = DateFormat.format("yyyy-MM-dd HH:mm:ss", snapshot.lastActivityAt).toString()
        binding.idleStatusText.text = getString(
            R.string.idle_status_format,
            snapshot.lastSource,
            formattedAt,
            snapshot.timeoutMs / 1000L
        )
    }
}
