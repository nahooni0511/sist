# web-admin API Contract (Expected)

`web-admin`는 아래 Admin API를 우선 호출합니다.

## 1) APK
- `POST /admin/apks/upload` (multipart/form-data)
  - fields: `apk`, `packageName?`, `versionName?`, `versionCode?`, `releaseNote?`
- `GET /admin/apks?query=&packageName=&latestOnly=`
- `GET /admin/apks/:apkId`

## 2) Devices
- `GET /admin/devices?query=&status=&hasLocation=`
- `GET /admin/devices/:deviceId`

## 3) Commands
- `POST /admin/devices/:deviceId/commands`
  - body: `{ "type": string, "payload": object, "requestedBy": string }`
- `GET /admin/devices/:deviceId/commands?limit=50`
- `GET /admin/commands/:commandId`

## 4) Store Background Sync
- `GET /admin/store/devices?query=`
- `GET /admin/store/devices/:deviceId`
- `GET /admin/store/events?deviceId=&packageName=&limit=`

## 5) Store Client Sync
- `POST /api/store/devices/sync`
  - body: `{ deviceId, deviceName?, modelName?, platform?, osVersion?, appStoreVersion?, packages[] }`
- `POST /api/store/devices/:deviceId/events`
  - body: `{ packageName, eventType, status?, message?, ... }`

---

## Compatibility Adapter (현재 api-server 호환)
현재 `/api-server`가 위 `/admin/*` 엔드포인트를 모두 제공하지 않는 경우를 대비해, 프론트에서 아래 fallback을 자동 적용합니다.

- APK 목록: `/api/apps`
- APK 업로드: `/api/apps/upload`
- APK 상세(버전): `/api/apps/:appId/releases`
- 명령 생성: `/api/commands`
- 기기별 명령 목록: `/api/commands?deviceId=...`
- 단일 명령 조회: `/api/commands` 전체 조회 후 클라이언트 필터

Devices API(`/admin/devices*`)가 없으면, 명령 히스토리(`/api/commands`)를 기반으로 최소 기기 목록을 구성합니다.
