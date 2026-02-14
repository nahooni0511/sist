# Step 1 Audit: manager 설치/업데이트 및 정책 관련 코드

## APK 다운로드/설치 실행(이관 대상)
- `src/main/java/com/sistrun/manager/MainActivity.kt`
  - `setupMarketList()` : 마켓 버튼 클릭 시 `downloadAndInstall(...)` 호출
  - `runAutoUpdateCheckNow()` : 서버 업데이트 조회 후 `downloadAndInstallUpdateCandidate(...)` 호출
  - `downloadAndInstallUpdateCandidate(...)` : APK 다운로드 + 설치 호출
  - `downloadAndInstall(...)` : APK 다운로드 + 설치 호출
  - `installApk(...)` : `FileProvider` + `ACTION_VIEW`로 설치 인텐트 실행
- `src/main/java/com/sistrun/manager/market/ApiClient.kt`
  - `downloadApk(...)` : URL에서 APK 파일 저장

## 업데이트 정책/서버 연동(이관 또는 호출 변경 대상)
- `src/main/java/com/sistrun/manager/AutoUpdateWorker.kt`
  - `doWork()` : `ApiClient.checkUpdates(...)`로 자동업데이트 확인
  - `collectInstalledPackageVersions(...)` : 설치 버전 조회
- `src/main/java/com/sistrun/manager/MainActivity.kt`
  - `loadMarketApps()` : 설치 버전 맵 생성 후 `/api/apps` 조회
  - `runAutoUpdateCheckNow()` : `/api/devices/check-updates` 조회
- `src/main/java/com/sistrun/manager/market/ApiClient.kt`
  - `fetchMarketApps(...)`
  - `checkUpdates(...)`

## 매니페스트/권한(정리 대상)
- `src/main/AndroidManifest.xml`
  - `uses-permission android.permission.REQUEST_INSTALL_PACKAGES`
  - `androidx.core.content.FileProvider`

## DevicePolicyManager/DeviceAdmin 코드 검색 결과
- manager 모듈 내 직접 사용 코드 없음
- 즉, 정책/DO 관련 기능은 신규 `core_dpc`로 추가 구현 필요
