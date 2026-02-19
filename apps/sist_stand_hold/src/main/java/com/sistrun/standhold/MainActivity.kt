package com.sistrun.standhold

import android.Manifest
import android.content.Intent
import android.content.pm.ActivityInfo
import android.content.pm.PackageManager
import android.os.Bundle
import android.os.SystemClock
import android.util.Size
import androidx.activity.OnBackPressedCallback
import androidx.activity.viewModels
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageProxy
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.core.content.ContextCompat
import androidx.core.view.isVisible
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.lifecycleScope
import androidx.lifecycle.repeatOnLifecycle
import androidx.recyclerview.widget.LinearLayoutManager
import com.sistrun.standhold.camera.CameraFrameEncoder
import com.sistrun.standhold.databinding.ActivityMainBinding
import com.sistrun.standhold.ui.TemplateAdapter
import kotlinx.coroutines.launch
import java.util.Locale
import java.util.concurrent.Executors

class MainActivity : AppCompatActivity() {

    private lateinit var binding: ActivityMainBinding
    private val viewModel: StandHoldViewModel by viewModels()
    private var cameraProvider: ProcessCameraProvider? = null
    private val cameraAnalysisExecutor = Executors.newSingleThreadExecutor()
    @Volatile
    private var lastFrameSentAtMs: Long = 0L

    private val templateAdapter = TemplateAdapter { index ->
        viewModel.selectTemplate(index)
    }

