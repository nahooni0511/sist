package com.sistrun.launcher

import android.content.Intent
import android.graphics.Color
import android.os.Bundle
import android.view.KeyEvent
import android.view.LayoutInflater
import android.view.ViewGroup
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.recyclerview.widget.RecyclerView
import androidx.viewpager2.widget.ViewPager2
import com.bumptech.glide.Glide
import com.bumptech.glide.signature.ObjectKey
import com.google.android.material.card.MaterialCardView
import com.sistrun.launcher.databinding.ActivityWorkoutAppPickerBinding
import com.sistrun.launcher.databinding.ItemWorkoutAppCardBinding
import kotlin.math.abs
import kotlin.math.pow

class WorkoutAppPickerActivity : AppCompatActivity() {

    private lateinit var binding: ActivityWorkoutAppPickerBinding
    private val apps: List<WorkoutAppCard> = WorkoutAppCatalog.getApps()
    private var currentLogicalIndex: Int = 0

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityWorkoutAppPickerBinding.inflate(layoutInflater)
        setContentView(binding.root)
        enableImmersiveMode()

        if (apps.isEmpty()) {
            Toast.makeText(this, R.string.workout_picker_empty, Toast.LENGTH_SHORT).show()
            finish()
            return
        }

        bindPager()
        bindNavigation()
        updateSelectedApp(0)
    }

    override fun onResume() {
        super.onResume()
        enableImmersiveMode()
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) {
            enableImmersiveMode()
        }
    }

    private fun bindPager() {
        binding.cardPager.adapter = WorkoutCardAdapter(
            apps = apps,
            assetCacheToken = buildAssetCacheToken(),
            onCardSelected = ::launchSelectedApp
        )
        binding.cardPager.offscreenPageLimit = 5
        binding.cardPager.clipToPadding = false
        binding.cardPager.clipChildren = false
        binding.cardPager.getChildAt(0).overScrollMode = RecyclerView.OVER_SCROLL_NEVER

        binding.cardPager.setPageTransformer { page, position ->
            val clampedPosition = position.coerceIn(-2f, 2f)
            val distance = abs(clampedPosition)
            val depthFactor = (2f - distance).coerceAtLeast(0f)
            val centerFactor = (1f - distance).coerceIn(0f, 1f)

            page.cameraDistance = page.width * 14f
            page.pivotY = page.height * 0.5f
            page.pivotX = if (clampedPosition < 0f) page.width.toFloat() else 0f
            page.translationX = -clampedPosition * page.width * 0.52f
            page.rotationY = when {
                distance <= 1f -> -clampedPosition * 24f
                else -> -clampedPosition * 32f
            }
            page.scaleX = when {
                distance <= 1f -> lerp(1f, 0.76f, distance)
                else -> lerp(0.76f, 0.58f, distance - 1f)
            }
            page.scaleY = page.scaleX
            page.alpha = when {
                distance <= 1f -> lerp(1f, 0.22f, distance)
                else -> lerp(0.22f, 0.05f, distance - 1f)
            }
            page.translationZ = depthFactor * 10f

            val glowView = page.findViewById<CardGlowView>(R.id.cardGlow)
            val glowStrength = (1f - distance).coerceIn(0f, 1f).pow(0.78f)
            glowView?.setGlowIntensity(glowStrength)
            glowView?.alpha = glowStrength
            glowView?.scaleX = 1.08f + (centerFactor * 0.12f)
            glowView?.scaleY = 1.1f + (centerFactor * 0.14f)

            val cardView = page.findViewById<MaterialCardView>(R.id.cardContainer)
            cardView?.strokeWidth = lerp(dpToPx(1).toFloat(), dpToPx(2).toFloat(), centerFactor).toInt()
            cardView?.strokeColor = Color.argb(
                lerp(90f, 255f, centerFactor).toInt(),
                70,
                155,
                255
            )
        }

        if (apps.size > 1) {
            binding.cardPager.setCurrentItem(buildInitialVirtualPosition(), false)
        }

        binding.cardPager.registerOnPageChangeCallback(object : ViewPager2.OnPageChangeCallback() {
            override fun onPageSelected(position: Int) {
                currentLogicalIndex = toLogicalIndex(position)
                updateSelectedApp(currentLogicalIndex)
            }
        })
    }

    private fun bindNavigation() {
        binding.backButton.setOnClickListener {
            finish()
        }
        binding.previousButton.setOnClickListener { showPreviousCard() }
        binding.nextButton.setOnClickListener { showNextCard() }

        binding.root.setOnKeyListener { _, keyCode, event ->
            if (event.action != KeyEvent.ACTION_DOWN) {
                return@setOnKeyListener false
            }

            when (keyCode) {
                KeyEvent.KEYCODE_DPAD_LEFT -> {
                    showPreviousCard()
                    true
                }

                KeyEvent.KEYCODE_DPAD_RIGHT -> {
                    showNextCard()
                    true
                }

                else -> false
            }
        }
        binding.root.requestFocus()
    }

    private fun showPreviousCard() {
        if (apps.size <= 1) {
            return
        }
        binding.cardPager.setCurrentItem(binding.cardPager.currentItem - 1, true)
    }

    private fun showNextCard() {
        if (apps.size <= 1) {
            return
        }
        binding.cardPager.setCurrentItem(binding.cardPager.currentItem + 1, true)
    }

    private fun updateSelectedApp(position: Int) {
        val app = apps[position]
        binding.appNameText.text = app.name
        binding.appDescriptionText.text = app.description
        updateNavigationState()
    }

    private fun updateNavigationState() {
        val canNavigate = apps.size > 1
        binding.previousButton.isEnabled = canNavigate
        binding.nextButton.isEnabled = canNavigate
        binding.previousButton.alpha = if (canNavigate) 1f else 0.35f
        binding.nextButton.alpha = if (canNavigate) 1f else 0.35f
    }

    private fun launchSelectedApp(app: WorkoutAppCard) {
        val launchIntent = resolveLaunchIntent(app.packageName)
        if (launchIntent == null) {
            Toast.makeText(this, getString(R.string.app_not_installed, app.name), Toast.LENGTH_SHORT).show()
            return
        }

        launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        startActivity(launchIntent)
    }

    private fun resolveLaunchIntent(packageName: String): Intent? {
        packageManager.getLaunchIntentForPackage(packageName)?.let { return it }
        packageManager.getLeanbackLaunchIntentForPackage(packageName)?.let { return it }

        val launcherIntent = Intent(Intent.ACTION_MAIN).apply {
            addCategory(Intent.CATEGORY_LAUNCHER)
            setPackage(packageName)
        }
        packageManager.queryIntentActivities(launcherIntent, 0)
            .firstOrNull()
            ?.activityInfo
            ?.let { activityInfo ->
                return Intent(launcherIntent).setClassName(activityInfo.packageName, activityInfo.name)
            }

        val leanbackIntent = Intent(Intent.ACTION_MAIN).apply {
            addCategory(Intent.CATEGORY_LEANBACK_LAUNCHER)
            setPackage(packageName)
        }
        packageManager.queryIntentActivities(leanbackIntent, 0)
            .firstOrNull()
            ?.activityInfo
            ?.let { activityInfo ->
                return Intent(leanbackIntent).setClassName(activityInfo.packageName, activityInfo.name)
            }

        return null
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

    private fun dpToPx(value: Int): Int {
        return (value * resources.displayMetrics.density).toInt()
    }

    private fun lerp(start: Float, end: Float, fraction: Float): Float {
        val normalized = fraction.coerceIn(0f, 1f)
        return start + ((end - start) * normalized)
    }

    private fun buildInitialVirtualPosition(): Int {
        if (apps.isEmpty()) {
            return 0
        }
        val center = Int.MAX_VALUE / 2
        val aligned = center - (center % apps.size)
        return aligned + currentLogicalIndex
    }

    private fun toLogicalIndex(position: Int): Int {
        if (apps.isEmpty()) {
            return 0
        }
        return position % apps.size
    }

    private fun buildAssetCacheToken(): String {
        return runCatching {
            @Suppress("DEPRECATION")
            packageManager.getPackageInfo(packageName, 0).lastUpdateTime.toString()
        }.getOrDefault("0")
    }
}

