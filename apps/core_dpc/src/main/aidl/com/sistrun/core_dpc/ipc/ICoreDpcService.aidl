package com.sistrun.core_dpc.ipc;

import com.sistrun.core_dpc.ipc.DeviceOwnerStatusInfo;
import com.sistrun.core_dpc.ipc.ManagedAppInfo;
import com.sistrun.core_dpc.ipc.TaskStatusInfo;

interface ICoreDpcService {
    String requestInstall(String packageName, int versionCode, String url, String sha256, String metadataJson);
    String requestUpdate(String packageName, int versionCode, String url, String sha256, String metadataJson);
    String requestUninstall(String packageName);
    TaskStatusInfo getTaskStatus(String taskId);
    List<ManagedAppInfo> listInstalledManagedApps();
    DeviceOwnerStatusInfo isDeviceOwnerReady();
    TaskStatusInfo requestReboot(String reason);
    TaskStatusInfo applyBaselinePolicy();
    void reportUserActivity(String source, long atMillis, String metaJson);
    boolean isAccessibilityEnabled();
}
