# api-server

Sistrun 슈퍼관리자용 마켓/설정 API 서버(TypeScript + Node.js).

## 기능
- APK 업로드/배포
- 마켓 앱 목록 조회
- 기기 자동업데이트 체크 API
- 전역 설정값(`AI_BOX_IP`, `API_BASE_URL` 등) 공유
- 원격 명령 큐(생성/디바이스 pull/결과 리포트)

## 실행
```bash
cd /Users/nahooni0511/workspace/sistrun-hub/api-server
npm install
cp .env.example .env
npm run dev
```

환경파일 로딩 규칙:
- 앱은 `dotenv`로 `.env` 파일을 자동 로드합니다.
- 운영 배포에서는 `systemd EnvironmentFile`로 주입한 환경변수를 함께 사용할 수 있습니다.

## 환경변수
- `PORT`: 기본 12000
- `PUBLIC_BASE_URL`: 다운로드 URL 생성용 베이스 주소
- `ADMIN_ACCESS_TOKEN_TTL_MINUTES`: 액세스 토큰 만료 분 (기본 30)
- `ADMIN_REFRESH_TOKEN_TTL_DAYS`: 리프레시 토큰 만료 일 (기본 7)
- `MYSQL_HOST`: MySQL 호스트
- `MYSQL_PORT`: MySQL 포트 (기본 3306)
- `MYSQL_USERNAME`: MySQL 사용자명
- `MYSQL_PASSWORD`: MySQL 비밀번호
- `MYSQL_DATABASE`: 사용 DB명
- `MYSQL_CONNECTION_LIMIT`: 커넥션 풀 크기 (기본 10)
- `MINIO_HOST`: MinIO 호스트 (`127.0.0.1:9000` 또는 `http(s)://host:port`)
- `MINIO_ACCESS_KEY`: MinIO Access Key
- `MINIO_SECRET_KEY`: MinIO Secret Key
- `MINIO_BUCKET_NAME`: APK 저장 버킷 이름
- `REDIS_URL`: Redis 접속 URL (기본 `redis://127.0.0.1:6379`)
- `REDIS_USERNAME`: Redis 사용자명 (선택)
- `REDIS_PASSWORD`: Redis 비밀번호 (선택)

## 운영 배포 (권장: systemd + start.sh)
`api-server`는 Docker 없이 `systemd`로 운영하는 방식을 권장합니다.

1. 서버 경로에 소스 배치 및 빌드:
```bash
cd /opt/sistrun-hub/api-server
npm ci
npm run build
```

2. 환경파일 생성 (`/etc/sistrun/api-server.env`):
```bash
PORT=12000
PUBLIC_BASE_URL=https://api.sist.kr
ADMIN_ACCESS_TOKEN_TTL_MINUTES=30
ADMIN_REFRESH_TOKEN_TTL_DAYS=7
MYSQL_HOST=127.0.0.1
MYSQL_PORT=3306
MYSQL_USERNAME=YOUR_DB_USER
MYSQL_PASSWORD=YOUR_DB_PASSWORD
MYSQL_DATABASE=sistrun_hub
MYSQL_CONNECTION_LIMIT=10
MINIO_HOST=127.0.0.1:9000
MINIO_ACCESS_KEY=YOUR_MINIO_ACCESS_KEY
MINIO_SECRET_KEY=YOUR_MINIO_SECRET_KEY
MINIO_BUCKET_NAME=sistrun-apks
REDIS_URL=redis://127.0.0.1:6379
REDIS_USERNAME=
REDIS_PASSWORD=
```

3. 서비스 파일 설치:
```bash
sudo cp /opt/sistrun-hub/api-server/deploy/sistrun-api.service /etc/systemd/system/sistrun-api.service
sudo systemctl daemon-reload
sudo systemctl enable --now sistrun-api
```

4. 상태 확인:
```bash
sudo systemctl status sistrun-api
sudo journalctl -u sistrun-api -f
```

참고:
- `deploy/sistrun-api.service`는 `EnvironmentFile=/etc/sistrun/api-server.env`를 읽습니다.
- 서비스는 `start.sh`를 통해 `node dist/index.js`를 실행합니다.
- 서버 사용자 계정에 맞게 `deploy/sistrun-api.service`의 `User`/`Group` 값을 변경하세요.

