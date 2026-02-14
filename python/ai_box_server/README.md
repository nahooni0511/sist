# AI BOX Server

Android `sistrun-dance` 앱과 TCP(`8090`)로 연결되어 랜드마크/영상 정보를 전송합니다.

## 설치

```bash
cd python/ai_box_server
python3 -m venv .venv
source .venv/bin/activate
pip install -U pip
pip install -e .[pose]
```

## 실행

```bash
ai-box-server \
  --host 0.0.0.0 \
  --port 8090 \
  --video-source "rtsp://user:pass@192.168.0.10:554/Streaming/Channels/101" \
  --hikvision-rtsp "rtsp://user:pass@192.168.0.10:554/Streaming/Channels/101" \
  --app-video-mode rtsp_url \
  --fps 15
```

### 옵션
- `--app-video-mode rtsp_url`:
  - AI BOX는 `camera` 메시지(카메라 RTSP 주소) + `landmarks`만 전송
  - Android가 RTSP를 직접 재생
- `--app-video-mode embedded_frames`:
  - AI BOX가 JPEG 프레임(base64) + landmarks를 직접 socket으로 전송
- `--app-video-mode both`:
  - `camera` + `frame` + `landmarks` 모두 전송

## 프로토콜
루트의 `protocol/streaming_protocol.md` 참고.
