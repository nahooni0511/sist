# AI BOX Server

## 설치

```bash
cd python/ai_box_server
python3 -m venv .venv
source .venv/bin/activate
pip install -U pip
pip install -e .[pose]
```

## 1) Dance 서버 (기존)

`sistrun-dance` 앱용 TCP 스트리밍 서버입니다.

```bash
ai-box-server \
  --host 0.0.0.0 \
  --port 8090 \
  --video-source "0" \
  --app-video-mode embedded_frames \
  --fps 15
```

## 2) Stand Hold 서버 (신규)

`sist_stand_hold` 앱용 서버입니다.

- 기능:
  - 실시간 카메라 프레임 전송
  - 기준 사진 대비 유사도 계산
  - 5초 세션 최고점 프레임 선별
  - OpenAI 자세 교정 피드백(환경변수 `OPENAI_API_KEY` + `--allow-openai-feedback`)

```bash
ai-box-stand-hold-server \
  --host 0.0.0.0 \
  --port 8091 \
  --camera-mode auto \
  --video-source 0 \
  --session-seconds 5 \
  --scoring-device auto \
  --send-landmarks
```

### 카메라 분기 예시

- Android 기본 카메라(앱 프레임 업로드, 권장):
```bash
ai-box-stand-hold-server --camera-mode auto --client-frame-timeout-sec 1.0
```

- Android 기본 카메라만 강제:
```bash
ai-box-stand-hold-server --camera-mode client --client-frame-timeout-sec 1.0
```

- Mac/개발PC(웹캠):
```bash
ai-box-stand-hold-server --camera-mode webcam --video-source 0
```

- NVIDIA + Hikvision RTSP:
```bash
ai-box-stand-hold-server \
  --camera-mode hikvision \
  --hikvision-rtsp "rtsp://admin:password@192.168.0.10:554/Streaming/Channels/101"
```

- Hikvision IP만 알고 있는 경우:
```bash
ai-box-stand-hold-server \
  --camera-mode hikvision \
  --hikvision-ip 192.168.0.10 \
  --hikvision-password password \
  --hikvision-camera-type hk
```

### CUDA/CPU 분기

- `--scoring-device auto`: CUDA 가능 시 `cuda`, 아니면 `cpu`
- `--scoring-device cuda`: 강제 CUDA (불가 시 자동 CPU fallback)
- `--scoring-device cpu`: 강제 CPU

### OpenAI 피드백

```bash
export OPENAI_API_KEY=...
ai-box-stand-hold-server --allow-openai-feedback
```

## Docker 배포 (실제 AI BOX)

`python/ai_box_server` 경로에 Docker 배포 파일이 포함되어 있습니다.

- `Dockerfile`
- `docker-compose.yml`

### 1) AI BOX에서 이미지 빌드

```bash
cd python/ai_box_server
docker compose build stand-hold
```

참고:
- 아키텍처 이슈로 `mediapipe` 설치가 실패하면 임시로 pose 의존성 없이 빌드 가능
```bash
INSTALL_POSE=0 docker compose build stand-hold
```

### 2) Stand Hold 서버 실행 (기본)

```bash
cd python/ai_box_server
docker compose up -d stand-hold
docker compose logs -f stand-hold
```

기본 포트는 `8091`입니다.

### 3) 웹캠(`/dev/video0`) 사용 시 실행 예시

`docker-compose.yml`에 아래를 추가한 뒤 실행하면 됩니다.

```yaml
services:
  stand-hold:
    devices:
      - /dev/video0:/dev/video0
```

### 4) Hikvision RTSP 사용 시 실행 예시

```bash
cd python/ai_box_server
AIBOX_CAMERA_MODE=hikvision \
AIBOX_VIDEO_SOURCE=0 \
docker compose run --rm --service-ports stand-hold \
  --host 0.0.0.0 \
  --port 8091 \
  --camera-mode hikvision \
  --hikvision-rtsp "rtsp://admin:password@192.168.0.10:554/Streaming/Channels/101" \
  --session-seconds 5 \
  --scoring-device auto \
  --send-landmarks
```

### 5) Dance 서버 실행

```bash
cd python/ai_box_server
docker compose --profile dance up -d dance
docker compose logs -f dance
```

기본 포트는 `8090`입니다.

### 6) OpenAI 피드백 포함 실행

```bash
cd python/ai_box_server
OPENAI_API_KEY=your_key \
docker compose run --rm --service-ports stand-hold \
  --host 0.0.0.0 \
  --port 8091 \
  --camera-mode auto \
  --video-source 0 \
  --allow-openai-feedback \
  --send-landmarks
```

### 7) 원격 배포 (개발 PC에서 빌드 후 AI BOX에 전달)

1. AI BOX 아키텍처 확인
```bash
uname -m
```
2. 개발 PC에서 아키텍처 맞춰 이미지 빌드/푸시
```bash
docker buildx build \
  --platform linux/amd64 \
  -t <registry>/sistrun/ai-box-server:latest \
  --push \
  python/ai_box_server
```
3. AI BOX에서 pull 후 실행
```bash
docker pull <registry>/sistrun/ai-box-server:latest
docker run -d --name ai-box-stand-hold --restart unless-stopped -p 8091:8091 \
  <registry>/sistrun/ai-box-server:latest \
  --host 0.0.0.0 --port 8091 --camera-mode auto --video-source 0 --send-landmarks
```
