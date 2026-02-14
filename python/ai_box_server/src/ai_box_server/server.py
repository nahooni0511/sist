from __future__ import annotations

import argparse
import asyncio
import base64
import json
import logging
import math
import time
from dataclasses import dataclass
from typing import Any

import cv2
import numpy as np

try:
    import mediapipe as mp
except Exception:  # pragma: no cover
    mp = None


LOGGER = logging.getLogger("ai_box_server")


@dataclass
class ServerConfig:
    host: str
    port: int
    video_source: str
    hikvision_rtsp: str | None
    app_video_mode: str
    fps: int
    jpeg_quality: int


class PoseEstimator:
    def __init__(self) -> None:
        self._pose = None
        if mp is not None:
            self._pose = mp.solutions.pose.Pose(
                static_image_mode=False,
                model_complexity=1,
                smooth_landmarks=True,
                min_detection_confidence=0.5,
                min_tracking_confidence=0.5,
            )

    def detect(self, frame_bgr: np.ndarray) -> list[dict[str, float]]:
        if self._pose is None:
            return self._synthetic_landmarks()

        rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
        result = self._pose.process(rgb)
        if result.pose_landmarks is None:
            return self._synthetic_landmarks()

        landmarks: list[dict[str, float]] = []
        for lm in result.pose_landmarks.landmark:
            landmarks.append(
                {
                    "x": float(lm.x),
                    "y": float(lm.y),
                    "z": float(lm.z),
                    "visibility": float(lm.visibility),
                }
            )
        return landmarks

    @staticmethod
    def _synthetic_landmarks() -> list[dict[str, float]]:
        t = time.time()
        points: list[dict[str, float]] = []
        for idx in range(33):
            points.append(
                {
                    "x": 0.5 + 0.2 * math.sin(t * 1.8 + idx * 0.11),
                    "y": 0.5 + 0.2 * math.cos(t * 1.6 + idx * 0.13),
                    "z": 0.0,
                    "visibility": 0.8,
                }
            )
        return points


class FrameProvider:
    def __init__(self, source: str) -> None:
        parsed: str | int
        if source.isdigit():
            parsed = int(source)
        else:
            parsed = source
        self._capture = cv2.VideoCapture(parsed)

    def read(self) -> np.ndarray:
        if self._capture.isOpened():
            ok, frame = self._capture.read()
            if ok and frame is not None:
                return frame
        return self._placeholder_frame()

    def close(self) -> None:
        if self._capture is not None:
            self._capture.release()

    @staticmethod
    def _placeholder_frame() -> np.ndarray:
        frame = np.zeros((720, 1280, 3), dtype=np.uint8)
        cv2.putText(
            frame,
            "No video source available",
            (80, 120),
            cv2.FONT_HERSHEY_SIMPLEX,
            1.2,
            (255, 255, 255),
            2,
            cv2.LINE_AA,
        )
        return frame


