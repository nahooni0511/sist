import AsyncStorage from "@react-native-async-storage/async-storage";

const INSTALLED_VERSION_KEY = "app_store_installed_versions_v1";

export type InstalledVersionMap = Record<string, number>;

export async function loadInstalledVersions(): Promise<InstalledVersionMap> {
  const raw = await AsyncStorage.getItem(INSTALLED_VERSION_KEY);
  if (!raw) {
    return {};
  }

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const entries = Object.entries(parsed).filter(([, value]) => Number.isFinite(Number(value)));
    return Object.fromEntries(entries.map(([pkg, value]) => [pkg, Number(value)]));
  } catch {
    return {};
  }
}

export async function saveInstalledVersions(versions: InstalledVersionMap): Promise<void> {
  await AsyncStorage.setItem(INSTALLED_VERSION_KEY, JSON.stringify(versions));
}

export async function saveInstalledVersion(
  packageName: string,
  versionCode: number,
  current: InstalledVersionMap
): Promise<InstalledVersionMap> {
  const next = {
    ...current,
    [packageName]: versionCode
  };
  await saveInstalledVersions(next);
  return next;
}
