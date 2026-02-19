package com.sistrun.manager

import android.content.Intent
import android.os.Bundle
import android.provider.Settings
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.recyclerview.widget.LinearLayoutManager
import com.sistrun.manager.databinding.ActivityMainBinding
import com.sistrun.manager.ipc.CoreDpcClient
import com.sistrun.manager.market.ApiClient
import com.sistrun.manager.market.MarketAdapter
import com.sistrun.manager.market.MarketApp
import com.sistrun.manager.market.UpdateCandidate
import com.sistrun.manager.settings.ManagerPrefs
import org.json.JSONObject
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

class MainActivity : AppCompatActivity() {

    private lateinit var binding: ActivityMainBinding
    private lateinit var marketAdapter: MarketAdapter
    private val executor: ExecutorService = Executors.newSingleThreadExecutor()
    private lateinit var coreDpcClient: CoreDpcClient

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)

        coreDpcClient = CoreDpcClient(this)

        setupTabs()
        setupMarketList()
        bindActions()

        val config = ManagerPrefs.load(this)
        applyConfigToInputs(config)

        AutoUpdateWorker.schedule(this)
    }

    override fun onStart() {
        super.onStart()
        val bound = coreDpcClient.bind()
        if (!bound) {
            binding.marketStatusText.text = "core_dpc 연결 실패"
        }
    }

    override fun onResume() {
        super.onResume()
        refreshDeviceOwnerState()
        loadMarketApps()

        if (intent.getBooleanExtra(AutoUpdateWorker.EXTRA_CHECK_UPDATES_NOW, false)) {
            runAutoUpdateCheckNow()
        }
    }

    override fun onStop() {
        super.onStop()
        coreDpcClient.unbind()
    }

    override fun onDestroy() {
        super.onDestroy()
        executor.shutdownNow()
    }

    private fun setupTabs() {
        binding.marketTabButton.setOnClickListener { showMarketPanel() }
        binding.settingsTabButton.setOnClickListener { showSettingsPanel() }
        showMarketPanel()
    }

    private fun setupMarketList() {
        marketAdapter = MarketAdapter { app ->
            if (!app.needsInstallOrUpdate) {
                Toast.makeText(this, getString(R.string.action_latest), Toast.LENGTH_SHORT).show()
                return@MarketAdapter
            }
            requestInstallOrUpdate(app)
        }

        binding.marketRecyclerView.layoutManager = LinearLayoutManager(this)
        binding.marketRecyclerView.adapter = marketAdapter
    }

    private fun bindActions() {
        binding.refreshMarketButton.setOnClickListener { loadMarketApps() }
        binding.checkAutoUpdateButton.setOnClickListener { runAutoUpdateCheckNow() }
        binding.saveSettingsButton.setOnClickListener { saveSettings() }
        binding.syncSettingsButton.setOnClickListener { syncSettingsFromServer() }
        binding.openSystemSettingsButton.setOnClickListener { openSystemSettings() }
        binding.checkDoStatusButton.setOnClickListener { refreshDeviceOwnerState() }
        binding.applyDoPolicyButton.setOnClickListener { applyDoBaselinePolicy() }
    }

    private fun showMarketPanel() {
        binding.marketPanel.visibility = android.view.View.VISIBLE
        binding.settingsPanel.visibility = android.view.View.GONE
        binding.marketTabButton.alpha = 1.0f
        binding.settingsTabButton.alpha = 0.7f
    }

    private fun showSettingsPanel() {
        binding.marketPanel.visibility = android.view.View.GONE
        binding.settingsPanel.visibility = android.view.View.VISIBLE
        binding.marketTabButton.alpha = 0.7f
        binding.settingsTabButton.alpha = 1.0f
    }

    private fun applyConfigToInputs(config: com.sistrun.manager.settings.ManagerConfig) {
        binding.serverUrlInput.setText(config.serverUrl)
        binding.deviceIdInput.setText(config.deviceId)
        binding.aiBoxIpInput.setText(config.aiBoxIp)
        binding.autoUpdateSwitch.isChecked = config.autoUpdateEnabled
        binding.extraSettingsInput.setText(ManagerPrefs.extrasToMultiline(config.extras))
    }

    private fun refreshDeviceOwnerState() {
        val ok = coreDpcClient.withService { service ->
            val status = service.isDeviceOwnerReady()
            runOnUiThread {
                binding.settingsStatusText.text = if (status.ready) {
                    "core_dpc DO 상태: READY"
                } else {
                    "core_dpc DO 상태: NOT READY (${status.reason})"
                }
            }
        }
        if (!ok) {
            binding.settingsStatusText.text = "core_dpc 연결 안됨: Device Owner 상태 확인 불가"
        }
    }

    private fun applyDoBaselinePolicy() {
        val ok = coreDpcClient.withService { service ->
            val result = service.applyBaselinePolicy()
            runOnUiThread {
                binding.settingsStatusText.text = "정책 적용 결과: ${result.status} (${result.message})"
            }
        }
        if (!ok) {
            binding.settingsStatusText.text = "core_dpc 연결 실패: 정책 적용 불가"
        }
    }

    private fun openSystemSettings() {
        val intent = Intent(Settings.ACTION_SETTINGS)
        if (intent.resolveActivity(packageManager) == null) {
            Toast.makeText(this, getString(R.string.system_settings_unavailable), Toast.LENGTH_SHORT).show()
            return
        }
        startActivity(intent)
    }

    private fun saveSettings() {
        val serverUrl = binding.serverUrlInput.text?.toString().orEmpty().trim()
        val deviceId = binding.deviceIdInput.text?.toString().orEmpty().trim()
        val aiBoxIp = binding.aiBoxIpInput.text?.toString().orEmpty().trim()
        val extrasRaw = binding.extraSettingsInput.text?.toString().orEmpty()

        if (serverUrl.isBlank() || deviceId.isBlank()) {
            binding.settingsStatusText.text = "서버 URL과 기기 ID를 입력하세요."
            return
        }

        val extras = ManagerPrefs.multilineToExtras(extrasRaw)
        ManagerPrefs.save(
            context = this,
            serverUrl = serverUrl,
            deviceId = deviceId,
            aiBoxIp = aiBoxIp,
            autoUpdateEnabled = binding.autoUpdateSwitch.isChecked,
            extras = extras
        )
        AutoUpdateWorker.schedule(this)

        binding.settingsStatusText.text = "설정이 저장되었습니다."
        Toast.makeText(this, "설정 저장 완료", Toast.LENGTH_SHORT).show()
    }

    private fun syncSettingsFromServer() {
        val serverUrl = binding.serverUrlInput.text?.toString().orEmpty().trim()
        if (serverUrl.isBlank()) {
            binding.settingsStatusText.text = "먼저 서버 URL을 입력하세요."
            return
        }

        binding.settingsStatusText.text = "서버 설정을 가져오는 중..."
        executor.execute {
            try {
                val settings = ApiClient.fetchSettings(serverUrl)
                ManagerPrefs.applyServerSettings(this, settings)
                val config = ManagerPrefs.load(this)
                runOnUiThread {
                    applyConfigToInputs(config)
                    binding.settingsStatusText.text = "서버 설정을 반영했습니다."
                    refreshDeviceOwnerState()
                }
            } catch (e: Exception) {
                runOnUiThread {
                    binding.settingsStatusText.text = "설정 동기화 실패: ${e.message}"
                }
            }
        }
    }

    private fun loadMarketApps() {
        val config = ManagerPrefs.load(this)
        binding.marketStatusText.text = "마켓 목록을 불러오는 중..."

        executor.execute {
            try {
                val installedVersions = fetchInstalledVersionsFromCoreDpc()
                val apps = ApiClient.fetchMarketApps(config.serverUrl, installedVersions)
                runOnUiThread {
                    marketAdapter.submitList(apps)
                    binding.marketStatusText.text = if (apps.isEmpty()) {
                        getString(R.string.market_empty)
                    } else {
                        "총 ${apps.size}개 앱"
                    }
                }
            } catch (e: Exception) {
                runOnUiThread {
                    marketAdapter.submitList(emptyList())
                    binding.marketStatusText.text = "마켓 조회 실패: ${e.message}"
                }
            }
        }
    }

    private fun runAutoUpdateCheckNow() {
        val config = ManagerPrefs.load(this)
        binding.marketStatusText.text = "자동업데이트 확인 중..."

        executor.execute {
            try {
                val installedVersions = fetchInstalledVersionsFromCoreDpc()
                val result = ApiClient.checkUpdates(config.serverUrl, config.deviceId, installedVersions)
                ManagerPrefs.applyServerSettings(this, result.settings)

                if (result.updates.isEmpty()) {
                    runOnUiThread {
                        binding.marketStatusText.text = "업데이트할 앱이 없습니다."
                        loadMarketApps()
                    }
                    return@execute
                }

                enqueueUpdateTasks(result.updates)
            } catch (e: Exception) {
                runOnUiThread {
                    binding.marketStatusText.text = "자동업데이트 실패: ${e.message}"
                }
            }
        }
    }

    private fun enqueueUpdateTasks(candidates: List<UpdateCandidate>) {
        val taskIds = mutableListOf<String>()
        val first = candidates.firstOrNull()

        val ok = coreDpcClient.withService { service ->
            candidates.forEach { candidate ->
                val metadata = JSONObject().apply {
                    put("source", "auto_update")
                    put("changelog", candidate.changelog)
                }.toString()

                val taskId = if (candidate.installedVersionCode < 0) {
                    service.requestInstall(
                        candidate.packageName,
                        candidate.targetVersionCode,
                        candidate.downloadUrl,
                        candidate.sha256,
                        metadata
                    )
                } else {
                    service.requestUpdate(
                        candidate.packageName,
                        candidate.targetVersionCode,
                        candidate.downloadUrl,
                        candidate.sha256,
                        metadata
                    )
                }
                taskIds += taskId
            }
        }

        if (!ok || taskIds.isEmpty()) {
            runOnUiThread {
                binding.marketStatusText.text = "core_dpc 호출 실패: 업데이트 작업 생성 불가"
            }
            return
        }

        runOnUiThread {
            val firstName = first?.displayName ?: "앱"
            binding.marketStatusText.text = "${taskIds.size}개 업데이트 작업 생성 완료 (첫 작업: $firstName)"
        }
        monitorTask(taskIds.first(), first?.displayName ?: "앱")
    }

    private fun requestInstallOrUpdate(app: MarketApp) {
        val metadata = JSONObject().apply {
            put("source", "manager_market")
            put("appId", app.appId)
            put("displayName", app.displayName)
            put("changelog", app.changelog)
        }.toString()

        var taskId: String? = null
        val ok = coreDpcClient.withService { service ->
            taskId = if (app.installedVersionCode < 0) {
                service.requestInstall(
                    app.packageName,
                    app.latestVersionCode,
                    app.downloadUrl,
                    app.sha256,
                    metadata
                )
            } else {
                service.requestUpdate(
                    app.packageName,
                    app.latestVersionCode,
                    app.downloadUrl,
                    app.sha256,
                    metadata
                )
            }
        }

        if (!ok || taskId.isNullOrBlank()) {
            binding.marketStatusText.text = "core_dpc 연결 실패: 설치 요청 불가"
            return
        }

        binding.marketStatusText.text = "${app.displayName} 작업 생성됨: $taskId"
        monitorTask(taskId.orEmpty(), app.displayName)
    }

    private fun fetchInstalledVersionsFromCoreDpc(): Map<String, Int> {
        var versions = emptyMap<String, Int>()
        val ok = coreDpcClient.withService { service ->
            val installed = service.listInstalledManagedApps()
                .filter { it.installed }
                .associate { it.packageName to it.versionCode }
            versions = installed
        }

        return if (ok) versions else emptyMap()
    }

    private fun monitorTask(taskId: String, label: String) {
        executor.execute {
            repeat(60) {
                Thread.sleep(1000)
                var done = false
                val ok = coreDpcClient.withService { service ->
                    val status = service.getTaskStatus(taskId)
                    runOnUiThread {
                        binding.marketStatusText.text =
                            "$label: ${status.status} (${status.progress}%) - ${status.message}"
                    }
                    done = status.status == "SUCCESS" || status.status == "FAILED" || status.status == "NOT_FOUND"
                }

                if (!ok) {
                    runOnUiThread {
                        binding.marketStatusText.text = "core_dpc 연결이 끊어져 작업 상태를 조회할 수 없습니다."
                    }
                    return@execute
                }

                if (done) {
                    runOnUiThread { loadMarketApps() }
                    return@execute
                }
            }

            runOnUiThread {
                binding.marketStatusText.text = "$label 작업 상태 조회 시간이 초과되었습니다."
                loadMarketApps()
            }
        }
    }
}