class ClientSession:
    def __init__(
        self,
        reader: asyncio.StreamReader,
        writer: asyncio.StreamWriter,
        config: ServerConfig,
    ) -> None:
        self.reader = reader
        self.writer = writer
        self.config = config
        self.estimator = PoseEstimator()
        self.frame_provider = FrameProvider(config.video_source)

    async def run(self) -> None:
        addr = self.writer.get_extra_info("peername")
        LOGGER.info("client connected: %s", addr)

        await self._send_json(
            {
                "type": "status",
                "level": "info",
                "message": "client connected",
            }
        )

        if self.config.app_video_mode in {"rtsp_url", "both"} and self.config.hikvision_rtsp:
            await self._send_json(
                {
                    "type": "camera",
                    "rtsp_url": self.config.hikvision_rtsp,
                }
            )

        await self._consume_hello_if_any()

        interval = 1.0 / max(self.config.fps, 1)
        try:
            while not self.writer.is_closing():
                start = time.monotonic()
                frame, landmarks = await asyncio.to_thread(self._next_inference)

                await self._send_json(
                    {
                        "type": "landmarks",
                        "timestamp_ms": int(time.time() * 1000),
                        "keypoints": landmarks,
                    }
                )

                if self.config.app_video_mode in {"embedded_frames", "both"}:
                    encoded = self._encode_frame(frame)
                    await self._send_json(
                        {
                            "type": "frame",
                            "timestamp_ms": int(time.time() * 1000),
                            "width": int(frame.shape[1]),
                            "height": int(frame.shape[0]),
                            "jpeg_base64": encoded,
                        }
                    )

                elapsed = time.monotonic() - start
                if elapsed < interval:
                    await asyncio.sleep(interval - elapsed)
        except (asyncio.IncompleteReadError, ConnectionError, BrokenPipeError):
            LOGGER.info("client disconnected: %s", addr)
        finally:
            self.frame_provider.close()
            self.writer.close()
            await self.writer.wait_closed()

    async def _consume_hello_if_any(self) -> None:
        try:
            line = await asyncio.wait_for(self.reader.readline(), timeout=0.2)
            if not line:
                return
            payload = line.decode("utf-8", errors="ignore").strip()
            if payload:
                LOGGER.info("client hello: %s", payload)
        except TimeoutError:
            return
        except Exception:
            return

    def _next_inference(self) -> tuple[np.ndarray, list[dict[str, float]]]:
        frame = self.frame_provider.read()
        landmarks = self.estimator.detect(frame)
        return frame, landmarks

    def _encode_frame(self, frame: np.ndarray) -> str:
        ok, data = cv2.imencode(
            ".jpg",
            frame,
            [cv2.IMWRITE_JPEG_QUALITY, int(self.config.jpeg_quality)],
        )
        if not ok:
            return ""
        return base64.b64encode(data.tobytes()).decode("ascii")

    async def _send_json(self, payload: dict[str, Any]) -> None:
        self.writer.write((json.dumps(payload, separators=(",", ":")) + "\n").encode("utf-8"))
        await self.writer.drain()


async def run_server(config: ServerConfig) -> None:
    async def _handle(reader: asyncio.StreamReader, writer: asyncio.StreamWriter) -> None:
        session = ClientSession(reader, writer, config)
        await session.run()

    server = await asyncio.start_server(_handle, host=config.host, port=config.port)
    sockets = server.sockets or []
    for sock in sockets:
        LOGGER.info("listening on %s", sock.getsockname())

    async with server:
        await server.serve_forever()


def parse_args() -> ServerConfig:
    parser = argparse.ArgumentParser(description="AI BOX server for sistrun-dance")
    parser.add_argument("--host", default="0.0.0.0")
    parser.add_argument("--port", type=int, default=8090)
    parser.add_argument(
        "--video-source",
        default="0",
        help="OpenCV video source (camera index, RTSP URL, file path)",
    )
    parser.add_argument(
        "--hikvision-rtsp",
        default=None,
        help="RTSP URL sent to Android when app-video-mode includes rtsp_url",
    )
    parser.add_argument(
        "--app-video-mode",
        choices=["rtsp_url", "embedded_frames", "both"],
        default="rtsp_url",
    )
    parser.add_argument("--fps", type=int, default=15)
    parser.add_argument("--jpeg-quality", type=int, default=80)
    args = parser.parse_args()

    return ServerConfig(
        host=args.host,
        port=args.port,
        video_source=args.video_source,
        hikvision_rtsp=args.hikvision_rtsp,
        app_video_mode=args.app_video_mode,
        fps=args.fps,
        jpeg_quality=args.jpeg_quality,
    )


def setup_logging() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )


def main() -> None:
    setup_logging()
    config = parse_args()
    try:
        asyncio.run(run_server(config))
    except KeyboardInterrupt:
        LOGGER.info("server stopped")


if __name__ == "__main__":
    main()
