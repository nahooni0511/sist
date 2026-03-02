import { InstallClassification, InstalledAppInfo, StoreApp } from "./types";

export function classifyPackage(app: StoreApp, installed: InstalledAppInfo | undefined): InstallClassification {
  if (!installed) {
    return "NEW_INSTALL";
  }
  if (app.latestRelease.versionCode > installed.versionCode) {
    return "UPDATE";
  }
  return "LATEST";
}

export function buildInstalledMap(installedApps: InstalledAppInfo[]): Record<string, InstalledAppInfo> {
  return Object.fromEntries(installedApps.map((item) => [item.packageName, item]));
}
