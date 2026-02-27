import { StoreApp } from "./types";

export const MOCK_APPS: StoreApp[] = [
  {
    appId: "sistrun-hub-manager",
    packageName: "com.sistrun.hub.manager",
    displayName: "Sistrun Hub",
    latestRelease: {
      id: "mock-1",
      versionName: "2.3.1",
      versionCode: 20301,
      changelog: "대시보드 성능 개선 및 네트워크 안정화",
      autoUpdate: true,
      uploadedAt: new Date().toISOString(),
      fileSize: 38294711,
      sha256: "",
      downloadUrl: "https://example.com/sistrun-hub.apk"
    }
  },
  {
    appId: "sistrun-viewer",
    packageName: "com.sistrun.viewer",
    displayName: "Sistrun Viewer",
    latestRelease: {
      id: "mock-2",
      versionName: "1.8.0",
      versionCode: 10800,
      changelog: "미디어 렌더링 품질 개선",
      autoUpdate: true,
      uploadedAt: new Date().toISOString(),
      fileSize: 29811734,
      sha256: "",
      downloadUrl: "https://example.com/sistrun-viewer.apk"
    }
  },
  {
    appId: "sistrun-monitor",
    packageName: "com.sistrun.monitor",
    displayName: "Sistrun Monitor",
    latestRelease: {
      id: "mock-3",
      versionName: "3.1.4",
      versionCode: 30104,
      changelog: "실시간 모니터링 지표 추가",
      autoUpdate: true,
      uploadedAt: new Date().toISOString(),
      fileSize: 41589023,
      sha256: "",
      downloadUrl: "https://example.com/sistrun-monitor.apk"
    }
  },
  {
    appId: "sistrun-scheduler",
    packageName: "com.sistrun.scheduler",
    displayName: "Sistrun Scheduler",
    latestRelease: {
      id: "mock-4",
      versionName: "1.1.5",
      versionCode: 10105,
      changelog: "예약 동기화 버그 수정",
      autoUpdate: true,
      uploadedAt: new Date().toISOString(),
      fileSize: 21234454,
      sha256: "",
      downloadUrl: "https://example.com/sistrun-scheduler.apk"
    }
  },
  {
    appId: "sistrun-player",
    packageName: "com.sistrun.player",
    displayName: "Sistrun Player",
    latestRelease: {
      id: "mock-5",
      versionName: "4.0.0",
      versionCode: 40000,
      changelog: "새 플레이어 엔진 적용",
      autoUpdate: true,
      uploadedAt: new Date().toISOString(),
      fileSize: 52390412,
      sha256: "",
      downloadUrl: "https://example.com/sistrun-player.apk"
    }
  },
  {
    appId: "sistrun-bridge",
    packageName: "com.sistrun.bridge",
    displayName: "Sistrun Bridge",
    latestRelease: {
      id: "mock-6",
      versionName: "2.0.9",
      versionCode: 20009,
      changelog: "장치 연동 프로토콜 v2 지원",
      autoUpdate: true,
      uploadedAt: new Date().toISOString(),
      fileSize: 28766542,
      sha256: "",
      downloadUrl: "https://example.com/sistrun-bridge.apk"
    }
  }
];
