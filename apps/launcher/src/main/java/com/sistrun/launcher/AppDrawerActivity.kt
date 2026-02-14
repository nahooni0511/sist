package com.sistrun.launcher

import android.annotation.SuppressLint
import android.content.Intent
import android.os.Bundle
import android.provider.DocumentsContract
import android.webkit.JavascriptInterface
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import com.sistrun.launcher.databinding.ActivityAppDrawerBinding
import org.json.JSONArray
import org.json.JSONObject

class AppDrawerActivity : AppCompatActivity() {

    private lateinit var binding: ActivityAppDrawerBinding
    private val drawerApps = listOf(
        DrawerApp("pe-board", "com.yourcompany.peboard", "sports_score"),
        DrawerApp("sistrun-dance", "com.sistrun.dance", "music_note"),
        DrawerApp("파일", "com.android.documentsui", "folder"),
        DrawerApp("game", null, "sports_esports")
    )

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityAppDrawerBinding.inflate(layoutInflater)
        setContentView(binding.root)
        enableImmersiveMode()

        binding.webView.settings.javaScriptEnabled = true
        binding.webView.settings.domStorageEnabled = true
        binding.webView.settings.useWideViewPort = true
        binding.webView.settings.loadWithOverviewMode = true
        binding.webView.addJavascriptInterface(AppDrawerBridge(), "AndroidBridge")
        binding.webView.webViewClient = object : WebViewClient() {
            override fun onPageFinished(view: WebView?, url: String?) {
                super.onPageFinished(view, url)
                bindPageActions()
            }
        }

        binding.webView.loadUrl("file:///android_asset/launcher_app_drawer.html")
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

    private fun bindPageActions() {
        val js = """
            (function () {
              const buttons = Array.from(document.querySelectorAll('button'));
              const homeButton = buttons.find((button) => button.innerText.includes('Home'));
              if (homeButton && !homeButton.dataset.androidBound) {
                homeButton.dataset.androidBound = '1';
                homeButton.addEventListener('click', function (event) {
                  event.preventDefault();
                  AndroidBridge.goHome();
                });
              }
              const storeButton = buttons.find((button) => button.innerText.includes('App Store'));
              if (storeButton && !storeButton.dataset.androidBound) {
                storeButton.dataset.androidBound = '1';
                storeButton.addEventListener('click', function (event) {
                  event.preventDefault();
                  AndroidBridge.openStore();
                });
              }

              const drawerApps = ${drawerApps.toJson()};
              const appGrid = document.querySelector('main .grid');
              if (!appGrid) {
                return;
              }
              const appButtons = Array.from(appGrid.querySelectorAll('button'));
              drawerApps.forEach((app, index) => {
                const button = appButtons[index];
                if (!button) {
                  return;
                }
                button.style.display = 'flex';
                button.style.opacity = '1';
                const icon = button.querySelector('.material-icons');
                if (icon) {
                  icon.textContent = app.icon;
                }
                const labels = Array.from(button.querySelectorAll('span'));
                if (labels.length > 0) {
                  labels[labels.length - 1].textContent = app.label;
                }
                button.dataset.androidPackageName = app.packageName || '';
                button.dataset.androidLabel = app.label;

                if (!button.dataset.androidAppBound) {
                  button.dataset.androidAppBound = '1';
                  const launchApp = function (event) {
                    event.preventDefault();
                    event.stopPropagation();
                    AndroidBridge.launchDrawerApp(button.dataset.androidPackageName || '', button.dataset.androidLabel || app.label);
                  };
                  button.addEventListener('click', launchApp);
                  button.addEventListener('touchend', launchApp);
                  button.addEventListener('pointerup', launchApp);
                  button.addEventListener('keydown', function (event) {
                    if (event.key === 'Enter' || event.key === ' ') {
                      launchApp(event);
                    }
                  });
                }
              });
              for (let index = drawerApps.length; index < appButtons.length; index += 1) {
                appButtons[index].style.display = 'none';
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

    private inner class AppDrawerBridge {
        @JavascriptInterface
        fun goHome() {
            runOnUiThread {
                startActivity(
                    Intent(this@AppDrawerActivity, MainActivity::class.java).apply {
                        addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
                    }
                )
            }
        }

        @JavascriptInterface
        fun openStore() {
            runOnUiThread {
                startActivity(Intent(this@AppDrawerActivity, FitnessAppStoreActivity::class.java))
            }
        }

        @JavascriptInterface
        fun launchDrawerApp(packageName: String, label: String) {
            runOnUiThread {
                val launchIntent = packageName.takeIf { it.isNotBlank() }?.let { resolveLaunchIntent(it) }
                    ?: if (isFileApp(packageName, label)) resolveFileAppIntent() else null
                if (launchIntent == null) {
                    Toast.makeText(
                        this@AppDrawerActivity,
                        getString(R.string.app_not_installed, label),
                        Toast.LENGTH_SHORT
                    ).show()
                    return@runOnUiThread
                }

                launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                startActivity(launchIntent)
            }
        }
    }

    private fun List<DrawerApp>.toJson(): String {
        val jsonArray = JSONArray()
        forEach { app ->
            jsonArray.put(
                JSONObject().apply {
                    put("label", app.label)
                    put("packageName", app.packageName ?: JSONObject.NULL)
                    put("icon", app.icon)
                }
            )
        }
        return jsonArray.toString()
    }

    private data class DrawerApp(
        val label: String,
        val packageName: String?,
        val icon: String
    )

    private fun isFileApp(packageName: String, label: String): Boolean {
        return packageName.contains("documentsui", ignoreCase = true) || label == "파일"
    }

    private fun resolveFileAppIntent(): Intent? {
        resolveLaunchIntent("com.android.documentsui")?.let { return it }
        resolveLaunchIntent("com.google.android.documentsui")?.let { return it }

        val appFilesIntent = Intent(Intent.ACTION_MAIN).apply {
            addCategory(Intent.CATEGORY_APP_FILES)
        }
        if (packageManager.resolveActivity(appFilesIntent, 0) != null) {
            return appFilesIntent
        }

        val openDocumentIntent = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
            addCategory(Intent.CATEGORY_OPENABLE)
            type = "*/*"
        }
        if (packageManager.resolveActivity(openDocumentIntent, 0) != null) {
            return openDocumentIntent
        }

        return Intent(Intent.ACTION_VIEW).apply {
            data = DocumentsContract.buildRootsUri("com.android.externalstorage.documents")
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }.takeIf { packageManager.resolveActivity(it, 0) != null }
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
}
