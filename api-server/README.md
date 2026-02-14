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

## 환경변수
- `PORT`: 기본 4000
- `PUBLIC_BASE_URL`: 다운로드 URL 생성용 베이스 주소
- `ADMIN_TOKEN`: 관리자 API 토큰 (`x-admin-token` 헤더)
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

## DB 스키마
- 서버 시작 시 MySQL DB/테이블을 자동 생성합니다.
- 수동 생성이 필요하면 `/Users/nahooni0511/workspace/sistrun-hub/api-server/sql/schema.mysql.sql`을 실행하세요.

## 파일 다운로드 프록시
- MinIO 객체는 외부에서 직접 접근하지 않고 API 서버를 통해 다운로드합니다.
- 프록시 엔드포인트: `GET /api/files/:fileName/download`
- 호환 엔드포인트: `GET /downloads/:fileName`

## 주요 엔드포인트
- `GET /health`
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
