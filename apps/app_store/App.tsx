import { StatusBar } from "expo-status-bar";
import * as FileSystem from "expo-file-system/legacy";
import * as IntentLauncher from "expo-intent-launcher";
import * as Linking from "expo-linking";
import { LinearGradient } from "expo-linear-gradient";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View
} from "react-native";
import {
  API_BASE_URL,
  fetchStoreApps,
  getCurrentApiBaseUrl,
  postStoreEvent,
  syncStoreDevice
} from "./src/api";
import { getOrCreateDeviceId } from "./src/deviceIdentity";
import { MOCK_APPS } from "./src/mockApps";
import { StoreApp, StoreSyncPackage } from "./src/types";
import { InstalledVersionMap, loadInstalledVersions, saveInstalledVersion } from "./src/versionStore";

type Segment = "all" | "updates" | "installed";

function sanitizeFileToken(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function formatBytes(bytes: number): string {
  if (bytes <= 0) {
    return "-";
  }

  const units = ["B", "KB", "MB", "GB"];
  let size = bytes;
  let index = 0;
  while (size >= 1024 && index < units.length - 1) {
    size /= 1024;
    index += 1;
  }
  return `${size.toFixed(size >= 10 || index === 0 ? 0 : 1)} ${units[index]}`;
}

function actionLabel(installedVersion: number, latestVersion: number): string {
  if (installedVersion < 0) {
    return "받기";
  }
  if (latestVersion > installedVersion) {
    return "업데이트";
  }
  return "최신";
}

const SYNC_INTERVAL_MS = 60_000;
const APP_STORE_VERSION = process.env.EXPO_PUBLIC_APP_STORE_VERSION?.trim() || "1.0.0";

export default function App() {
  const { width } = useWindowDimensions();
  const isTablet = width >= 700;
  const numColumns = width >= 980 ? 3 : width >= 680 ? 2 : 1;

  const [apps, setApps] = useState<StoreApp[]>([]);
  const [installedVersions, setInstalledVersions] = useState<InstalledVersionMap>({});
  const [deviceId, setDeviceId] = useState("");
  const [apiBaseUrl, setApiBaseUrl] = useState(API_BASE_URL);
  const [search, setSearch] = useState("");
  const [segment, setSegment] = useState<Segment>("all");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [bannerMessage, setBannerMessage] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState("");
  const [availableUpdateCount, setAvailableUpdateCount] = useState(0);
  const [downloading, setDownloading] = useState<Record<string, boolean>>({});
  const [downloadProgress, setDownloadProgress] = useState<Record<string, number>>({});

  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    void getOrCreateDeviceId().then((id) => {
      if (cancelled || !mountedRef.current) {
        return;
      }
      setDeviceId(id);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const reportStoreEvent = useCallback(
    async (input: {
      packageName: string;
      appId?: string;
      releaseId?: string;
      targetVersionName?: string;
      targetVersionCode?: number;
      eventType:
        | "CHECK_UPDATES"
        | "DOWNLOAD_STARTED"
        | "DOWNLOAD_FINISHED"
        | "INSTALL_REQUESTED"
        | "INSTALL_SUCCESS"
        | "INSTALL_FAILED"
        | "SYNC_COMPLETED";
      status?: "INFO" | "SUCCESS" | "FAILED";
      message?: string;
      metadata?: Record<string, unknown>;
    }) => {
      if (!deviceId) {
        return;
      }
      try {
        await postStoreEvent(deviceId, input);
      } catch {
        // 이벤트 전송 실패는 사용자 동작을 막지 않는다.
      }
    },
    [deviceId]
  );

  const syncInBackground = useCallback(
    async (nextApps: StoreApp[], localVersions: InstalledVersionMap, silent = true) => {
      if (!deviceId) {
        return;
      }

      const packageToApp = new Map(nextApps.map((item) => [item.packageName, item]));
      const packages: StoreSyncPackage[] = Object.entries(localVersions)
        .filter(([, versionCode]) => Number.isFinite(versionCode) && versionCode >= 0)
        .map(([packageName, versionCode]) => {
          const app = packageToApp.get(packageName);
          const versionName =
            app && app.latestRelease.versionCode === versionCode ? app.latestRelease.versionName : undefined;

          return {
            packageName,
            versionCode,
            versionName
          };
        });

      try {
        setSyncing(true);
        const syncResult = await syncStoreDevice({
          deviceId,
          deviceName: deviceId,
          modelName: isTablet ? "sistrun-tablet" : "sistrun-phone",
          platform: Platform.OS,
          osVersion: String(Platform.Version),
          appStoreVersion: APP_STORE_VERSION,
          packages
        });

        if (!mountedRef.current) {
          return;
        }

        setApiBaseUrl(getCurrentApiBaseUrl());
        setLastSyncedAt(syncResult.syncedAt);
        setAvailableUpdateCount(syncResult.updates.length);

        if (!silent) {
          setBannerMessage(
            syncResult.updates.length > 0
              ? `백그라운드 동기화 완료: 업데이트 ${syncResult.updates.length}개`
              : "백그라운드 동기화 완료"
          );
        }

        await reportStoreEvent({
          packageName: "__app_store__",
          eventType: "SYNC_COMPLETED",
          status: "SUCCESS",
          message: `updates=${syncResult.updates.length}`,
          metadata: {
            updateCount: syncResult.updates.length,
            packageCount: packages.length
          }
        });
      } catch (e) {
        if (!mountedRef.current || silent) {
          return;
        }
        const message = e instanceof Error ? e.message : "동기화 실패";
        setBannerMessage(`백그라운드 동기화 실패: ${message}`);
      } finally {
        if (mountedRef.current) {
          setSyncing(false);
        }
      }
    },
    [deviceId, isTablet, reportStoreEvent]
  );

  const loadAll = useCallback(
    async (showSpinner: boolean) => {
      if (showSpinner) {
        setLoading(true);
      }

      setError("");

      try {
        const [nextApps, localVersions] = await Promise.all([fetchStoreApps(), loadInstalledVersions()]);
        if (!mountedRef.current) {
          return;
        }
        setBannerMessage("");
        setApiBaseUrl(getCurrentApiBaseUrl());
        setApps(nextApps);
        setInstalledVersions(localVersions);
        void syncInBackground(nextApps, localVersions, true);
      } catch (e) {
        if (!mountedRef.current) {
          return;
        }
        const message = e instanceof Error ? e.message : "앱 목록을 불러오지 못했습니다.";
        setError(message);
        setApps(MOCK_APPS);
        setInstalledVersions((prev) =>
          Object.keys(prev).length > 0
            ? prev
            : {
                "com.sistrun.hub.manager": 20200,
                "com.sistrun.viewer": 10800
              }
        );
        setBannerMessage("실서버 연결 실패로 데모 앱 목록을 표시합니다.");
      } finally {
        if (!mountedRef.current) {
          return;
        }
        setLoading(false);
        setRefreshing(false);
      }
    },
    [syncInBackground]
  );

  useEffect(() => {
    void loadAll(true);
  }, [loadAll]);

  useEffect(() => {
    if (!deviceId) {
      return;
    }

    const timer = setInterval(() => {
      if (AppState.currentState !== "active") {
        return;
      }
      void syncInBackground(apps, installedVersions, true);
    }, SYNC_INTERVAL_MS);

    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        void syncInBackground(apps, installedVersions, true);
      }
    });

    return () => {
      clearInterval(timer);
      subscription.remove();
    };
  }, [apps, deviceId, installedVersions, syncInBackground]);

  const visibleApps = useMemo(() => {
    const q = search.trim().toLowerCase();

    return apps.filter((app) => {
      const installedVersion = installedVersions[app.packageName] ?? -1;
      const hasUpdate = app.latestRelease.versionCode > installedVersion;
      const installed = installedVersion >= 0;

      if (segment === "updates" && !hasUpdate) {
        return false;
      }
      if (segment === "installed" && !installed) {
        return false;
      }

      if (!q) {
        return true;
      }

      return (
        app.displayName.toLowerCase().includes(q) ||
        app.packageName.toLowerCase().includes(q) ||
        app.appId.toLowerCase().includes(q)
      );
    });
  }, [apps, installedVersions, search, segment]);

  const featuredApps = useMemo(() => apps.slice(0, 6), [apps]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void loadAll(false);
  }, [loadAll]);

  const installApk = useCallback(
    async (app: StoreApp) => {
      const packageName = app.packageName;
      const release = app.latestRelease;

      if (!release.downloadUrl) {
        setBannerMessage("다운로드 URL이 비어 있습니다.");
        return;
      }

      setDownloading((prev) => ({ ...prev, [packageName]: true }));
      setDownloadProgress((prev) => ({ ...prev, [packageName]: 0 }));
      setBannerMessage("");
      await reportStoreEvent({
        packageName,
        appId: app.appId,
        releaseId: release.id,
        targetVersionName: release.versionName,
        targetVersionCode: release.versionCode,
        eventType: "DOWNLOAD_STARTED",
        status: "INFO",
        message: "사용자 수동 업데이트 시작"
      });

      try {
        if (FileSystem.cacheDirectory == null) {
          throw new Error("로컬 캐시 저장소를 사용할 수 없습니다.");
        }

        const targetDir = `${FileSystem.cacheDirectory}apk-store/`;
        await FileSystem.makeDirectoryAsync(targetDir, { intermediates: true });

        const fileName = `${sanitizeFileToken(packageName)}-${release.versionCode}.apk`;
        const localUri = `${targetDir}${fileName}`;

        const task = FileSystem.createDownloadResumable(
          release.downloadUrl,
          localUri,
          {},
          (progress) => {
            if (!progress.totalBytesExpectedToWrite) {
              return;
            }
            const percent = Math.round((progress.totalBytesWritten / progress.totalBytesExpectedToWrite) * 100);
            setDownloadProgress((prev) => ({ ...prev, [packageName]: percent }));
          }
        );

        const downloaded = await task.downloadAsync();
        if (!downloaded?.uri) {
          throw new Error("APK 다운로드에 실패했습니다.");
        }

        await reportStoreEvent({
          packageName,
          appId: app.appId,
          releaseId: release.id,
          targetVersionName: release.versionName,
          targetVersionCode: release.versionCode,
          eventType: "DOWNLOAD_FINISHED",
          status: "SUCCESS",
          metadata: {
            localUri: downloaded.uri
          }
        });

        let nextInstalledVersions = installedVersions;
        if (release.versionCode > (installedVersions[packageName] ?? -1)) {
          const next = await saveInstalledVersion(packageName, release.versionCode, installedVersions);
          nextInstalledVersions = next;
          setInstalledVersions(next);
        }

        if (downloaded.uri.startsWith("file://")) {
          const contentUri = await FileSystem.getContentUriAsync(downloaded.uri);

          await IntentLauncher.startActivityAsync("android.intent.action.VIEW", {
            data: contentUri,
            type: "application/vnd.android.package-archive",
            flags: 1
          });

          await reportStoreEvent({
            packageName,
            appId: app.appId,
            releaseId: release.id,
            targetVersionName: release.versionName,
            targetVersionCode: release.versionCode,
            eventType: "INSTALL_REQUESTED",
            status: "INFO",
            message: "패키지 설치 인텐트 실행"
          });

          await reportStoreEvent({
            packageName,
            appId: app.appId,
            releaseId: release.id,
            targetVersionName: release.versionName,
            targetVersionCode: release.versionCode,
            eventType: "INSTALL_SUCCESS",
            status: "SUCCESS",
            message: "설치 화면 열기 완료"
          });

          void syncInBackground(apps, nextInstalledVersions, true);
          setBannerMessage(`${app.displayName} 설치 화면을 열었습니다.`);
          return;
        }

        await Linking.openURL(release.downloadUrl);
        await reportStoreEvent({
          packageName,
          appId: app.appId,
          releaseId: release.id,
          targetVersionName: release.versionName,
          targetVersionCode: release.versionCode,
          eventType: "INSTALL_REQUESTED",
          status: "INFO",
          message: "브라우저 다운로드 링크 열기"
        });
        void syncInBackground(apps, nextInstalledVersions, true);
        setBannerMessage(`${app.displayName} 다운로드 링크를 열었습니다.`);
      } catch (e) {
        const message = e instanceof Error ? e.message : "설치 요청에 실패했습니다.";
        await reportStoreEvent({
          packageName,
          appId: app.appId,
          releaseId: release.id,
          targetVersionName: release.versionName,
          targetVersionCode: release.versionCode,
          eventType: "INSTALL_FAILED",
          status: "FAILED",
          message
        });

        try {
          await Linking.openURL(release.downloadUrl);
          setBannerMessage(`설치 인텐트 실패로 브라우저 다운로드를 열었습니다: ${message}`);
        } catch {
          setBannerMessage(`설치 실패: ${message}`);
        }
      } finally {
        setDownloading((prev) => ({ ...prev, [packageName]: false }));
      }
    },
    [apps, installedVersions, reportStoreEvent, syncInBackground]
  );

  const renderHeader = () => (
    <View style={styles.headerWrap}>
      <View style={styles.topBar}>
        <View>
          <Text style={styles.title}>SISTRUN App Store</Text>
          <Text style={styles.subtitle}>API: {apiBaseUrl}</Text>
          <Text style={styles.subtitle}>
            device: {deviceId || "준비 중"} · sync:{" "}
            {syncing ? "진행 중" : lastSyncedAt ? new Date(lastSyncedAt).toLocaleTimeString() : "대기"}
          </Text>
        </View>
        <View style={styles.badgeStack}>
          <Text style={styles.badge}>{apps.length}개 앱</Text>
          <Text style={styles.badgeSecondary}>업데이트 {availableUpdateCount}개</Text>
        </View>
      </View>

      <View style={styles.searchWrap}>
        <TextInput
          value={search}
          onChangeText={setSearch}
          style={styles.searchInput}
          placeholder="앱 이름, 패키지명 검색"
          placeholderTextColor="#6B7280"
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>

      <View style={styles.segmentRow}>
        {[
          { key: "all", label: "전체" },
          { key: "updates", label: "업데이트" },
          { key: "installed", label: "설치됨" }
        ].map((item) => (
          <Pressable
            key={item.key}
            style={[styles.segmentButton, segment === item.key && styles.segmentButtonActive]}
            onPress={() => setSegment(item.key as Segment)}
          >
            <Text style={[styles.segmentText, segment === item.key && styles.segmentTextActive]}>{item.label}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.sectionTitle}>추천 앱</Text>
      <View style={styles.featuredGrid}>
        {featuredApps.map((app) => {
          const installedVersion = installedVersions[app.packageName] ?? -1;
          const hasUpdate = app.latestRelease.versionCode > installedVersion;
          return (
            <LinearGradient
              key={`featured-${app.appId}`}
              colors={hasUpdate ? ["#1E3A8A", "#0F172A"] : ["#1F2937", "#111827"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.featuredCard}
            >
              <Text style={styles.featuredName} numberOfLines={1}>
                {app.displayName}
              </Text>
              <Text style={styles.featuredVersion}>
                v{app.latestRelease.versionName} ({app.latestRelease.versionCode})
              </Text>
            </LinearGradient>
          );
        })}
      </View>

      {error ? <Text style={styles.errorText}>{error}</Text> : null}
      {bannerMessage ? <Text style={styles.bannerText}>{bannerMessage}</Text> : null}

      <Text style={styles.sectionTitle}>앱 리스트</Text>
    </View>
  );

  const renderItem = ({ item }: { item: StoreApp }) => {
    const installedVersion = installedVersions[item.packageName] ?? -1;
    const latestVersion = item.latestRelease.versionCode;
    const isDownloading = downloading[item.packageName] === true;
    const progress = downloadProgress[item.packageName] ?? 0;
    const hasUpdate = latestVersion > installedVersion;
    const canInstall = installedVersion < 0 || hasUpdate;

    return (
      <View style={[styles.card, isTablet && styles.cardTablet]}>
        <LinearGradient
          colors={["#1F2937", "#0F172A"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.poster}
        >
          <Text style={styles.posterText}>{item.displayName.slice(0, 2).toUpperCase()}</Text>
        </LinearGradient>

        <View style={styles.cardBody}>
          <Text style={styles.appName} numberOfLines={1}>
            {item.displayName}
          </Text>
          <Text style={styles.packageName} numberOfLines={1}>
            {item.packageName}
          </Text>
          <Text style={styles.metaText}>
            버전 {item.latestRelease.versionName} ({item.latestRelease.versionCode})
          </Text>
          <Text style={styles.metaText}>용량 {formatBytes(item.latestRelease.fileSize)}</Text>
          {!!item.latestRelease.changelog && (
            <Text style={styles.changelog} numberOfLines={2}>
              {item.latestRelease.changelog}
            </Text>
          )}

          <View style={styles.actionRow}>
            <Pressable
              style={[
                styles.downloadButton,
                (!canInstall && !isDownloading) && styles.downloadButtonDisabled,
                isDownloading && styles.downloadButtonBusy
              ]}
              onPress={() => void installApk(item)}
              disabled={(!canInstall && !isDownloading) || isDownloading}
            >
              <Text style={styles.downloadText}>
                {isDownloading ? `다운로드 ${progress}%` : actionLabel(installedVersion, latestVersion)}
              </Text>
            </Pressable>

            <Text style={styles.stateText}>
              {installedVersion < 0
                ? "미설치"
                : hasUpdate
                  ? `설치됨 ${installedVersion} → 최신 ${latestVersion}`
                  : `설치됨 ${installedVersion}`}
            </Text>
          </View>
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.screen}>
        <StatusBar style="light" />
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color="#3B82F6" />
          <Text style={styles.loadingText}>스토어 데이터를 불러오는 중...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar style="light" />
      <FlatList
        key={`columns-${numColumns}`}
        data={visibleApps}
        keyExtractor={(item) => item.appId}
        renderItem={renderItem}
        ListHeaderComponent={renderHeader}
        ListEmptyComponent={<Text style={styles.emptyText}>조건에 맞는 앱이 없습니다.</Text>}
        numColumns={numColumns}
        contentContainerStyle={styles.listContent}
        columnWrapperStyle={numColumns > 1 ? styles.columnGap : undefined}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#60A5FA" />}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#090C13"
  },
  loadingWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 10
  },
  loadingText: {
    color: "#D1D5DB"
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 24
  },
  headerWrap: {
    paddingTop: 6,
    paddingBottom: 14
  },
  topBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14
  },
  title: {
    color: "#F9FAFB",
    fontSize: 26,
    fontWeight: "800"
  },
  subtitle: {
    color: "#9CA3AF",
    marginTop: 4,
    fontSize: 12
  },
  badge: {
    color: "#BFDBFE",
    backgroundColor: "#1D4ED8",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    fontWeight: "700",
    overflow: "hidden"
  },
  badgeStack: {
    alignItems: "flex-end",
    gap: 6
  },
  badgeSecondary: {
    color: "#C7D2FE",
    backgroundColor: "#312E81",
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    fontSize: 12,
    fontWeight: "700",
    overflow: "hidden"
  },
  searchWrap: {
    marginBottom: 12
  },
  searchInput: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#1F2937",
    backgroundColor: "#0F172A",
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: "#E5E7EB",
    fontSize: 15
  },
  segmentRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 14
  },
  segmentButton: {
    backgroundColor: "#111827",
    borderWidth: 1,
    borderColor: "#1F2937",
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 9
  },
  segmentButtonActive: {
    backgroundColor: "#1D4ED8",
    borderColor: "#1D4ED8"
  },
  segmentText: {
    color: "#9CA3AF",
    fontWeight: "700"
  },
  segmentTextActive: {
    color: "#EFF6FF"
  },
  sectionTitle: {
    color: "#E5E7EB",
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 10,
    marginTop: 4
  },
  featuredGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 12
  },
  featuredCard: {
    width: "48.5%",
    minHeight: 76,
    borderRadius: 14,
    padding: 10,
    borderWidth: 1,
    borderColor: "#24354D"
  },
  featuredName: {
    color: "#E2E8F0",
    fontWeight: "700",
    fontSize: 14
  },
  featuredVersion: {
    color: "#A5B4FC",
    marginTop: 6,
    fontSize: 12
  },
  errorText: {
    color: "#FCA5A5",
    marginBottom: 8
  },
  bannerText: {
    color: "#93C5FD",
    marginBottom: 8
  },
  columnGap: {
    gap: 12
  },
  card: {
    flex: 1,
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#1F2937",
    backgroundColor: "#0F172A",
    marginBottom: 12
  },
  cardTablet: {
    maxWidth: "49%"
  },
  poster: {
    height: 130,
    alignItems: "center",
    justifyContent: "center"
  },
  posterText: {
    color: "#D1E8FF",
    fontSize: 32,
    fontWeight: "800"
  },
  cardBody: {
    padding: 12,
    gap: 4
  },
  appName: {
    color: "#F3F4F6",
    fontSize: 18,
    fontWeight: "700"
  },
  packageName: {
    color: "#9CA3AF",
    fontSize: 12
  },
  metaText: {
    color: "#CBD5E1",
    fontSize: 12
  },
  changelog: {
    color: "#94A3B8",
    marginTop: 4,
    fontSize: 12
  },
  actionRow: {
    marginTop: 8,
    gap: 6
  },
  downloadButton: {
    alignSelf: "flex-start",
    backgroundColor: "#2563EB",
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 9
  },
  downloadButtonBusy: {
    backgroundColor: "#1D4ED8"
  },
  downloadButtonDisabled: {
    backgroundColor: "#334155"
  },
  downloadText: {
    color: "#EFF6FF",
    fontSize: 14,
    fontWeight: "700"
  },
  stateText: {
    color: "#93C5FD",
    fontSize: 12
  },
  emptyText: {
    color: "#9CA3AF",
    textAlign: "center",
    paddingVertical: 30
  }
});
