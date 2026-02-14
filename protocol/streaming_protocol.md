# Sistrun Streaming Protocol v0.1

전송 방식은 TCP socket(기본 포트 `8090`) + `\n`(newline) 단위 JSON Line 입니다.

## 클라이언트 -> AI BOX

```json
{"type":"hello","client":"sistrun-dance","version":"0.1.0"}
```

## AI BOX -> 클라이언트

### 상태 메시지

```json
{"type":"status","level":"info","message":"client connected"}
```

### 카메라 정보 메시지 (앱이 RTSP 직접 재생)

```json
{"type":"camera","rtsp_url":"rtsp://user:pass@192.168.0.80:554/Streaming/Channels/101"}
```

### 랜드마크 메시지

```json
{
  "type":"landmarks",
  "timestamp_ms":1700000000000,
  "keypoints":[
    {"x":0.52,"y":0.22,"z":-0.12,"visibility":0.99}
  ]
}
```

- `x`, `y`: 0~1 정규화 좌표
- `z`: 상대 깊이값
- `visibility`: 신뢰도

### 프레임 메시지 (앱에서 영상 직접 표시)

```json
{
  "type":"frame",
  "timestamp_ms":1700000000000,
  "width":1280,
  "height":720,
  "jpeg_base64":"..."
}
```

`app_video_mode=embedded_frames` 또는 `both`일 때 사용합니다.