    private val cameraPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestPermission(),
    ) { isGranted ->
        if (isGranted) {
            binding.cameraPermissionTextView.isVisible = false
            startCameraPreview()
        } else {
            binding.cameraPermissionTextView.isVisible = true
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_LANDSCAPE
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                // Kiosk mode: OS back action is intentionally disabled.
            }
        })

        binding.backButton.setOnClickListener {
            navigateToHomeScreen()
        }

        binding.templateRecyclerView.layoutManager = LinearLayoutManager(this)
        binding.templateRecyclerView.adapter = templateAdapter

        binding.connectButton.setOnClickListener {
            if (viewModel.uiState.value.isConnected) {
                viewModel.disconnect()
            } else {
                val host = binding.aiBoxIpEditText.text?.toString()?.trim().orEmpty()
                viewModel.connect(host)
            }
        }

        binding.retryButton.setOnClickListener {
            viewModel.startSessionByButton()
        }

        syncAiBoxIpFromSharedSetting()
        viewModel.loadTemplates(assets)
        ensureCameraPermissionAndStartPreview()
        observeUiState()
    }

    override fun onResume() {
        super.onResume()
        requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_LANDSCAPE
        syncAiBoxIpFromSharedSetting()
        ensureCameraPermissionAndStartPreview()
    }

    override fun onStop() {
        stopCameraPreview()
        viewModel.disconnectForBackground()
        super.onStop()
    }

    override fun onDestroy() {
        stopCameraPreview()
        cameraAnalysisExecutor.shutdownNow()
        super.onDestroy()
    }

    private fun observeUiState() {
        lifecycleScope.launch {
            repeatOnLifecycle(Lifecycle.State.STARTED) {
                viewModel.uiState.collect { render(it) }
            }
        }
    }

    private fun render(state: StandHoldUiState) {
        binding.statusTextView.text = if (state.serverInfo.isBlank()) {
            state.status
        } else {
            "${state.status} | ${state.serverInfo}"
        }

        binding.connectButton.text = if (state.isConnected) {
            getString(R.string.disconnect)
        } else {
            getString(R.string.connect)
        }

        binding.retryButton.isEnabled = state.isConnected && state.templates.isNotEmpty()

        templateAdapter.submit(
            newItems = state.templates.map { TemplateAdapter.Item(it.bitmap) },
            selected = state.selectedTemplateIndex,
        )

        val selectedTemplate = state.templates.getOrNull(state.selectedTemplateIndex)
        binding.selectedTemplateImageView.setImageBitmap(selectedTemplate?.bitmap)

        binding.poseOverlay.setLandmarks(state.landmarks)

        binding.countdownTextView.isVisible = !state.showResult && state.countdownSec != null
        if (state.countdownSec != null) {
            binding.countdownTextView.text = state.countdownSec.toString()
        }

        binding.currentScoreTextView.text = "Score: ${state.currentScore?.let(::formatScore) ?: "-"}"
        binding.bestScoreTextView.text = "Best: ${state.bestScore?.let(::formatScore) ?: "-"}"

        binding.measurementContainer.isVisible = !state.showResult
        binding.resultContainer.isVisible = state.showResult

        if (state.showResult) {
            binding.resultReferenceImageView.setImageBitmap(state.resultReference)
            binding.resultBestFrameImageView.setImageBitmap(state.resultBestFrame ?: state.liveFrame)
            binding.resultScoreTextView.text = "Best Score: ${state.resultScore?.let(::formatScore) ?: "-"}"
            binding.feedbackTextView.text = buildString {
                append(state.feedback.ifBlank { getString(R.string.no_result_feedback) })
                if (state.feedbackModel.isNotBlank()) {
                    append("\n\n(model: ")
                    append(state.feedbackModel)
                    append(")")
                }
            }
        }
    }

    private fun formatScore(value: Float): String {
        return String.format(Locale.US, "%.1f", value)
    }

    private fun syncAiBoxIpFromSharedSetting() {
        val sharedIp = SharedAiBoxIpResolver.read(this) ?: return
        val current = binding.aiBoxIpEditText.text?.toString()?.trim().orEmpty()
        if (current != sharedIp) {
            binding.aiBoxIpEditText.setText(sharedIp)
        }
    }

    private fun ensureCameraPermissionAndStartPreview() {
        if (hasCameraPermission()) {
            binding.cameraPermissionTextView.isVisible = false
            startCameraPreview()
        } else {
            binding.cameraPermissionTextView.isVisible = true
            cameraPermissionLauncher.launch(Manifest.permission.CAMERA)
        }
    }

    private fun hasCameraPermission(): Boolean {
        return ContextCompat.checkSelfPermission(
            this,
            Manifest.permission.CAMERA,
        ) == PackageManager.PERMISSION_GRANTED
    }

    private fun startCameraPreview() {
        val providerFuture = ProcessCameraProvider.getInstance(this)
        providerFuture.addListener(
            {
                val provider = runCatching { providerFuture.get() }.getOrNull() ?: return@addListener
                cameraProvider = provider

                val preview = Preview.Builder()
                    .build()
                    .also { useCase ->
                        useCase.setSurfaceProvider(binding.cameraPreviewView.surfaceProvider)
                    }
                val analysis = ImageAnalysis.Builder()
                    .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                    .setTargetResolution(Size(CAMERA_ANALYSIS_WIDTH, CAMERA_ANALYSIS_HEIGHT))
                    .build()
                    .also { useCase ->
                        useCase.setAnalyzer(cameraAnalysisExecutor, ::analyzeFrame)
                    }

                val frontSelector = CameraSelector.Builder()
                    .requireLensFacing(CameraSelector.LENS_FACING_FRONT)
                    .build()
                val backSelector = CameraSelector.Builder()
                    .requireLensFacing(CameraSelector.LENS_FACING_BACK)
                    .build()

                val bound = runCatching {
                    provider.unbindAll()
                    provider.bindToLifecycle(this, frontSelector, preview, analysis)
                }.isSuccess || runCatching {
                    provider.unbindAll()
                    provider.bindToLifecycle(this, backSelector, preview, analysis)
                }.isSuccess

                binding.cameraPermissionTextView.isVisible = !bound
            },
            ContextCompat.getMainExecutor(this),
        )
    }

    private fun analyzeFrame(imageProxy: ImageProxy) {
        try {
            if (!viewModel.uiState.value.isConnected) {
                return
            }
            val nowMs = SystemClock.elapsedRealtime()
            if (nowMs - lastFrameSentAtMs < CAMERA_FRAME_SEND_INTERVAL_MS) {
                return
            }
            val encoded = CameraFrameEncoder.encode(
                imageProxy = imageProxy,
                jpegQuality = CAMERA_FRAME_JPEG_QUALITY,
            ) ?: return
            lastFrameSentAtMs = nowMs
            viewModel.submitCameraFrame(encoded)
        } finally {
            imageProxy.close()
        }
    }

    private fun stopCameraPreview() {
        cameraProvider?.unbindAll()
        cameraProvider = null
        lastFrameSentAtMs = 0L
    }

    private fun navigateToHomeScreen() {
        startActivity(
            Intent(Intent.ACTION_MAIN).apply {
                addCategory(Intent.CATEGORY_HOME)
                flags = Intent.FLAG_ACTIVITY_NEW_TASK
            },
        )
    }

    companion object {
        private const val CAMERA_ANALYSIS_WIDTH = 640
        private const val CAMERA_ANALYSIS_HEIGHT = 360
        private const val CAMERA_FRAME_SEND_INTERVAL_MS = 120L
        private const val CAMERA_FRAME_JPEG_QUALITY = 68
    }
}
