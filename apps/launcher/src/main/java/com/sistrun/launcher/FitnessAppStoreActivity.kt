package com.sistrun.launcher

import android.annotation.SuppressLint
import android.content.Intent
import android.os.Bundle
import android.webkit.JavascriptInterface
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.appcompat.app.AppCompatActivity
import com.sistrun.launcher.databinding.ActivityFitnessAppStoreBinding

class FitnessAppStoreActivity : AppCompatActivity() {

    private lateinit var binding: ActivityFitnessAppStoreBinding

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityFitnessAppStoreBinding.inflate(layoutInflater)
        setContentView(binding.root)

        binding.webView.settings.javaScriptEnabled = true
        binding.webView.settings.domStorageEnabled = true
        binding.webView.settings.useWideViewPort = true
        binding.webView.settings.loadWithOverviewMode = true
        binding.webView.addJavascriptInterface(StoreBridge(), "AndroidBridge")
        binding.webView.webViewClient = object : WebViewClient() {
            override fun onPageFinished(view: WebView?, url: String?) {
                super.onPageFinished(view, url)
                bindPageActions()
            }
        }

        binding.webView.loadUrl("file:///android_asset/fitness_app_store_market.html")
    }

    private fun bindPageActions() {
        val js = """
            (function () {
              const links = Array.from(document.querySelectorAll('a'));
              const homeLink = links.find((link) => link.innerText.includes('Home'));
              if (homeLink && !homeLink.dataset.androidBound) {
                homeLink.dataset.androidBound = '1';
                homeLink.addEventListener('click', function (event) {
                  event.preventDefault();
                  AndroidBridge.goHome();
                });
              }
              const drawerLink = links.find((link) => link.innerText.includes('Downloads'));
              if (drawerLink && !drawerLink.dataset.androidBound) {
                drawerLink.dataset.androidBound = '1';
                drawerLink.addEventListener('click', function (event) {
                  event.preventDefault();
                  AndroidBridge.openDrawer();
                });
              }
            })();
        """.trimIndent()
        binding.webView.evaluateJavascript(js, null)
    }

    override fun onBackPressed() {
        if (binding.webView.canGoBack()) {
            binding.webView.goBack()
            return
        }
        super.onBackPressed()
    }

    private inner class StoreBridge {
        @JavascriptInterface
        fun goHome() {
            runOnUiThread {
                startActivity(
                    Intent(this@FitnessAppStoreActivity, MainActivity::class.java).apply {
                        addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
                    }
                )
            }
        }

        @JavascriptInterface
        fun openDrawer() {
            runOnUiThread {
                startActivity(Intent(this@FitnessAppStoreActivity, AppDrawerActivity::class.java))
            }
        }
    }
}
