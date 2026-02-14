package com.sistrun.launcher

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.util.Log
import android.view.Gravity
import android.widget.FrameLayout
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import com.sistrun.launcher.databinding.ActivityMainBinding
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import kotlin.math.max

class MainActivity : AppCompatActivity() {

    private lateinit var binding: ActivityMainBinding
    private val workoutPackageName = "com.example.fluttter_data_park"
    private val registeredApps = LauncherApps.registeredApps()
    private val clockHandler = Handler(Looper.getMainLooper())
    private val timeFormatter = SimpleDateFormat("HH:mm", Locale.getDefault())
    private val dateFormatter = SimpleDateFormat("EEEE, MMM d", Locale.ENGLISH)
    private val backgroundVideoResIds = listOf(
        R.raw.ad_example1,
        R.raw.ad_example2
    )
    private var currentBackgroundVideoIndex = 0
    private var videoWidth = 0
    private var videoHeight = 0
    private val clockTick = object : Runnable {
        override fun run() {
            updateClock()
            clockHandler.postDelayed(this, 60_000L)
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)
        enableImmersiveMode()

        updateClock()
        scheduleClockTick()
        bindBackgroundVideo()

        binding.startButton.requestFocus()

        binding.startButton.setOnClickListener {
            launchWorkoutApp()
        }

        binding.storeButton.setOnClickListener {
            startActivity(Intent(this, AppDrawerActivity::class.java))
        }

        binding.appDrawerButton.setOnClickListener {
            launchManagerApp()
        }

        binding.adminHotspot.setOnClickListener {
            launchManagerApp()
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        clockHandler.removeCallbacks(clockTick)
        binding.videoBackground.stopPlayback()
    }

    override fun onResume() {
        super.onResume()
        enableImmersiveMode()
        applyVideoCenterCrop()
        if (!binding.videoBackground.isPlaying) {
            binding.videoBackground.start()
        }
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) {
            enableImmersiveMode()
        }
    }

    override fun onPause() {
        super.onPause()
        binding.videoBackground.pause()
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        // Keep launcher in foreground instead of finishing on BACK.
    }

    private fun launchWorkoutApp() {
        val launchIntent = packageManager.getLaunchIntentForPackage(workoutPackageName)
        if (launchIntent == null) {
            Toast.makeText(
                this,
                getString(R.string.app_not_installed, workoutPackageName),
                Toast.LENGTH_SHORT
            ).show()
            return
        }

        launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        startActivity(launchIntent)
    }

    private fun launchAnyRegisteredApp() {
        val launchableApp = registeredApps.firstOrNull { LauncherApps.resolveLaunchIntent(this, it) != null }
        if (launchableApp != null) {
            launchRegisteredApp(launchableApp, fallbackToSettings = true)
            return
        }
        startActivity(Intent(Settings.ACTION_SETTINGS))
        Toast.makeText(this, getString(R.string.fallback_open_settings), Toast.LENGTH_SHORT).show()
    }

    private fun launchManagerApp() {
        val managerPackageName = "com.sistrun.manager"
        val launchIntent = packageManager.getLaunchIntentForPackage(managerPackageName)
        if (launchIntent != null) {
            launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            startActivity(launchIntent)
            return
        }

        Toast.makeText(this, getString(R.string.manager_not_installed), Toast.LENGTH_SHORT).show()
        startActivity(Intent(this, AppDrawerActivity::class.java))
    }

    private fun launchRegisteredApp(app: RegisteredApp, fallbackToSettings: Boolean) {
        val launchIntent = LauncherApps.resolveLaunchIntent(this, app)
        if (launchIntent == null) {
            Toast.makeText(
                this,
                getString(R.string.app_not_installed, app.label),
                Toast.LENGTH_SHORT
            ).show()
            if (fallbackToSettings) {
                startActivity(Intent(Settings.ACTION_SETTINGS))
            }
            return
        }

        launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        startActivity(launchIntent)
    }

    private fun updateClock() {
        val now = Date()
        binding.timeText.text = timeFormatter.format(now)
        binding.dateText.text = dateFormatter.format(now)
    }

    private fun scheduleClockTick() {
        val delayUntilNextMinute = 60_000L - (System.currentTimeMillis() % 60_000L)
        clockHandler.postDelayed(clockTick, delayUntilNextMinute)
    }

    private fun bindBackgroundVideo() {
        binding.videoBackground.setOnPreparedListener { player ->
            videoWidth = player.videoWidth
            videoHeight = player.videoHeight
            player.isLooping = false
            player.setVolume(0f, 0f)
            applyVideoCenterCrop()
            binding.videoBackground.start()
        }
        binding.videoBackground.setOnCompletionListener {
            playNextBackgroundVideo()
        }
        binding.videoBackground.setOnErrorListener { _, _, _ ->
            playNextBackgroundVideo()
            true
        }
        playCurrentBackgroundVideo()
    }

    private fun playCurrentBackgroundVideo() {
        if (backgroundVideoResIds.isEmpty()) {
            return
        }

        val resId = backgroundVideoResIds[currentBackgroundVideoIndex]
        Log.i(TAG, "Playing background video index=$currentBackgroundVideoIndex resId=$resId")
        val videoUri = Uri.parse("android.resource://$packageName/$resId")
        binding.videoBackground.setVideoURI(videoUri)
    }

    private fun playNextBackgroundVideo() {
        if (backgroundVideoResIds.isEmpty()) {
            return
        }

        currentBackgroundVideoIndex = (currentBackgroundVideoIndex + 1) % backgroundVideoResIds.size
        playCurrentBackgroundVideo()
    }

    private fun applyVideoCenterCrop() {
        if (videoWidth <= 0 || videoHeight <= 0) {
            return
        }

        binding.videoBackground.post {
            val containerWidth = binding.videoContainer.width
            val containerHeight = binding.videoContainer.height
            if (containerWidth <= 0 || containerHeight <= 0) {
                return@post
            }

            val scale = max(
                containerWidth.toFloat() / videoWidth.toFloat(),
                containerHeight.toFloat() / videoHeight.toFloat()
            )
            val scaledWidth = (videoWidth * scale).toInt()
            val scaledHeight = (videoHeight * scale).toInt()
            val layoutParams = binding.videoBackground.layoutParams as FrameLayout.LayoutParams
            layoutParams.width = scaledWidth
            layoutParams.height = scaledHeight
            layoutParams.gravity = Gravity.CENTER
            binding.videoBackground.layoutParams = layoutParams
        }
    }

    private fun enableImmersiveMode() {
        WindowCompat.setDecorFitsSystemWindows(window, false)
        val insetsController = WindowInsetsControllerCompat(window, window.decorView)
        insetsController.systemBarsBehavior =
            WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        insetsController.hide(
            WindowInsetsCompat.Type.statusBars() or WindowInsetsCompat.Type.navigationBars()
        )
    }

    companion object {
        private const val TAG = "LAUNCHER_VIDEO"
    }
}
