import { NativeModules, Platform } from "react-native";
import * as IntentLauncher from "expo-intent-launcher";
import {
  DownloadIntegrity,
  DownloadResult,
  DownloadRequest,
  InstallResult,
  InstalledAppInfo,
  NativeDownloadStatus,
  NativeInstallerCapability
} from "./types";

type NativeBridgeModule = {
  getCapabilitiesAsync: () => Promise<NativeInstallerCapability>;
  listInstalledPackagesAsync: (packageNames: string[]) => Promise<InstalledAppInfo[]>;
  canRequestPackageInstallsAsync: () => Promise<boolean>;
  openUnknownSourcesSettingsAsync: () => Promise<void>;
  enqueueDownloadAsync: (request: DownloadRequest) => Promise<{ taskId: string }>;
  getDownloadStatusAsync: (taskId: string) => Promise<NativeDownloadStatus>;
  cancelDownloadAsync: (taskId: string) => Promise<void>;
  verifyFileIntegrityAsync: (fileUri: string, integrity: DownloadIntegrity) => Promise<DownloadResult>;
  installPackageSessionAsync: (params: {
    packageName: string;
    fileUri: string;
    isUpdate: boolean;
  }) => Promise<InstallResult>;
  openPendingUserActionAsync: (intentUri: string) => Promise<void>;
};

const nativeBridge: NativeBridgeModule | null = (NativeModules as { AppStoreInstaller?: NativeBridgeModule })
  .AppStoreInstaller ?? null;

function defaultCapabilities(): NativeInstallerCapability {
  return {
    packageInspector: false,
    packageInstallerSession: false,
    workManagerDownloader: false,
    canOpenUnknownSourcesSettings: Platform.OS === "android"
  };
}

export async function getNativeCapabilities(): Promise<NativeInstallerCapability> {
  if (!nativeBridge) {
    return defaultCapabilities();
  }

  try {
    return await nativeBridge.getCapabilitiesAsync();
  } catch {
    return defaultCapabilities();
  }
}

export async function listInstalledPackagesNative(packageNames: string[]): Promise<InstalledAppInfo[]> {
  if (!nativeBridge) {
    return [];
  }
  try {
    return await nativeBridge.listInstalledPackagesAsync(packageNames);
  } catch {
    return [];
  }
}

export async function canRequestPackageInstallsNative(): Promise<boolean> {
  if (Platform.OS !== "android") {
    return false;
  }
  if (!nativeBridge) {
    return false;
  }
  try {
    return await nativeBridge.canRequestPackageInstallsAsync();
  } catch {
    return false;
  }
}

export async function openUnknownSourcesSettingsNative(): Promise<void> {
  if (Platform.OS !== "android") {
    return;
  }

  if (nativeBridge) {
    try {
      await nativeBridge.openUnknownSourcesSettingsAsync();
      return;
    } catch {
      // fallback below
    }
  }

  await IntentLauncher.startActivityAsync("android.settings.MANAGE_UNKNOWN_APP_SOURCES");
}

export function hasNativeDownloadManager(): boolean {
  return Boolean(nativeBridge);
}

export async function enqueueDownloadNative(request: DownloadRequest): Promise<{ taskId: string } | null> {
  if (!nativeBridge) {
    return null;
  }
  try {
    return await nativeBridge.enqueueDownloadAsync(request);
  } catch {
    return null;
  }
}

export async function getDownloadStatusNative(taskId: string): Promise<NativeDownloadStatus | null> {
  if (!nativeBridge) {
    return null;
  }
  try {
    return await nativeBridge.getDownloadStatusAsync(taskId);
  } catch {
    return null;
  }
}

export async function verifyFileIntegrityNative(
  fileUri: string,
  integrity: DownloadIntegrity
): Promise<DownloadResult | null> {
  if (!nativeBridge) {
    return null;
  }
  try {
    return await nativeBridge.verifyFileIntegrityAsync(fileUri, integrity);
  } catch {
    return null;
  }
}

export async function installWithSessionNative(params: {
  packageName: string;
  fileUri: string;
  isUpdate: boolean;
}): Promise<InstallResult | null> {
  if (!nativeBridge) {
    return null;
  }
  try {
    return await nativeBridge.installPackageSessionAsync(params);
  } catch {
    return null;
  }
}

export async function openPendingUserActionNative(intentUri: string): Promise<void> {
  if (!intentUri) {
    return;
  }
  if (nativeBridge) {
    try {
      await nativeBridge.openPendingUserActionAsync(intentUri);
      return;
    } catch {
      // fallback below
    }
  }
  await IntentLauncher.startActivityAsync("android.intent.action.VIEW", {
    data: intentUri,
    flags: 1
  });
}