## DB 스키마
- 서버 시작 시 MySQL DB/테이블을 자동 생성합니다.
- 수동 생성이 필요하면 `/Users/nahooni0511/workspace/sistrun-hub/api-server/sql/schema.mysql.sql`을 실행하세요.

## 파일 다운로드 프록시
- MinIO 객체는 외부에서 직접 접근하지 않고 API 서버를 통해 다운로드합니다.
- 프록시 엔드포인트: `GET /api/files/:fileName/download`
- 호환 엔드포인트: `GET /downloads/:fileName`

## 주요 엔드포인트
- `GET /health`
- `POST /api/admin/login` (관리자 로그인 후 access/refresh token 발급)
- `POST /api/admin/refresh` (refresh token으로 토큰 재발급)
- `GET /admin/devices` (admin, 기기 목록)
- `GET /admin/devices/next-id?deviceType=시스트파크|시스트런` (admin, 다음 deviceId/모듈 미리보기)
- `POST /admin/devices` (admin, 기기 등록: `deviceId`는 서버에서 자동 생성, `institutionId?` 등 납품옵션 지원)
- `GET /admin/devices/:deviceId` (admin, 기기 상세)
- `GET /admin/institution-types` (admin, 기관 타입 목록)
- `GET /admin/institution-types/:typeCode/fields` (admin, 기관 타입별 필드)
- `GET /admin/institutions` (admin, 기관 목록)
- `POST /admin/institutions` (admin, 기관 등록)
- `GET /admin/institutions/:institutionId` (admin, 기관 상세)
- `PUT /admin/institutions/:institutionId` (admin, 기관 수정)
- `GET /admin/institutions/:institutionId/deliveries` (admin, 납품 이력)
- `POST /admin/institutions/:institutionId/deliveries` (admin, 납품 등록)
- `PATCH /admin/institutions/:institutionId/deliveries/:deliveryId/end` (admin, 납품 종료)
- `GET /admin/institutions/:institutionId/logs` (admin, 기관 로그)
- `GET /admin/institution-logs` (admin, 글로벌 기관 로그)
- `GET /admin/institutions/unassigned-devices` (admin, 기관 미할당 기기 목록)
- `GET /api/apps`
- `POST /api/apps/upload` (admin)
- `GET /api/apps/:appId/releases`
- `GET /api/settings`
- `PUT /api/settings` (admin)
- `POST /api/devices/check-updates`
- `POST /api/commands` (admin, 명령 생성)
- `GET /api/commands` (admin, 명령 조회)
- `POST /api/devices/:deviceId/commands/pull` (디바이스 명령 수신)
- `POST /api/devices/:deviceId/commands/:commandId/result` (디바이스 결과 리포트)

## 관리자 로그인
- 로그인 계정은 `auth_users` 테이블에 등록된 사용자만 사용합니다.
- 서버는 기본 관리자 계정을 자동 생성하지 않습니다.
- 세션(`accessToken`/`refreshToken`) 저장소는 Redis입니다.
- MySQL `auth_sessions` 테이블은 더 이상 사용하지 않습니다.
- 로그인 성공 시 응답의 `accessToken`을 `x-admin-token` 헤더로 전달하면 관리자 API 호출이 가능합니다.
- `Authorization: Bearer <accessToken>` 헤더도 사용할 수 있습니다.
- `accessToken` 만료 시 `refreshToken`으로 `/api/admin/refresh`를 호출해 새 토큰을 발급받아야 합니다.

## 기기 ID/모듈 자동 생성 규칙
- `deviceType=시스트런`이면 `run-001`, `run-002`... 순차 생성
- `deviceType=시스트파크`이면 `park-001`, `park-002`... 순차 생성
- 기기 등록 시 `device_modules` 테이블에 자동 삽입:
  - 시스트런: `안드로이드(10{끝3자리})`, `AI BOX(11{끝3자리})`
  - 시스트파크: `안드로이드(12{끝3자리})`, `AI BOX(13{끝3자리})`