private class WorkoutCardAdapter(
    private val apps: List<WorkoutAppCard>,
    private val assetCacheToken: String,
    private val onCardSelected: (WorkoutAppCard) -> Unit
) : RecyclerView.Adapter<WorkoutCardAdapter.WorkoutCardViewHolder>() {

    override fun getItemViewType(position: Int): Int = 0

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): WorkoutCardViewHolder {
        val inflater = LayoutInflater.from(parent.context)
        val binding = ItemWorkoutAppCardBinding.inflate(inflater, parent, false)
        return WorkoutCardViewHolder(binding)
    }

    override fun getItemCount(): Int {
        if (apps.isEmpty()) {
            return 0
        }
        return if (apps.size == 1) 1 else Int.MAX_VALUE
    }

    override fun onBindViewHolder(holder: WorkoutCardViewHolder, position: Int) {
        if (apps.isEmpty()) {
            return
        }
        holder.bind(
            app = apps[position % apps.size],
            assetCacheToken = assetCacheToken,
            onCardSelected = onCardSelected
        )
    }

    class WorkoutCardViewHolder(
        private val binding: ItemWorkoutAppCardBinding
    ) : RecyclerView.ViewHolder(binding.root) {

        fun bind(
            app: WorkoutAppCard,
            assetCacheToken: String,
            onCardSelected: (WorkoutAppCard) -> Unit
        ) {
            val imageSource: Any = app.imageUrl?.takeIf { it.isNotBlank() } ?: app.fallbackImageResId
            val imageCacheKey = app.imageUrl?.takeIf { it.isNotBlank() } ?: "res:${app.fallbackImageResId}"
            Glide.with(binding.cardImage)
                .load(imageSource)
                .signature(ObjectKey("$imageCacheKey@$assetCacheToken"))
                .placeholder(app.fallbackImageResId)
                .error(app.fallbackImageResId)
                .centerCrop()
                .into(binding.cardImage)

            binding.cardContainer.contentDescription = app.name
            binding.cardContainer.setOnClickListener {
                onCardSelected(app)
            }
            binding.cardContainer.setOnKeyListener { _, keyCode, event ->
                if (event.action != KeyEvent.ACTION_UP) {
                    return@setOnKeyListener false
                }

                when (keyCode) {
                    KeyEvent.KEYCODE_ENTER,
                    KeyEvent.KEYCODE_DPAD_CENTER -> {
                        onCardSelected(app)
                        true
                    }

                    else -> false
                }
            }
        }
    }
}
