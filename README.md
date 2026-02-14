# sistrun-hub (Monorepo)

구성:
- `apps/launcher`: Android TV 런처 앱
- `apps/manager`: 슈퍼관리자용 기기 관리 앱 (마켓/설정/원격 명령 UI, 실행 위임)
- `apps/core_dpc`: Device Owner(DPC) 앱 (무인 설치/업데이트/정책 적용/명령 실행)
- `apps/sistrun-dance`: AI BOX 연결 + RTSP/프레임 수신 + Pose 스켈레톤 오버레이 앱
- `apps/pe-board`: 전자칠판 체육 수업 운영 앱(Expo/React Native)
- `api-server`: 마켓/설정/자동업데이트 API 서버 (TypeScript/Node.js)
- `web-admin`: 슈퍼관리자 웹 콘솔 (React + Vite)
- `python/ai_box_server`: AI BOX 서버(Python, TCP 8090)
- `protocol/streaming_protocol.md`: Android <-> AI BOX 메시지 규격

## 1) Android 빌드

```bash
./gradlew :launcher:assembleDebug
./gradlew :manager:assembleDebug
./gradlew :core_dpc:assembleDebug
./gradlew :sistrun-dance:assembleDebug
```

## 1-1) 마켓 서버 실행

```bash
cd api-server
npm install
npm run dev
```

## 1-2) 슈퍼관리자 웹 실행

```bash
cd web-admin
npm install
npm run dev
```

## 2) AI BOX 서버 실행

```bash
cd python/ai_box_server
python3 -m venv .venv
source .venv/bin/activate
pip install -U pip
pip install -e .[pose]
ai-box-server --host 0.0.0.0 --port 8090 --video-source 0 --app-video-mode embedded_frames --fps 15
```

또는 Hikvision RTSP를 앱에서 직접 재생하려면:

```bash
ai-box-server \
  --host 0.0.0.0 \
  --port 8090 \
  --video-source "rtsp://user:pass@camera/Streaming/Channels/101" \
  --hikvision-rtsp "rtsp://user:pass@camera/Streaming/Channels/101" \
  --app-video-mode rtsp_url
```

## 3) sistrun-dance 동작

1. 앱 실행
2. AI BOX IP 입력
3. (선택) Hikvision RTSP URL 입력
4. `연결` 클릭
5. 실시간 영상 + 랜드마크 스켈레톤 표시

## 4) PE Board 실행

```bash
cd apps/pe-board
npm install
npm run android
```
