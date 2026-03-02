# Sistrun App Store (Kiosk Installer Hub)

Android 14 키오스크 단말용 사내 앱 스토어입니다.

## 핵심 동작
- 서버 앱 카탈로그 조회 + 로컬 설치 버전 비교(`신규/업데이트/최신` 분류)
- 전체 업데이트 큐(순차 처리, 실패 정책, 재시도)
- 단계별 상태(`다운로드/검증/설치/결과`)와 구조화 로그 저장
- 백그라운드 동기화 + 이벤트 업로드(`/api/store/devices/sync`, `/events`)
- 초기 온보딩(알 수 없는 앱 설치 허용, 알림 권한)

## 설치 파이프라인
1. 다운로드: WorkManager 기반 네이티브 다운로드 우선, 실패 시 JS fallback
2. 무결성: 파일 크기 + SHA256 검증(네이티브 검증 우선)
3. 설치: PackageInstaller Session API 사용
4. 결과 처리:
   - `SUCCESS`: 완료
   - `PENDING_USER_ACTION`: 시스템 설치 UI 자동 전환
   - `FAILURE`: 원인 코드 로깅 후 재시도/정책 분기

## 네이티브 모듈
- `modules/app-store-installer`:
  - 패키지 설치 정보 조회(PackageManager)
  - WorkManager 다운로드 + 원자적 rename
  - PackageInstaller Session 설치/업데이트
  - Unknown sources 설정 화면 이동

> Expo Go에서는 네이티브 모듈이 로드되지 않으므로 일부 경로는 제한됩니다.  
> 납품 빌드는 `prebuild + dev client/EAS` 기준으로 네이티브 모듈 경로를 사용해야 합니다.

## 실행
```bash
cd /Users/nahooni0511/workspace/sistrun-hub/apps/app_store
npm install
npm run android
```

## API 서버 주소
- 기본 후보(자동 폴백):
  - Android: `http://10.0.2.2:4000`, `http://127.0.0.1:4000`, `http://localhost:4000`
  - iOS/Web: `http://localhost:4000`
- 환경변수 지정:
```bash
EXPO_PUBLIC_API_BASE_URL=http://192.168.0.10:4000 npm run android
```
