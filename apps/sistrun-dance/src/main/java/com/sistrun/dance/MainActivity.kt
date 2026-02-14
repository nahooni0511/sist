package com.sistrun.dance

import android.os.Bundle
import androidx.activity.viewModels
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.isVisible
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.lifecycleScope
import androidx.lifecycle.repeatOnLifecycle
import androidx.media3.common.MediaItem
import androidx.media3.exoplayer.ExoPlayer
import com.sistrun.dance.databinding.ActivityMainBinding
import kotlinx.coroutines.launch

class MainActivity : AppCompatActivity() {

    private lateinit var binding: ActivityMainBinding
    private val viewModel: DanceViewModel by viewModels()

    private var player: ExoPlayer? = null
    private var currentRtspUrl: String? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)

        binding.connectButton.setOnClickListener {
            if (viewModel.uiState.value.isConnected) {
                viewModel.disconnect()
            } else {
                val aiBoxIp = binding.aiBoxIpEditText.text?.toString()?.trim().orEmpty()
                val fallbackRtspUrl = binding.rtspUrlEditText.text?.toString()?.trim()
                    ?.takeIf { it.isNotBlank() }
                viewModel.connect(aiBoxIp, fallbackRtspUrl)
            }
        }

        observeUiState()
    }

    private fun observeUiState() {
        lifecycleScope.launch {
            repeatOnLifecycle(Lifecycle.State.STARTED) {
                viewModel.uiState.collect { render(it) }
            }
        }
    }

    private fun render(state: DanceUiState) {
        binding.statusTextView.text = state.status
        binding.connectButton.text = if (state.isConnected) {
            getString(R.string.disconnect)
        } else {
            getString(R.string.connect)
        }

        binding.poseOverlay.setLandmarks(state.landmarks)

        when (state.streamMode) {
            StreamMode.RTSP -> {
                binding.playerView.isVisible = true
                binding.frameImageView.isVisible = false
                playRtspIfNeeded(state.rtspUrl)
            }

            StreamMode.EMBEDDED_FRAME -> {
                releasePlayer()
                binding.playerView.isVisible = false
                binding.frameImageView.isVisible = true
                binding.frameImageView.setImageBitmap(state.latestFrame)
            }

            StreamMode.NONE -> {
                releasePlayer()
                binding.playerView.isVisible = false
                binding.frameImageView.isVisible = false
            }
        }
    }

    private fun playRtspIfNeeded(rtspUrl: String?) {
        if (rtspUrl.isNullOrBlank()) {
            return
        }
        if (currentRtspUrl == rtspUrl && player != null) {
            return
        }

        releasePlayer()

        val newPlayer = ExoPlayer.Builder(this).build().also { exoPlayer ->
            binding.playerView.player = exoPlayer
            exoPlayer.setMediaItem(MediaItem.fromUri(rtspUrl))
            exoPlayer.prepare()
            exoPlayer.playWhenReady = true
        }

        player = newPlayer
        currentRtspUrl = rtspUrl
    }

    private fun releasePlayer() {
        player?.release()
        player = null
        currentRtspUrl = null
    }

    override fun onStop() {
        super.onStop()
        releasePlayer()
    }
}
