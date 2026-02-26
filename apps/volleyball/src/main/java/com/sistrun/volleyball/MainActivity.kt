package com.sistrun.volleyball

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.webkit.WebChromeClient
import android.webkit.ValueCallback
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import com.sistrun.volleyball.databinding.ActivityMainBinding

class MainActivity : AppCompatActivity() {

    private lateinit var binding: ActivityMainBinding
    private var fileChooserCallback: ValueCallback<Array<Uri>>? = null

    private val fileChooserLauncher =
        registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
            val callback = fileChooserCallback ?: return@registerForActivityResult
            val uris = if (result.resultCode == Activity.RESULT_OK) {
                extractUris(result.data)
            } else {
                null
            }
            callback.onReceiveValue(uris)
            fileChooserCallback = null
        }

    private val backPressedCallback = object : OnBackPressedCallback(true) {
        override fun handleOnBackPressed() {
            if (binding.webView.canGoBack()) {
                binding.webView.goBack()
            } else {
                isEnabled = false
                onBackPressedDispatcher.onBackPressed()
            }
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)
        onBackPressedDispatcher.addCallback(this, backPressedCallback)

        with(binding.webView) {
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.loadWithOverviewMode = true
            settings.useWideViewPort = true
            webChromeClient = object : WebChromeClient() {
                override fun onShowFileChooser(
                    webView: WebView?,
                    filePathCallback: ValueCallback<Array<Uri>>?,
                    fileChooserParams: FileChooserParams?,
                ): Boolean {
                    if (filePathCallback == null) {
                        return false
                    }

                    fileChooserCallback?.onReceiveValue(null)
                    fileChooserCallback = filePathCallback

                    val chooserIntent = runCatching {
                        fileChooserParams?.createIntent()
                    }.getOrNull() ?: Intent(Intent.ACTION_GET_CONTENT).apply {
                        addCategory(Intent.CATEGORY_OPENABLE)
                        type = "*/*"
                    }

                    if (chooserIntent.type == null) {
                        chooserIntent.type = "*/*"
                    }
                    chooserIntent.addCategory(Intent.CATEGORY_OPENABLE)

                    return runCatching {
                        fileChooserLauncher.launch(chooserIntent)
                        true
                    }.getOrElse {
                        fileChooserCallback = null
                        filePathCallback.onReceiveValue(null)
                        false
                    }
                }
            }
            webViewClient = object : WebViewClient() {
                override fun shouldOverrideUrlLoading(
                    view: WebView?,
                    request: WebResourceRequest?,
                ): Boolean = false
            }
        }

        if (savedInstanceState == null) {
            binding.webView.loadUrl(TARGET_URL)
        } else {
            binding.webView.restoreState(savedInstanceState)
        }
    }

    override fun onSaveInstanceState(outState: Bundle) {
        binding.webView.saveState(outState)
        super.onSaveInstanceState(outState)
    }

    override fun onDestroy() {
        fileChooserCallback?.onReceiveValue(null)
        fileChooserCallback = null
        binding.webView.apply {
            loadUrl("about:blank")
            clearHistory()
            removeAllViews()
            destroy()
        }
        super.onDestroy()
    }

    companion object {
        private const val TARGET_URL = "https://jct-volleyball.vercel.app/"
    }

    private fun extractUris(resultData: Intent?): Array<Uri>? {
        if (resultData == null) {
            return null
        }

        val dataUri = resultData.data
        val clipData = resultData.clipData
        if (clipData != null && clipData.itemCount > 0) {
            return Array(clipData.itemCount) { index ->
                clipData.getItemAt(index).uri
            }
        }
        return dataUri?.let { arrayOf(it) }
    }
}
