# web/admin

슈퍼관리자 웹 콘솔 (React + Vite).

## IA
- `/apk`: APK관리 (업로드, 목록, 상세)
- `/devices`: 기기관리 (목록, 검색, 지도, 상세/원격명령)
- `/institutions`: 기관관리 (목록, 등록/수정, 상세, 납품이력, 액션로그)

## 실행
```bash
cd /Users/nahooni0511/workspace/sistrun-hub/web/admin
npm install
npm run dev
```

브라우저에서 `http://localhost:5173` 접속 후 로그인합니다.

인증 토큰은 브라우저 `sessionStorage`에 저장되며, access token 만료 시 refresh token으로 자동 갱신됩니다.

## 환경변수
- `VITE_API_BASE_URL`: 기본 API 서버 주소

예시:
```bash
VITE_API_BASE_URL=https://api.sist.kr
```

기본 파일:
- `/Users/nahooni0511/workspace/sistrun-hub/web/admin/.env.development`
- `/Users/nahooni0511/workspace/sistrun-hub/web/admin/.env.production`

## API 계약
- 기대 계약 문서: `/Users/nahooni0511/workspace/sistrun-hub/web/admin/docs/API_CONTRACT.md`

## 운영 배포 (nginx 정적 서빙)
`web/admin`은 빌드 산출물(`dist`)을 nginx 루트로 배포합니다.

1. 운영 env 작성 (`.env.production.local` 권장):
```bash
VITE_API_BASE_URL=https://api.sist.kr
```

2. 빌드:
```bash
cd /opt/sistrun-hub/web/admin
npm ci
npm run build
```

3. nginx 루트 경로로 배포:
```bash
sudo rsync -av --delete /opt/sistrun-hub/web/admin/dist/ /var/www/manager.sist.kr/
```

4. nginx 리로드:
```bash
sudo nginx -t
sudo systemctl reload nginx
```
