import * as Application from "expo-application";
import { StatusBar } from "expo-status-bar";
import { LinearGradient } from "expo-linear-gradient";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  FlatList,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
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
import { InstallQueueController } from "./src/installQueue";
import { MOCK_APPS } from "./src/mockApps";
import {
  getNotificationPermissionStatus,
  initNotificationHandler,
  requestNotificationPermission as requestNotificationPermissionRuntime,
  sendLocalNotification
} from "./src/notifications";
import {
  canRequestPackageInstallsNative,
  getNativeCapabilities,
  listInstalledPackagesNative,
  openUnknownSourcesSettingsNative
} from "./src/nativeBridge";
import { buildInstalledMap, classifyPackage } from "./src/packageClassifier";
import { loadOnboardingDone, loadStructuredLogs, saveOnboardingDone } from "./src/runtimeStore";
import {
  InstallClassification,
  InstalledAppInfo,
  NativeInstallerCapability,
  QueueFailurePolicy,
  QueueItem,
  QueueRuntimeState,
  StructuredLogRecord,
  StoreApp
} from "./src/types";
import { loadInstalledVersions, saveInstalledVersion } from "./src/versionStore";

type Segment = "all" | "updates" | "installed";

const SYNC_INTERVAL_MS = 60_000;
const APP_STORE_VERSION = process.env.EXPO_PUBLIC_APP_STORE_VERSION?.trim() || "1.0.0";
const FALLBACK_SELF_PACKAGE = "kr.sist.appstore";

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

function labelFromClassification(classification: InstallClassification): string {
  if (classification === "NEW_INSTALL") {
    return "설치";
  }
  if (classification === "UPDATE") {
    return "업데이트";
  }
  return "최신";
}

function stageLabel(item: QueueItem): string {
  switch (item.stage) {
    case "QUEUED":
      return "대기";
    case "DOWNLOADING":
      return "다운로드";
    case "VERIFYING":
      return "검증";
    case "INSTALLING":
      return "설치";
    case "PENDING_USER_ACTION":
      return "사용자 확인 필요";
    case "SUCCESS":
      return "완료";
    case "FAILED":
      return "실패";
    default:
      return item.stage;
  }
}

function nowLocalTime(iso?: string): string {
  if (!iso) {
    return "-";
  }
  return new Date(iso).toLocaleTimeString();
}

async function notify(title: string, body: string): Promise<void> {
  await sendLocalNotification(title, body);
}

export default function App() {
  const { width } = useWindowDimensions();
  const isTablet = width >= 700;
  const numColumns = width >= 980 ? 3 : width >= 680 ? 2 : 1;

  const [apps, setApps] = useState<StoreApp[]>([]);
  const [installedMap, setInstalledMap] = useState<Record<string, InstalledAppInfo>>({});
  const [search, setSearch] = useState("");
  const [segment, setSegment] = useState<Segment>("all");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [bannerMessage, setBannerMessage] = useState("");
  const [apiBaseUrl, setApiBaseUrl] = useState(API_BASE_URL);

  const [deviceId, setDeviceId] = useState("");
  const [capabilities, setCapabilities] = useState<NativeInstallerCapability>({
    packageInspector: false,
    packageInstallerSession: false,
    workManagerDownloader: false,
    canOpenUnknownSourcesSettings: false
  });

  const [onboardingDone, setOnboardingDone] = useState(true);
  const [unknownSourcesAllowed, setUnknownSourcesAllowed] = useState(false);
  const [notificationPermission, setNotificationPermission] = useState<"granted" | "denied" | "undetermined">(
    "undetermined"
  );

  const [syncing, setSyncing] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState("");
  const [availableUpdateCount, setAvailableUpdateCount] = useState(0);

  const [queueState, setQueueState] = useState<QueueRuntimeState>({
    policy: "RETRY_THEN_CONTINUE",
    maxRetries: 2,
    items: [],
    updatedAt: new Date(0).toISOString()
  });
  const [progressMap, setProgressMap] = useState<Record<string, number>>({});
  const [logs, setLogs] = useState<StructuredLogRecord[]>([]);

  const mountedRef = useRef(true);
  const queueControllerRef = useRef<InstallQueueController | null>(null);
  const notifiedProgressRef = useRef<Record<string, number>>({});

  const selfPackageName = Application.applicationId || FALLBACK_SELF_PACKAGE;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const refreshLogs = useCallback(async () => {
    const nextLogs = await loadStructuredLogs();
    if (!mountedRef.current) {
      return;
    }
    setLogs(nextLogs);
  }, []);

  const syncInBackground = useCallback(
    async (nextApps: StoreApp[], nextInstalledMap: Record<string, InstalledAppInfo>, silent: boolean) => {
      if (!deviceId) {
        return;
      }

      const packages = Object.values(nextInstalledMap)
        .filter((item) => Number.isFinite(item.versionCode) && item.versionCode >= 0)
        .map((item) => ({
          packageName: item.packageName,
          versionCode: item.versionCode,
          versionName: item.versionName
        }));

      try {
        setSyncing(true);

        const syncResult = await syncStoreDevice({
          deviceId,
          deviceName: deviceId,
          modelName: isTablet ? "kiosk-tablet" : "kiosk-phone",
          platform: "android",
          osVersion: String(Application.nativeApplicationVersion || "unknown"),
          appStoreVersion: APP_STORE_VERSION,
          packages
        });

        if (!mountedRef.current) {
          return;
        }

        setApiBaseUrl(getCurrentApiBaseUrl());
        setLastSyncedAt(syncResult.syncedAt);
        setAvailableUpdateCount(syncResult.updates.length);

        await postStoreEvent(deviceId, {
          packageName: "__app_store__",
          eventType: "SYNC_COMPLETED",
          status: "SUCCESS",
          message: `updates=${syncResult.updates.length}`,
          metadata: {
            updateCount: syncResult.updates.length,
            packageCount: packages.length
          }
        });

        if (!silent) {
          const msg =
            syncResult.updates.length > 0
              ? `동기화 완료: 업데이트 ${syncResult.updates.length}개`
              : "동기화 완료";
          setBannerMessage(msg);
          await notify("스토어 동기화", msg);
        }
      } catch (e) {
        if (!mountedRef.current || silent) {
          return;
        }
        setBannerMessage(`동기화 실패: ${(e as Error).message}`);
      } finally {
        if (mountedRef.current) {
          setSyncing(false);
        }
      }
    },
    [deviceId, isTablet]
  );

  const loadInstalledInfo = useCallback(
    async (targetApps: StoreApp[]): Promise<Record<string, InstalledAppInfo>> => {
      const targetPackages = Array.from(new Set([...targetApps.map((item) => item.packageName), selfPackageName]));

      const nativeInstalled = await listInstalledPackagesNative(targetPackages);
      if (nativeInstalled.length > 0) {
        return buildInstalledMap(nativeInstalled);
      }

      const fallback = await loadInstalledVersions();
      return Object.fromEntries(
        targetPackages
          .filter((pkg) => Number.isFinite(fallback[pkg]))
          .map((pkg) => [
            pkg,
            {
              packageName: pkg,
              versionCode: fallback[pkg],
              versionName: undefined
            }
          ])
      );
    },
    [selfPackageName]
  );

  const loadAll = useCallback(
    async (showSpinner: boolean) => {
      if (showSpinner) {
        setLoading(true);
      }
      setError("");

      try {
        const fetchedApps = await fetchStoreApps();
        const nextApps = fetchedApps.length > 0 ? fetchedApps : [];
        const nextInstalledMap = await loadInstalledInfo(nextApps);

        if (!mountedRef.current) {
          return;
        }

        setBannerMessage("");
        setApiBaseUrl(getCurrentApiBaseUrl());
        setApps(nextApps.length > 0 ? nextApps : []);
        setInstalledMap(nextInstalledMap);
        void syncInBackground(nextApps, nextInstalledMap, true);
      } catch (e) {
        if (!mountedRef.current) {
          return;
        }

        const message = e instanceof Error ? e.message : "앱 목록을 불러오지 못했습니다.";
        setError(message);
        setApps(MOCK_APPS);
        const fallbackMap = await loadInstalledInfo(MOCK_APPS);
        setInstalledMap(fallbackMap);
        setBannerMessage("실서버 연결 실패로 데모 앱 목록을 표시합니다.");
      } finally {
        if (!mountedRef.current) {
          return;
        }
        setLoading(false);
        setRefreshing(false);
      }
    },
    [loadInstalledInfo, syncInBackground]
  );

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const [nextDeviceId, nextCapabilities, isOnboardingDone, notificationSettings] = await Promise.all([
        getOrCreateDeviceId(),
        getNativeCapabilities(),
        loadOnboardingDone(),
        getNotificationPermissionStatus(),
        initNotificationHandler()
      ]);

      if (cancelled || !mountedRef.current) {
        return;
      }

      setDeviceId(nextDeviceId);
      setCapabilities(nextCapabilities);
      setOnboardingDone(isOnboardingDone);
      setNotificationPermission(notificationSettings);

      if (nextCapabilities.packageInstallerSession) {
        const allowed = await canRequestPackageInstallsNative();
        if (mountedRef.current) {
          setUnknownSourcesAllowed(allowed);
        }
      } else {
        setUnknownSourcesAllowed(true);
      }

      await refreshLogs();
      await loadAll(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [loadAll, refreshLogs]);

  useEffect(() => {
    if (!deviceId || queueControllerRef.current) {
      return;
    }

    const controller = new InstallQueueController({
      onState: (nextState) => {
        setQueueState(nextState);
        void refreshLogs();
      },
      onBanner: (message) => {
        setBannerMessage(message);
        void notify("스토어 작업", message);
      },
      onProgress: (packageName, progress) => {
        setProgressMap((prev) => ({ ...prev, [packageName]: progress }));
        const prevNotified = notifiedProgressRef.current[packageName] ?? -1;
        const checkpoint = Math.floor(progress / 25) * 25;
        if (checkpoint > 0 && checkpoint !== prevNotified) {
          notifiedProgressRef.current[packageName] = checkpoint;
          void notify("다운로드 진행", `${packageName} ${checkpoint}%`);
        }
      },
      onInstallSuccess: async (packageName, versionCode) => {
        setInstalledMap((prev) => ({
          ...prev,
          [packageName]: {
            packageName,
            versionCode,
            versionName: prev[packageName]?.versionName
          }
        }));

        const fallback = await loadInstalledVersions();
        await saveInstalledVersion(packageName, versionCode, fallback);

        const mapAfter = {
          ...installedMap,
          [packageName]: {
            packageName,
            versionCode,
            versionName: installedMap[packageName]?.versionName
          }
        };
        await syncInBackground(apps, mapAfter, true);

        if (packageName === selfPackageName) {
          setBannerMessage("스토어 앱 업데이트가 완료되었습니다. 앱 상태를 복구합니다.");
          await notify("스토어 업데이트", "업데이트 완료 후 큐 상태를 복원했습니다.");
        }
      },
      onStoreEvent: async (params) => {
        if (!deviceId) {
          return;
        }
        await postStoreEvent(deviceId, {
          packageName: params.packageName,
          appId: params.appId,
          releaseId: params.release.id,
          targetVersionName: params.release.versionName,
          targetVersionCode: params.release.versionCode,
          eventType: params.eventType,
          status: params.status,
          message: params.message,
          metadata: params.metadata
        });
      }
    });

    queueControllerRef.current = controller;
    void controller.initialize();
  }, [apps, deviceId, installedMap, refreshLogs, syncInBackground]);

  useEffect(() => {
    if (!deviceId) {
      return;
    }

    const timer = setInterval(() => {
      if (AppState.currentState !== "active") {
        return;
      }
      void syncInBackground(apps, installedMap, true);
    }, SYNC_INTERVAL_MS);

    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        void syncInBackground(apps, installedMap, true);
      }
    });

    return () => {
      clearInterval(timer);
      subscription.remove();
    };
  }, [apps, deviceId, installedMap, syncInBackground]);

  const appClassifications = useMemo(() => {
    return Object.fromEntries(
      apps.map((app) => [
        app.packageName,
        classifyPackage(app, installedMap[app.packageName])
      ])
    ) as Record<string, InstallClassification>;
  }, [apps, installedMap]);

  const visibleApps = useMemo(() => {
    const q = search.trim().toLowerCase();

    return apps.filter((app) => {
      const classification = appClassifications[app.packageName] || "NEW_INSTALL";
      if (segment === "updates" && classification !== "UPDATE") {
        return false;
      }
      if (segment === "installed" && classification === "NEW_INSTALL") {
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
  }, [appClassifications, apps, search, segment]);

  const featuredApps = useMemo(() => apps.slice(0, 6), [apps]);

  const queueSummary = useMemo(() => {
    const pending = queueState.items.filter(
      (item) => item.stage === "QUEUED" || item.stage === "DOWNLOADING" || item.stage === "VERIFYING" || item.stage === "INSTALLING"
    ).length;
    const failed = queueState.items.filter((item) => item.stage === "FAILED").length;
    const success = queueState.items.filter((item) => item.stage === "SUCCESS").length;
    return { pending, failed, success };
  }, [queueState.items]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void loadAll(false);
  }, [loadAll]);

  const enqueueSingle = useCallback(
    async (app: StoreApp) => {
      const classification = appClassifications[app.packageName] || "NEW_INSTALL";
      if (classification === "LATEST") {
        setBannerMessage(`${app.displayName}은 이미 최신입니다.`);
        return;
      }

      await queueControllerRef.current?.enqueue([
        {
          app,
          classification
        }
      ]);

      setBannerMessage(`${app.displayName} 작업을 큐에 추가했습니다.`);
    },
    [appClassifications]
  );

  const enqueueAllUpdates = useCallback(async () => {
    const targets = apps
      .map((app) => ({ app, classification: appClassifications[app.packageName] || "NEW_INSTALL" }))
      .filter((entry) => entry.classification === "UPDATE");

    if (targets.length === 0) {
      setBannerMessage("업데이트 대상이 없습니다.");
      return;
    }

    await queueControllerRef.current?.enqueue(targets);
    setBannerMessage(`업데이트 ${targets.length}개를 큐에 추가했습니다.`);
    await notify("전체 업데이트", `${targets.length}개 앱 업데이트를 시작합니다.`);
  }, [appClassifications, apps]);

  const setPolicy = useCallback(async (policy: QueueFailurePolicy) => {
    await queueControllerRef.current?.setPolicy(policy, queueState.maxRetries || 2);
  }, [queueState.maxRetries]);

  const clearFinished = useCallback(async () => {
    await queueControllerRef.current?.clearFinished();
  }, []);

  const refreshPermissionStatus = useCallback(async () => {
    const status = await canRequestPackageInstallsNative();
    setUnknownSourcesAllowed(status || !capabilities.packageInstallerSession);
  }, [capabilities.packageInstallerSession]);

  const requestNotificationPermission = useCallback(async () => {
    const status = await requestNotificationPermissionRuntime();
    setNotificationPermission(status);
  }, []);

  const completeOnboarding = useCallback(async () => {
    if (!unknownSourcesAllowed) {
      setBannerMessage("알 수 없는 앱 설치 허용을 먼저 완료하세요.");
      return;
    }

    await saveOnboardingDone(true);
    setOnboardingDone(true);
    setBannerMessage("초기 설정이 완료되었습니다.");
  }, [unknownSourcesAllowed]);

  const renderHeader = () => (
    <View style={styles.headerWrap}>
      <View style={styles.topBar}>
        <View>
          <Text style={styles.title}>SISTRUN App Store</Text>
          <Text style={styles.subtitle}>API: {apiBaseUrl}</Text>
          <Text style={styles.subtitle}>
            device: {deviceId || "준비 중"} · sync: {syncing ? "진행 중" : nowLocalTime(lastSyncedAt)}
          </Text>
          <Text style={styles.subtitle}>
            native: PM[{capabilities.packageInspector ? "Y" : "N"}] PI[{capabilities.packageInstallerSession ? "Y" : "N"}] WM[{capabilities.workManagerDownloader ? "Y" : "N"}]
          </Text>
        </View>

        <View style={styles.badgeStack}>
          <Text style={styles.badge}>{apps.length}개 앱</Text>
          <Text style={styles.badgeSecondary}>업데이트 {availableUpdateCount}개</Text>
          <Pressable style={styles.smallAction} onPress={() => void enqueueAllUpdates()}>
            <Text style={styles.smallActionText}>전체 업데이트</Text>
          </Pressable>
        </View>
      </View>

      {!onboardingDone && (
        <View style={styles.onboardingCard}>
          <Text style={styles.onboardingTitle}>초기 설정 (1회)</Text>
          <Text style={styles.onboardingText}>
            1) 알 수 없는 앱 설치 허용: {unknownSourcesAllowed ? "완료" : "필요"}
          </Text>
          <Text style={styles.onboardingText}>
            2) 알림 권한(Android 13+): {notificationPermission}
          </Text>
          <View style={styles.actionRow}>
            <Pressable style={styles.secondaryButton} onPress={() => void openUnknownSourcesSettingsNative()}>
              <Text style={styles.secondaryButtonText}>설치 허용 화면 열기</Text>
            </Pressable>
            <Pressable style={styles.secondaryButton} onPress={() => void refreshPermissionStatus()}>
              <Text style={styles.secondaryButtonText}>허용 여부 재확인</Text>
            </Pressable>
            <Pressable style={styles.secondaryButton} onPress={() => void requestNotificationPermission()}>
              <Text style={styles.secondaryButtonText}>알림 권한 요청</Text>
            </Pressable>
            <Pressable
              style={[styles.primaryPill, !unknownSourcesAllowed && styles.primaryPillDisabled]}
              disabled={!unknownSourcesAllowed}
              onPress={() => void completeOnboarding()}
            >
              <Text style={styles.primaryPillText}>온보딩 완료</Text>
            </Pressable>
          </View>
        </View>
      )}

      <View style={styles.queueCard}>
        <Text style={styles.sectionTitle}>업데이트 큐</Text>
        <Text style={styles.queueSummaryText}>
          진행 {queueSummary.pending} · 성공 {queueSummary.success} · 실패 {queueSummary.failed}
        </Text>
        <View style={styles.actionRow}>
          {[
            { key: "STOP_ON_FAILURE", label: "실패 시 중단" },
            { key: "CONTINUE_ON_FAILURE", label: "실패해도 계속" },
            { key: "RETRY_THEN_CONTINUE", label: "재시도 후 계속" }
          ].map((option) => (
            <Pressable
              key={option.key}
              style={[
                styles.policyButton,
                queueState.policy === option.key && styles.policyButtonActive
              ]}
              onPress={() => void setPolicy(option.key as QueueFailurePolicy)}
            >
              <Text
                style={[
                  styles.policyText,
                  queueState.policy === option.key && styles.policyTextActive
                ]}
              >
                {option.label}
              </Text>
            </Pressable>
          ))}
          <Pressable style={styles.secondaryButton} onPress={() => void clearFinished()}>
            <Text style={styles.secondaryButtonText}>완료/실패 정리</Text>
          </Pressable>
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
          const classification = appClassifications[app.packageName] || "NEW_INSTALL";
          const hasUpdate = classification === "UPDATE";

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
    const classification = appClassifications[item.packageName] || "NEW_INSTALL";
    const queueItem = [...queueState.items]
      .reverse()
      .find((queued) => queued.packageName === item.packageName && queued.release.versionCode === item.latestRelease.versionCode);

    const isBusy =
      queueItem?.stage === "QUEUED" ||
      queueItem?.stage === "DOWNLOADING" ||
      queueItem?.stage === "VERIFYING" ||
      queueItem?.stage === "INSTALLING";

    const progress = progressMap[item.packageName] ?? 0;

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
          {item.packageName === selfPackageName ? <Text style={styles.selfTag}>스토어 앱 자기 업데이트 대상</Text> : null}

          <View style={styles.actionRow}>
            <Pressable
              style={[
                styles.downloadButton,
                classification === "LATEST" && !isBusy ? styles.downloadButtonDisabled : null,
                isBusy ? styles.downloadButtonBusy : null
              ]}
              onPress={() => void enqueueSingle(item)}
              disabled={classification === "LATEST" || isBusy}
            >
              <Text style={styles.downloadText}>
                {isBusy
                  ? `${stageLabel(queueItem || {
                      id: "",
                      appId: "",
                      packageName: "",
                      displayName: "",
                      release: item.latestRelease,
                      classification,
                      stage: "QUEUED",
                      attempts: 0,
                      maxRetries: 0,
                      createdAt: "",
                      updatedAt: ""
                    })}${queueItem?.stage === "DOWNLOADING" ? ` ${progress}%` : ""}`
                  : labelFromClassification(classification)}
              </Text>
            </Pressable>

            <Text style={styles.stateText}>
              {classification === "NEW_INSTALL"
                ? "미설치"
                : classification === "UPDATE"
                  ? `설치됨 ${installedMap[item.packageName]?.versionCode ?? "-"} → 최신 ${item.latestRelease.versionCode}`
                  : `설치됨 ${installedMap[item.packageName]?.versionCode ?? "-"}`}
            </Text>

            {queueItem?.failureMessage ? <Text style={styles.errorText}>실패: {queueItem.failureMessage}</Text> : null}
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
        ListFooterComponent={
          <View style={styles.logCard}>
            <Text style={styles.sectionTitle}>구조화 로그(최근)</Text>
            <ScrollView style={styles.logScroll} nestedScrollEnabled>
              {logs.slice(0, 20).map((log) => (
                <View key={log.id} style={styles.logRow}>
                  <Text style={styles.logMeta}>[{log.level}] {new Date(log.createdAt).toLocaleTimeString()} · {log.step}</Text>
                  <Text style={styles.logMessage}>{log.packageName} · {log.code} · {log.message}</Text>
                </View>
              ))}
              {logs.length === 0 ? <Text style={styles.emptyText}>로그가 없습니다.</Text> : null}
            </ScrollView>
          </View>
        }
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
    alignItems: "flex-start",
    marginBottom: 14,
    gap: 12
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
  badgeStack: {
    alignItems: "flex-end",
    gap: 6
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
  smallAction: {
    backgroundColor: "#1E40AF",
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 12
  },
  smallActionText: {
    color: "#E0E7FF",
    fontWeight: "700",
    fontSize: 12
  },
  onboardingCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#1F2937",
    backgroundColor: "#111827",
    padding: 12,
    marginBottom: 12,
    gap: 6
  },
  onboardingTitle: {
    color: "#E2E8F0",
    fontWeight: "700",
    fontSize: 16
  },
  onboardingText: {
    color: "#CBD5E1",
    fontSize: 13
  },
  queueCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#1F2937",
    backgroundColor: "#0F172A",
    padding: 12,
    marginBottom: 12,
    gap: 8
  },
  queueSummaryText: {
    color: "#BFDBFE",
    fontSize: 12
  },
  policyButton: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#334155",
    paddingVertical: 8,
    paddingHorizontal: 12
  },
  policyButtonActive: {
    backgroundColor: "#1D4ED8",
    borderColor: "#1D4ED8"
  },
  policyText: {
    color: "#94A3B8",
    fontSize: 12,
    fontWeight: "700"
  },
  policyTextActive: {
    color: "#DBEAFE"
  },
  secondaryButton: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#334155",
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: "#0F172A"
  },
  secondaryButtonText: {
    color: "#CBD5E1",
    fontWeight: "700",
    fontSize: 12
  },
  primaryPill: {
    borderRadius: 999,
    backgroundColor: "#2563EB",
    paddingVertical: 8,
    paddingHorizontal: 14
  },
  primaryPillDisabled: {
    backgroundColor: "#475569"
  },
  primaryPillText: {
    color: "#EFF6FF",
    fontSize: 12,
    fontWeight: "700"
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
    marginBottom: 8,
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
  selfTag: {
    color: "#A7F3D0",
    fontSize: 12,
    marginTop: 4
  },
  actionRow: {
    marginTop: 8,
    gap: 6,
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center"
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
  },
  logCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#1F2937",
    backgroundColor: "#0B1220",
    padding: 12,
    marginTop: 4
  },
  logScroll: {
    maxHeight: 260
  },
  logRow: {
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: "#1E293B"
  },
  logMeta: {
    color: "#93C5FD",
    fontSize: 11
  },
  logMessage: {
    color: "#CBD5E1",
    fontSize: 12,
    marginTop: 2
  }
});
