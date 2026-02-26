from __future__ import annotations

import argparse
import asyncio
import base64
import json
import logging
import math
import os
import platform
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

import cv2
import numpy as np

try:
    import mediapipe as mp
except Exception:  # pragma: no cover
    mp = None

try:
    import torch
except Exception:  # pragma: no cover
    torch = None


LOGGER = logging.getLogger("ai_box_stand_hold")
MAX_COMMAND_BYTES = 4 * 1024 * 1024
IDLE_PREVIEW_FPS = 3


LEFT_SHOULDER = 11
RIGHT_SHOULDER = 12
LEFT_ELBOW = 13
RIGHT_ELBOW = 14
LEFT_WRIST = 15
RIGHT_WRIST = 16
LEFT_HIP = 23
RIGHT_HIP = 24
LEFT_KNEE = 25
RIGHT_KNEE = 26
LEFT_ANKLE = 27
RIGHT_ANKLE = 28
LEFT_HEEL = 29
RIGHT_HEEL = 30
LEFT_FOOT_INDEX = 31
RIGHT_FOOT_INDEX = 32

POSE_SELECTED_INDICES = np.array(
    [
        LEFT_SHOULDER,
        RIGHT_SHOULDER,
        LEFT_ELBOW,
        RIGHT_ELBOW,
        LEFT_WRIST,
        RIGHT_WRIST,
        LEFT_HIP,
        RIGHT_HIP,
        LEFT_KNEE,
        RIGHT_KNEE,
        LEFT_ANKLE,
        RIGHT_ANKLE,
        LEFT_HEEL,
        RIGHT_HEEL,
        LEFT_FOOT_INDEX,
        RIGHT_FOOT_INDEX,
    ],
    dtype=np.int32,
)

LEFT_RIGHT_SWAP_PAIRS: list[tuple[int, int]] = [
    (1, 4),
    (2, 5),
    (3, 6),
    (7, 8),
    (9, 10),
    (11, 12),
    (13, 14),
    (15, 16),
    (17, 18),
    (19, 20),
    (21, 22),
    (23, 24),
    (25, 26),
    (27, 28),
    (29, 30),
    (31, 32),
]

ANGLE_TRIPLETS: list[tuple[str, int, int, int]] = [
    ("left_elbow", LEFT_SHOULDER, LEFT_ELBOW, LEFT_WRIST),
    ("right_elbow", RIGHT_SHOULDER, RIGHT_ELBOW, RIGHT_WRIST),
    ("left_knee", LEFT_HIP, LEFT_KNEE, LEFT_ANKLE),
    ("right_knee", RIGHT_HIP, RIGHT_KNEE, RIGHT_ANKLE),
    ("left_hip", LEFT_SHOULDER, LEFT_HIP, LEFT_KNEE),
    ("right_hip", RIGHT_SHOULDER, RIGHT_HIP, RIGHT_KNEE),
    ("left_shoulder", LEFT_ELBOW, LEFT_SHOULDER, LEFT_HIP),
    ("right_shoulder", RIGHT_ELBOW, RIGHT_SHOULDER, RIGHT_HIP),
]

BONE_DEFS: list[tuple[str, int, int]] = [
    ("left_upper_arm", LEFT_SHOULDER, LEFT_ELBOW),
    ("right_upper_arm", RIGHT_SHOULDER, RIGHT_ELBOW),
    ("left_forearm", LEFT_ELBOW, LEFT_WRIST),
    ("right_forearm", RIGHT_ELBOW, RIGHT_WRIST),
    ("left_thigh", LEFT_HIP, LEFT_KNEE),
    ("right_thigh", RIGHT_HIP, RIGHT_KNEE),
    ("left_shin", LEFT_KNEE, LEFT_ANKLE),
    ("right_shin", RIGHT_KNEE, RIGHT_ANKLE),
]


@dataclass
class PosePacket:
    points: np.ndarray  # (33,3)
    vis: np.ndarray  # (33,)
    pres: np.ndarray  # (33,)


@dataclass
class ScoreConfig:
    sigma_coord: float = 0.12
    sigma_angle: float = 15.0
    w_coord: float = 0.4
    w_angle: float = 0.4
    w_bone: float = 0.2
    conf_threshold: float = 0.5
    min_valid_joints: int = 6
    min_valid_angles: int = 2
    min_valid_bones: int = 3


@dataclass
class ScoreResult:
    final: float | None
    coord_score: float | None
    angle_score: float | None
    bone_score: float | None
    coord_err: float | None
    angle_err: float | None
    matched_joints: int
    matched_angles: int
    matched_bones: int
    reliable: bool
    mirror_used: bool
    reason: str = ""
    angle_diffs: dict[str, float] = field(default_factory=dict)

    def as_metrics(self, *, using_world: bool) -> dict[str, Any]:
        return {
            "score": self.final,
            "coord_score": self.coord_score,
            "angle_score": self.angle_score,
            "bone_score": self.bone_score,
            "coord_err": self.coord_err,
            "angle_err": self.angle_err,
            "valid_joints": self.matched_joints,
            "valid_angles": self.matched_angles,
            "valid_bones": self.matched_bones,
            "reliable": self.reliable,
            "mode": "MIRROR" if self.mirror_used else "NORMAL",
            "using_world": using_world,
            "reason": self.reason,
            "angle_diffs": self.angle_diffs,
        }


@dataclass
class ServerConfig:
    host: str
    port: int
    camera_mode: str
    video_source: str
    hikvision_rtsp: str | None
    hikvision_ip: str | None
    hikvision_password: str
    hikvision_camera_type: str
    fps: int
    jpeg_quality: int
    session_seconds: int
    prefer_world_landmarks: bool
    scoring_device: str
    send_landmarks: bool
    client_frame_timeout_sec: float
    allow_openai_feedback: bool
    openai_model: str
    openai_timeout_sec: float


@dataclass
class ActiveSession:
    template_name: str
    started_at: float
    deadline_at: float
    reference_image_base64: str
    reference_pose: PosePacket
    best_score: float = -1.0
    best_frame_base64: str = ""
    best_metrics: dict[str, Any] = field(default_factory=dict)
    best_landmarks: list[dict[str, float]] = field(default_factory=list)
    result_sent: bool = False
    frames_base64_seq: list[str] = field(default_factory=list)
    poses_seq: list[PosePacket | None] = field(default_factory=list)
    ts_ms_seq: list[int] = field(default_factory=list)


class PoseEstimator:
    def __init__(self, *, prefer_world_landmarks: bool) -> None:
        self.prefer_world_landmarks = prefer_world_landmarks
        self._backend = "none"
        self._video_pose = None
        self._image_pose = None
        self._video_landmarker = None
        self._image_landmarker = None

        if mp is None:
            LOGGER.warning("mediapipe is not installed. pose estimation disabled.")
            return

        if hasattr(mp, "solutions"):
            self._backend = "solutions"
            self._video_pose = mp.solutions.pose.Pose(
                static_image_mode=False,
                model_complexity=1,
                smooth_landmarks=True,
                min_detection_confidence=0.5,
                min_tracking_confidence=0.5,
            )
            self._image_pose = mp.solutions.pose.Pose(
                static_image_mode=True,
                model_complexity=1,
                smooth_landmarks=False,
                min_detection_confidence=0.5,
                min_tracking_confidence=0.5,
            )
            return

        if hasattr(mp, "tasks"):
            model_path = self._resolve_tasks_model_path()
            if model_path is None:
                LOGGER.error("mediapipe tasks backend is available but pose model download/init failed.")
                return
            self._backend = "tasks"
            self._init_tasks_landmarkers(model_path)
            return

        LOGGER.error("unsupported mediapipe package shape. no pose backend is available.")

    def detect_video(self, frame_bgr: np.ndarray, timestamp_ms: int | None = None) -> PosePacket | None:
        if self._backend == "solutions":
            if self._video_pose is None:
                return None
            rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
            result = self._video_pose.process(rgb)
            return self._to_pose_packet_from_solutions(result)

        if self._backend == "tasks":
            if self._video_landmarker is None:
                return None
            ts = int(timestamp_ms if timestamp_ms is not None else time.time() * 1000)
            mp_image = self._to_mp_image(frame_bgr)
            result = self._video_landmarker.detect_for_video(mp_image, ts)
            return self._to_pose_packet_from_tasks(result)
        return None

    def detect_image(self, image_bgr: np.ndarray) -> PosePacket | None:
        if self._backend == "solutions":
            if self._image_pose is None:
                return None
            rgb = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2RGB)
            result = self._image_pose.process(rgb)
            return self._to_pose_packet_from_solutions(result)

        if self._backend == "tasks":
            if self._image_landmarker is None:
                return None
            mp_image = self._to_mp_image(image_bgr)
            result = self._image_landmarker.detect(mp_image)
            return self._to_pose_packet_from_tasks(result)
        return None

    @staticmethod
    def _to_mp_image(image_bgr: np.ndarray) -> Any:
        image_rgb = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2RGB)
        return mp.Image(image_format=mp.ImageFormat.SRGB, data=image_rgb)

    def _resolve_tasks_model_path(self) -> Path | None:
        env_path = str(os.environ.get("MEDIAPIPE_POSE_MODEL_PATH", "")).strip()
        if env_path:
            candidate = Path(env_path).expanduser().resolve()
            if candidate.exists() and candidate.is_file():
                return candidate
            LOGGER.error("MEDIAPIPE_POSE_MODEL_PATH is set but file does not exist: %s", candidate)
            return None

        cache_dir = Path.home() / ".cache" / "ai_box_server"
        cache_dir.mkdir(parents=True, exist_ok=True)
        model_path = cache_dir / "pose_landmarker_lite.task"
        if model_path.exists() and model_path.is_file():
            return model_path

        model_url = (
            "https://storage.googleapis.com/mediapipe-models/pose_landmarker/"
            "pose_landmarker_lite/float16/latest/pose_landmarker_lite.task"
        )
        LOGGER.info("downloading mediapipe pose model: %s", model_url)
        try:
            req = Request(model_url, headers={"User-Agent": "ai-box-stand-hold/0.1"})
            with urlopen(req, timeout=30) as response:
                data = response.read()
            model_path.write_bytes(data)
            return model_path
        except Exception as exc:  # noqa: BLE001
            LOGGER.error("failed to download mediapipe model: %s", exc)
            return None

    def _init_tasks_landmarkers(self, model_path: Path) -> None:
        base_options = mp.tasks.BaseOptions(model_asset_path=str(model_path))

        image_options = mp.tasks.vision.PoseLandmarkerOptions(
            base_options=base_options,
            running_mode=mp.tasks.vision.RunningMode.IMAGE,
            num_poses=1,
            min_pose_detection_confidence=0.5,
            min_pose_presence_confidence=0.5,
            min_tracking_confidence=0.5,
            output_segmentation_masks=False,
        )
        video_options = mp.tasks.vision.PoseLandmarkerOptions(
            base_options=base_options,
            running_mode=mp.tasks.vision.RunningMode.VIDEO,
            num_poses=1,
            min_pose_detection_confidence=0.5,
            min_pose_presence_confidence=0.5,
            min_tracking_confidence=0.5,
            output_segmentation_masks=False,
        )
        self._image_landmarker = mp.tasks.vision.PoseLandmarker.create_from_options(image_options)
        self._video_landmarker = mp.tasks.vision.PoseLandmarker.create_from_options(video_options)

    def _to_pose_packet_from_solutions(self, result: Any) -> PosePacket | None:
        if result is None or getattr(result, "pose_landmarks", None) is None:
            return None

        landmarks = result.pose_landmarks.landmark
        if len(landmarks) != 33:
            return None

        norm_points = np.asarray([[float(lm.x), float(lm.y), float(lm.z)] for lm in landmarks], dtype=np.float32)
        vis = np.asarray([float(getattr(lm, "visibility", 1.0)) for lm in landmarks], dtype=np.float32)
        vis = np.clip(vis, 0.0, 1.0)
        pres = np.ones(33, dtype=np.float32)

        if (
            self.prefer_world_landmarks
            and hasattr(result, "pose_world_landmarks")
            and result.pose_world_landmarks is not None
            and len(result.pose_world_landmarks.landmark) == 33
        ):
            world = result.pose_world_landmarks.landmark
            points = np.asarray([[float(lm.x), float(lm.y), float(lm.z)] for lm in world], dtype=np.float32)
        else:
            points = norm_points
        return PosePacket(points=points, vis=vis, pres=pres)

    def _to_pose_packet_from_tasks(self, result: Any) -> PosePacket | None:
        if result is None:
            return None
        pose_landmarks = getattr(result, "pose_landmarks", None)
        if not pose_landmarks:
            return None
        if len(pose_landmarks) < 1:
            return None
        landmarks = pose_landmarks[0]
        if len(landmarks) != 33:
            return None

        norm_points = np.asarray([[float(lm.x), float(lm.y), float(lm.z)] for lm in landmarks], dtype=np.float32)
        vis = np.asarray([float(getattr(lm, "visibility", 1.0)) for lm in landmarks], dtype=np.float32)
        vis = np.clip(vis, 0.0, 1.0)
        pres = np.asarray([float(getattr(lm, "presence", 1.0)) for lm in landmarks], dtype=np.float32)
        pres = np.clip(pres, 0.0, 1.0)

        pose_world = getattr(result, "pose_world_landmarks", None)
        if self.prefer_world_landmarks and pose_world and len(pose_world) > 0 and len(pose_world[0]) == 33:
            world_landmarks = pose_world[0]
            points = np.asarray(
                [[float(lm.x), float(lm.y), float(lm.z)] for lm in world_landmarks],
                dtype=np.float32,
            )
        else:
            points = norm_points
        return PosePacket(points=points, vis=vis, pres=pres)


class FrameProvider:
    _placeholder_cache: np.ndarray | None = None

    def __init__(self, config: ServerConfig) -> None:
        self.config = config
        self._capture: cv2.VideoCapture | None = None
        self.current_source_desc = "placeholder"
        self._last_reopen_attempt = 0.0
        self._reopen_interval_sec = 3.0
        self._camera_failed_logged = False
        self._open_capture()

    def read(self) -> np.ndarray:
        if self._capture is not None and self._capture.isOpened():
            ok, frame = self._capture.read()
            if ok and frame is not None:
                return frame

        now = time.monotonic()
        if now - self._last_reopen_attempt >= self._reopen_interval_sec:
            self._reopen_capture()
            self._last_reopen_attempt = now

        if self._capture is not None and self._capture.isOpened():
            ok, frame = self._capture.read()
            if ok and frame is not None:
                return frame
        return self._placeholder_frame()

    def close(self) -> None:
        if self._capture is not None:
            self._capture.release()
            self._capture = None

    def _reopen_capture(self) -> None:
        self.close()
        self._open_capture()

    def _open_capture(self) -> None:
        if platform.system().lower() == "darwin":
            # macOS headless/dev environments often cannot open camera authorization UI.
            os.environ.setdefault("OPENCV_AVFOUNDATION_SKIP_AUTH", "1")

        candidates = self._camera_candidates()
        for source, desc in candidates:
            cap = cv2.VideoCapture(source)
            if cap.isOpened():
                self._capture = cap
                self.current_source_desc = desc
                self._camera_failed_logged = False
                LOGGER.info("camera source opened: %s", desc)
                return
            cap.release()
            LOGGER.warning("camera source open failed: %s", desc)

        self._capture = None
        self.current_source_desc = "placeholder"
        if not self._camera_failed_logged:
            LOGGER.error("all camera sources failed. using placeholder frames")
            self._camera_failed_logged = True

    def _camera_candidates(self) -> list[tuple[Any, str]]:
        cfg = self.config
        candidates: list[tuple[Any, str]] = []

        use_hikvision = cfg.camera_mode in {"auto", "hikvision"}
        use_webcam = cfg.camera_mode in {"auto", "webcam"}

        if use_hikvision:
            rtsp = cfg.hikvision_rtsp
            if not rtsp and cfg.hikvision_ip:
                rtsp = self._build_hikvision_rtsp(
                    ip=cfg.hikvision_ip,
                    password=cfg.hikvision_password,
                    camera_type=cfg.hikvision_camera_type,
                )
            if rtsp:
                candidates.append((rtsp, f"hikvision_rtsp({rtsp})"))

        if use_webcam:
            source = cfg.video_source
            if source.isdigit():
                candidates.append((int(source), f"webcam_index({source})"))
            else:
                candidates.append((source, f"video_source({source})"))

        if not candidates:
            candidates.append((0, "webcam_index(0)"))
        return candidates

    @staticmethod
    def _build_hikvision_rtsp(*, ip: str, password: str, camera_type: str) -> str:
        if camera_type == "dh":
            return f"rtsp://admin:{password}@{ip}/cam/realmonitor?channel=1&subtype=0"
        return f"rtsp://admin:{password}@{ip}:554/Streaming/Channels/101"

    @staticmethod
    def _placeholder_frame() -> np.ndarray:
        cached = FrameProvider._placeholder_cache
        if cached is not None:
            return cached

        frame = np.zeros((720, 1280, 3), dtype=np.uint8)
        cv2.putText(
            frame,
            "Camera unavailable",
            (60, 130),
            cv2.FONT_HERSHEY_SIMPLEX,
            2.0,
            (255, 255, 255),
            3,
            cv2.LINE_AA,
        )
        cv2.putText(
            frame,
            "Check camera-mode / RTSP / webcam index",
            (60, 200),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.9,
            (180, 180, 180),
            2,
            cv2.LINE_AA,
        )
        FrameProvider._placeholder_cache = frame
        return frame


class PoseScorer:
    def __init__(self, config: ScoreConfig, *, device_preference: str) -> None:
        self.config = config
        self.device = self._resolve_device(device_preference)

    @staticmethod
    def _resolve_device(device_preference: str) -> str:
        pref = device_preference.lower().strip()
        if pref == "cpu":
            return "cpu"

        cuda_available = bool(torch is not None and torch.cuda.is_available())
        if pref == "cuda":
            return "cuda" if cuda_available else "cpu"
        return "cuda" if cuda_available else "cpu"

    def score(self, ref: PosePacket, cur: PosePacket) -> ScoreResult:
        normal = self._score_single(ref, cur)

        cur_mirrored = PosePacket(
            points=mirror_and_swap_points(cur.points),
            vis=swap_left_right(cur.vis),
            pres=swap_left_right(cur.pres),
        )
        mirrored = self._score_single(ref, cur_mirrored)
        mirrored.mirror_used = True

        if normal.final is None and mirrored.final is None:
            if mirrored.matched_joints > normal.matched_joints:
                return mirrored
            return normal

        if normal.final is None:
            return mirrored
        if mirrored.final is None:
            return normal
        if mirrored.final > normal.final:
            return mirrored
        return normal

    def _score_single(self, ref: PosePacket, cur: PosePacket) -> ScoreResult:
        cfg = self.config

        ref_norm = center_and_scale(ref.points)
        cur_norm = center_and_scale(cur.points)

        joint_weights = np.minimum(ref.vis, cur.vis) * np.minimum(ref.pres, cur.pres)
        joint_weights = np.clip(joint_weights, 0.0, 1.0).astype(np.float32)

        ref_sel = ref_norm[POSE_SELECTED_INDICES]
        cur_sel = cur_norm[POSE_SELECTED_INDICES]
        w_sel = joint_weights[POSE_SELECTED_INDICES]

        valid_mask = w_sel >= cfg.conf_threshold
        matched_joints = int(np.count_nonzero(valid_mask))
        if matched_joints < cfg.min_valid_joints:
            return ScoreResult(
                final=None,
                coord_score=None,
                angle_score=None,
                bone_score=None,
                coord_err=None,
                angle_err=None,
                matched_joints=matched_joints,
                matched_angles=0,
                matched_bones=0,
                reliable=False,
                mirror_used=False,
                reason="Too few reliable joints.",
            )

        ref_valid = ref_sel[valid_mask]
        cur_valid = cur_sel[valid_mask]
        w_valid = w_sel[valid_mask]

        _, coord_err, rot, scale, trans = procrustes_align(
            ref_valid,
            cur_valid,
            weights=w_valid,
            device=self.device,
        )
        if not np.isfinite(coord_err):
            return ScoreResult(
                final=None,
                coord_score=None,
                angle_score=None,
                bone_score=None,
                coord_err=None,
                angle_err=None,
                matched_joints=matched_joints,
                matched_angles=0,
                matched_bones=0,
                reliable=False,
                mirror_used=False,
                reason="Procrustes alignment failed.",
            )

        cur_aligned = scale * (cur_norm @ rot) + trans
        coord_score = float(np.exp(-coord_err / max(cfg.sigma_coord, 1e-6)))

        angle_err, angle_score, matched_angles, angle_diffs = compute_angle_score(
            ref_points=ref_norm,
            cur_points=cur_aligned,
            joint_weights=joint_weights,
            conf_threshold=cfg.conf_threshold,
            sigma_angle=cfg.sigma_angle,
        )

        bone_score, matched_bones = compute_bone_score(
            ref_points=ref_norm,
            cur_points=cur_aligned,
            joint_weights=joint_weights,
            conf_threshold=cfg.conf_threshold,
        )

        if angle_score is None or bone_score is None:
            return ScoreResult(
                final=None,
                coord_score=coord_score * 100.0,
                angle_score=None if angle_score is None else angle_score * 100.0,
                bone_score=None if bone_score is None else bone_score * 100.0,
                coord_err=coord_err,
                angle_err=angle_err,
                matched_joints=matched_joints,
                matched_angles=matched_angles,
                matched_bones=matched_bones,
                reliable=False,
                mirror_used=False,
                reason="Insufficient reliable angles or bones.",
                angle_diffs=angle_diffs,
            )

        if matched_angles < cfg.min_valid_angles or matched_bones < cfg.min_valid_bones:
            return ScoreResult(
                final=None,
                coord_score=coord_score * 100.0,
                angle_score=angle_score * 100.0,
                bone_score=bone_score * 100.0,
                coord_err=coord_err,
                angle_err=angle_err,
                matched_joints=matched_joints,
                matched_angles=matched_angles,
                matched_bones=matched_bones,
                reliable=False,
                mirror_used=False,
                reason="Pose not reliable.",
                angle_diffs=angle_diffs,
            )

        final_score = 100.0 * (
            cfg.w_coord * coord_score
            + cfg.w_angle * angle_score
            + cfg.w_bone * bone_score
        )
        final_score = float(np.clip(final_score, 0.0, 100.0))

        return ScoreResult(
            final=final_score,
            coord_score=coord_score * 100.0,
            angle_score=angle_score * 100.0,
            bone_score=bone_score * 100.0,
            coord_err=coord_err,
            angle_err=angle_err,
            matched_joints=matched_joints,
            matched_angles=matched_angles,
            matched_bones=matched_bones,
            reliable=True,
            mirror_used=False,
            reason="",
            angle_diffs=angle_diffs,
        )


class FeedbackGenerator:
    def __init__(
        self,
        *,
        enabled: bool,
        model: str,
        timeout_sec: float,
    ) -> None:
        self.enabled = enabled
        self.model = model
        self.timeout_sec = timeout_sec

    def generate(
        self,
        *,
        reference_image_base64: str,
        candidate_image_base64: str,
        metrics: dict[str, Any],
    ) -> tuple[str, str]:
        api_key = str(os.environ.get("OPENAI_API_KEY", "")).strip()
        if self.enabled and api_key:
            try:
                text = self._request_openai(
                    api_key=api_key,
                    reference_image_base64=reference_image_base64,
                    candidate_image_base64=candidate_image_base64,
                    metrics=metrics,
                )
                return text, self.model
            except Exception as exc:  # noqa: BLE001
                LOGGER.warning("openai feedback failed. fallback to local coach: %s", exc)

        return self._build_local_feedback(metrics), "local-fallback"

    def _request_openai(
        self,
        *,
        api_key: str,
        reference_image_base64: str,
        candidate_image_base64: str,
        metrics: dict[str, Any],
    ) -> str:
        ref_url = f"data:image/jpeg;base64,{reference_image_base64}"
        cand_url = f"data:image/jpeg;base64,{candidate_image_base64}"

        score = float(metrics.get("score", 0) or 0)
        valid_joints = int(metrics.get("valid_joints", 0) or 0)
        mode = str(metrics.get("mode", "NORMAL") or "NORMAL")
        coord_err = metrics.get("coord_err", None)
        angle_err = metrics.get("angle_err", None)
        angle_diffs = metrics.get("angle_diffs", {})

        prompt = (
            "첫 번째 이미지는 기준 자세, 두 번째 이미지는 사용자의 최고점 프레임입니다. "
            "얼굴/배경은 무시하고 신체 정렬만 비교하세요.\n"
            f"score={score:.1f}, valid_joints={valid_joints}, mode={mode}, "
            f"coord_err={coord_err}, angle_err={angle_err}, angle_diffs={angle_diffs}.\n"
            "한국어로 작성하고 아래 형식을 정확히 지키세요.\n"
            "1) 핵심 오차 요약 2줄\n"
            "2) 수정 포인트 5개 (각 항목: 문제 / 교정 방법)\n"
            "3) 20초 교정 루틴 1개\n"
            "짧고 실행 가능하게 작성하세요."
        )

        payload = {
            "model": self.model,
            "temperature": 0.2,
            "max_tokens": 500,
            "messages": [
                {
                    "role": "system",
                    "content": "너는 공원 체육기기용 자세 코칭 전문가다. 기준 사진과 사용자 프레임을 비교해 즉시 적용 가능한 교정 지침을 준다.",
                },
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": prompt},
                        {"type": "image_url", "image_url": {"url": ref_url}},
                        {"type": "image_url", "image_url": {"url": cand_url}},
                    ],
                },
            ],
        }

        req = Request(
            url="https://api.openai.com/v1/chat/completions",
            data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
            method="POST",
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {api_key}",
            },
        )

        try:
            with urlopen(req, timeout=max(5.0, float(self.timeout_sec))) as response:
                body = response.read().decode("utf-8", errors="replace")
        except HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace")
            raise RuntimeError(detail[-1200:]) from exc
        except URLError as exc:
            raise RuntimeError(str(exc)) from exc

        data = json.loads(body)
        choices = data.get("choices") or []
        if not choices:
            raise RuntimeError("OpenAI returned no choices")

        content = choices[0].get("message", {}).get("content", "")
        if isinstance(content, list):
            text_parts = []
            for item in content:
                if isinstance(item, dict) and item.get("type") == "text":
                    text_parts.append(str(item.get("text", "")))
            content = "\n".join(text_parts)

        text = str(content).strip()
        if not text:
            raise RuntimeError("OpenAI returned empty content")
        return text

    @staticmethod
    def _build_local_feedback(metrics: dict[str, Any]) -> str:
        score = float(metrics.get("score", 0.0) or 0.0)
        mode = str(metrics.get("mode", "NORMAL") or "NORMAL")
        angle_diffs = metrics.get("angle_diffs", {})
        if not isinstance(angle_diffs, dict):
            angle_diffs = {}

        sorted_angles = sorted(
            (
                (str(k), float(v))
                for k, v in angle_diffs.items()
                if isinstance(v, (int, float)) and math.isfinite(float(v))
            ),
            key=lambda item: item[1],
            reverse=True,
        )
        worst = sorted_angles[:3]

        lines: list[str] = []
        lines.append(f"점수 {score:.1f}점 ({mode}) 기준 자동 교정 결과입니다.")
        if score >= 85:
            lines.append("자세가 전반적으로 안정적입니다. 유지한 상태에서 호흡만 더 정리하면 좋습니다.")
        elif score >= 70:
            lines.append("자세가 거의 맞지만, 관절 정렬 오차가 일부 남아 있습니다.")
        else:
            lines.append("기준 자세와 차이가 큽니다. 아래 3가지부터 먼저 고정하세요.")

        if worst:
            lines.append("핵심 오차 부위:")
            for name, diff in worst:
                lines.append(f"- {name}: 약 {diff:.1f}도 차이")

        lines.append("수정 가이드:")
        lines.append("- 어깨: 양쪽 높이를 맞추고 가슴을 과하게 열지 않기")
        lines.append("- 팔꿈치: 기준 사진 각도까지 천천히 접거나 펴기")
        lines.append("- 골반: 좌우 회전 없이 정면 유지, 허리 과신전 방지")
        lines.append("- 무릎: 발끝 방향과 동일한 축으로 정렬")
        lines.append("- 발목/발끝: 체중을 발 중앙에 두고 흔들림 최소화")

        lines.append("20초 교정 루틴:")
        lines.append("1) 10초간 골반-어깨 수평 맞추기")
        lines.append("2) 10초간 팔꿈치/무릎 각도만 기준 사진에 맞추기")
        return "\n".join(lines)


class ClientSession:
    def __init__(
        self,
        *,
        reader: asyncio.StreamReader,
        writer: asyncio.StreamWriter,
        config: ServerConfig,
    ) -> None:
        self.reader = reader
        self.writer = writer
        self.config = config

        self.pose_estimator = PoseEstimator(prefer_world_landmarks=config.prefer_world_landmarks)
        self.frame_provider = None if config.camera_mode == "client" else FrameProvider(config)
        self.scorer = PoseScorer(ScoreConfig(), device_preference=config.scoring_device)
        self.feedback_generator = FeedbackGenerator(
            enabled=config.allow_openai_feedback,
            model=config.openai_model,
            timeout_sec=config.openai_timeout_sec,
        )
        self.active_session: ActiveSession | None = None
        self.latest_client_frame: np.ndarray | None = None
        self.latest_client_frame_at_monotonic: float = 0.0
        self.client_source_announced = False

    async def run(self) -> None:
        peer = self.writer.get_extra_info("peername")
        LOGGER.info("client connected: %s", peer)

        await self._send_json(
            {
                "type": "server_info",
                "name": "ai_box_stand_hold",
                "version": "0.1.0",
                "camera_source": self._camera_source_desc(),
                "platform": platform.platform(),
                "scoring_device": self.scorer.device,
                "cuda_available": bool(torch is not None and torch.cuda.is_available()),
                "mediapipe_available": mp is not None,
            }
        )
        await self._send_json(
            {
                "type": "status",
                "level": "info",
                "message": "AI BOX stand-hold server connected",
            }
        )

        active_interval = 1.0 / max(int(self.config.fps), 1)
        idle_interval = max(active_interval, 1.0 / float(IDLE_PREVIEW_FPS))

        try:
            while not self.writer.is_closing():
                loop_started = time.monotonic()

                await self._consume_commands_non_blocking()
                session_active = self.active_session is not None
                loop_interval = active_interval if session_active else idle_interval

                frame = await asyncio.to_thread(self._read_effective_frame)
                video_ts_ms = int(loop_started * 1000.0)
                should_detect_pose = session_active or self.config.send_landmarks
                pose = None
                if should_detect_pose:
                    pose = await asyncio.to_thread(self.pose_estimator.detect_video, frame, video_ts_ms)
                frame_base64 = await asyncio.to_thread(
                    encode_frame_to_base64,
                    frame,
                    self.config.jpeg_quality,
                )
                landmarks_payload: list[dict[str, float]] = []
                if self.config.send_landmarks and pose is not None:
                    landmarks_payload = pose_to_json_points(pose)

                score = None
                if session_active and self.active_session is not None:
                    self.active_session.frames_base64_seq.append(frame_base64)
                    self.active_session.poses_seq.append(pose)
                    self.active_session.ts_ms_seq.append(int(time.time() * 1000))

                    remaining_ms = int(max(0.0, (self.active_session.deadline_at - time.monotonic()) * 1000.0))
                    await self._send_json(
                        {
                            "type": "session_progress",
                            "remaining_ms": remaining_ms,
                            "current_score": None,
                            "best_score": None,
                            "metrics": {
                                "reliable": False,
                                "reason": "offline_temporal_postprocess",
                            },
                        }
                    )

                await self._send_json(
                    {
                        "type": "frame",
                        "timestamp_ms": int(time.time() * 1000),
                        "jpeg_base64": frame_base64,
                        "width": int(frame.shape[1]),
                        "height": int(frame.shape[0]),
                        "current_score": score,
                    }
                )

                if self.config.send_landmarks:
                    await self._send_json(
                        {
                            "type": "landmarks",
                            "timestamp_ms": int(time.time() * 1000),
                            "keypoints": landmarks_payload,
                        }
                    )

                await self._consume_commands_non_blocking()

                if self.active_session is not None and time.monotonic() >= self.active_session.deadline_at:
                    await self._finish_session()

                elapsed = time.monotonic() - loop_started
                if elapsed < loop_interval:
                    await asyncio.sleep(loop_interval - elapsed)

        except (ConnectionResetError, BrokenPipeError, asyncio.IncompleteReadError):
            LOGGER.info("client disconnected: %s", peer)
        finally:
            if self.frame_provider is not None:
                self.frame_provider.close()
            self.writer.close()
            await self.writer.wait_closed()

    def _camera_source_desc(self) -> str:
        if self._latest_client_frame_if_fresh() is not None:
            return "android_client_frame"
        if self.config.camera_mode == "client":
            return "android_client_frame(waiting)"
        if self.frame_provider is not None:
            return self.frame_provider.current_source_desc
        return "placeholder"

    def _read_effective_frame(self) -> np.ndarray:
        client_frame = self._latest_client_frame_if_fresh()
        if client_frame is not None:
            return client_frame
        if self.config.camera_mode == "client":
            return FrameProvider._placeholder_frame()
        if self.frame_provider is not None:
            return self.frame_provider.read()
        return FrameProvider._placeholder_frame()

    def _latest_client_frame_if_fresh(self) -> np.ndarray | None:
        frame = self.latest_client_frame
        if frame is None:
            return None
        age_sec = time.monotonic() - self.latest_client_frame_at_monotonic
        if age_sec > self.config.client_frame_timeout_sec:
            return None
        return frame

    async def _consume_commands_non_blocking(self) -> None:
        while True:
            try:
                line = await asyncio.wait_for(self.reader.readline(), timeout=0.001)
            except TimeoutError:
                return
            except ValueError:
                await self._send_json(
                    {
                        "type": "status",
                        "level": "warning",
                        "message": "incoming command too large",
                    }
                )
                return
            if not line:
                return
            raw = line.decode("utf-8", errors="ignore").strip()
            if not raw:
                continue
            await self._handle_client_command(raw)

    async def _handle_client_command(self, raw: str) -> None:
        try:
            payload = json.loads(raw)
        except Exception:
            await self._send_json(
                {
                    "type": "status",
                    "level": "warning",
                    "message": "invalid json command",
                }
            )
            return

        if not isinstance(payload, dict):
            return

        cmd_type = str(payload.get("type", "")).strip()
        if cmd_type == "hello":
            await self._send_json(
                {
                    "type": "status",
                    "level": "info",
                    "message": "hello acknowledged",
                }
            )
            return

        if cmd_type == "ping":
            await self._send_json({"type": "pong", "timestamp_ms": int(time.time() * 1000)})
            return

        if cmd_type == "stop_session":
            self.active_session = None
            await self._send_json({"type": "session_stopped"})
            return

        if cmd_type == "start_session":
            await self._start_session(payload)
            return

        if cmd_type == "client_frame":
            await self._handle_client_frame(payload)
            return

        await self._send_json(
            {
                "type": "status",
                "level": "warning",
                "message": f"unknown command: {cmd_type}",
            }
        )

    async def _handle_client_frame(self, payload: dict[str, Any]) -> None:
        if self.config.camera_mode not in {"auto", "client"}:
            return

        raw_jpeg_base64 = str(payload.get("jpeg_base64", "")).strip()
        if not raw_jpeg_base64:
            return

        frame_bgr = decode_base64_image(raw_jpeg_base64)
        if frame_bgr is None:
            return

        rotation_raw = payload.get("rotation_degrees", 0)
        try:
            rotation_degrees = int(rotation_raw)
        except Exception:
            rotation_degrees = 0

        frame_bgr = rotate_frame_by_degrees(frame_bgr, rotation_degrees)
        self.latest_client_frame = frame_bgr
        self.latest_client_frame_at_monotonic = time.monotonic()

        if not self.client_source_announced:
            self.client_source_announced = True
            await self._send_json(
                {
                    "type": "status",
                    "level": "info",
                    "message": "Android camera stream connected",
                }
            )

    async def _start_session(self, payload: dict[str, Any]) -> None:
        template_name = str(payload.get("template_name", "template")).strip() or "template"

        raw_image = str(payload.get("reference_image_base64", "")).strip()
        reference_image_bgr = decode_base64_image(raw_image)
        if reference_image_bgr is None:
            await self._send_json(
                {
                    "type": "error",
                    "message": "reference_image_base64 is required and must be decodable",
                }
            )
            return

        reference_pose = await asyncio.to_thread(self.pose_estimator.detect_image, reference_image_bgr)
        if reference_pose is None:
            await self._send_json(
                {
                    "type": "error",
                    "message": "No pose detected in the reference image",
                }
            )
            return

        duration_sec = int(payload.get("countdown_sec", self.config.session_seconds) or self.config.session_seconds)
        duration_sec = max(1, min(15, duration_sec))

        now = time.monotonic()
        self.active_session = ActiveSession(
            template_name=template_name,
            started_at=now,
            deadline_at=now + duration_sec,
            reference_image_base64=normalize_base64_image(raw_image),
            reference_pose=reference_pose,
        )

        await self._send_json(
            {
                "type": "session_started",
                "template_name": template_name,
                "countdown_sec": duration_sec,
                "deadline_timestamp_ms": int((time.time() + duration_sec) * 1000),
            }
        )

    async def _finish_session(self) -> None:
        session = self.active_session
        if session is None:
            return

        session.result_sent = True
        self.active_session = None

        best_score, best_frame, metrics, best_landmarks = await asyncio.to_thread(
            postprocess_best_from_sequence,
            reference_pose=session.reference_pose,
            poses_seq=session.poses_seq,
            frames_base64_seq=session.frames_base64_seq,
            ts_ms_seq=session.ts_ms_seq,
            scorer=self.scorer,
            fps=int(self.config.fps),
            using_world=bool(self.config.prefer_world_landmarks),
        )

        feedback_text, feedback_model = await asyncio.to_thread(
            self.feedback_generator.generate,
            reference_image_base64=session.reference_image_base64,
            candidate_image_base64=best_frame,
            metrics=metrics,
        )

        await self._send_json(
            {
                "type": "result",
                "template_name": session.template_name,
                "best_score": best_score,
                "best_frame_jpeg_base64": best_frame,
                "reference_image_base64": session.reference_image_base64,
                "feedback": feedback_text,
                "feedback_model": feedback_model,
                "metrics": metrics,
                "landmarks": best_landmarks,
            }
        )

    async def _send_json(self, payload: dict[str, Any]) -> None:
        if self.writer.is_closing():
            return
        self.writer.write((json.dumps(payload, separators=(",", ":"), ensure_ascii=False) + "\n").encode("utf-8"))
        await self.writer.drain()


def normalize_base64_image(raw: str) -> str:
    data = raw.strip()
    if data.startswith("data:image"):
        _, _, payload = data.partition(",")
        return payload
    return data


def decode_base64_image(raw: str) -> np.ndarray | None:
    payload = normalize_base64_image(raw)
    if not payload:
        return None
    try:
        img_bytes = base64.b64decode(payload)
    except Exception:
        return None
    np_data = np.frombuffer(img_bytes, dtype=np.uint8)
    image = cv2.imdecode(np_data, cv2.IMREAD_COLOR)
    if image is None:
        return None
    return image


def rotate_frame_by_degrees(frame_bgr: np.ndarray, rotation_degrees: int) -> np.ndarray:
    normalized = int(rotation_degrees) % 360
    if normalized == 90:
        return cv2.rotate(frame_bgr, cv2.ROTATE_90_CLOCKWISE)
    if normalized == 180:
        return cv2.rotate(frame_bgr, cv2.ROTATE_180)
    if normalized == 270:
        return cv2.rotate(frame_bgr, cv2.ROTATE_90_COUNTERCLOCKWISE)
    return frame_bgr


def encode_frame_to_base64(frame_bgr: np.ndarray, jpeg_quality: int) -> str:
    ok, enc = cv2.imencode(
        ".jpg",
        frame_bgr,
        [cv2.IMWRITE_JPEG_QUALITY, int(max(10, min(95, jpeg_quality)))],
    )
    if not ok:
        return ""
    return base64.b64encode(enc.tobytes()).decode("ascii")


def pose_to_json_points(pose: PosePacket | None) -> list[dict[str, float]]:
    if pose is None:
        return []
    points: list[dict[str, float]] = []
    for idx in range(33):
        p = pose.points[idx]
        points.append(
            {
                "x": float(p[0]),
                "y": float(p[1]),
                "z": float(p[2]),
                "visibility": float(pose.vis[idx]),
                "presence": float(pose.pres[idx]),
            }
        )
    return points


def postprocess_best_from_sequence(
    *,
    reference_pose: PosePacket,
    poses_seq: list[PosePacket | None],
    frames_base64_seq: list[str],
    ts_ms_seq: list[int] | None,
    scorer: PoseScorer,
    fps: int,
    using_world: bool,
) -> tuple[float, str, dict[str, Any], list[dict[str, float]]]:
    if not poses_seq or not frames_base64_seq:
        metrics = {"score": 0.0, "reliable": False, "reason": "No frames buffered"}
        return 0.0, "", metrics, []

    total = min(len(poses_seq), len(frames_base64_seq))
    poses_seq = poses_seq[:total]
    frames_base64_seq = frames_base64_seq[:total]
    timestamps = (ts_ms_seq or [])[:total]

    smoothed_seq = stabilize_pose_sequence_rts(
        poses_seq=poses_seq,
        fps=max(1, int(fps)),
        min_conf=scorer.config.conf_threshold,
        r_base=1e-4,
        accel_var=3.0,
        reset_gap_frames=max(2, int(0.5 * max(int(fps), 1))),
    )

    scores = np.full((total,), np.nan, dtype=np.float32)
    reliables = np.zeros((total,), dtype=bool)
    results: list[ScoreResult | None] = [None] * total
    for idx, pose in enumerate(smoothed_seq):
        if pose is None:
            continue
        result = scorer.score(reference_pose, pose)
        results[idx] = result
        if result.final is None:
            continue
        scores[idx] = float(result.final)
        reliables[idx] = bool(result.reliable)

    vel = compute_motion_energy(
        smoothed_seq,
        conf_threshold=scorer.config.conf_threshold,
    )

    picked = pick_representative_index(
        scores=scores,
        reliables=reliables,
        vel=vel,
        fps=max(1, int(fps)),
        stable_vel_quantile=0.35,
        top_score_delta=12.0,
        min_stable_seconds=0.8,
        representative_percentile=80.0,
    )
    if picked is None:
        metrics = {"score": 0.0, "reliable": False, "reason": "No reliable frame found (postprocess)"}
        return 0.0, "", metrics, []

    best_idx, temporal_debug = picked
    picked_result = results[best_idx]
    if picked_result is None or picked_result.final is None:
        metrics = {"score": 0.0, "reliable": False, "reason": "Selected frame has no valid score"}
        return 0.0, "", metrics, []

    best_score = float(picked_result.final)
    best_frame = frames_base64_seq[best_idx] or ""
    metrics = picked_result.as_metrics(using_world=using_world)
    if len(timestamps) == total and best_idx < len(timestamps):
        temporal_debug["picked_timestamp_ms"] = int(timestamps[best_idx])
        if "segment_start" in temporal_debug and "segment_end" in temporal_debug:
            start_idx = int(temporal_debug["segment_start"])
            end_idx = int(temporal_debug["segment_end"]) - 1
            if 0 <= start_idx < len(timestamps):
                temporal_debug["segment_start_ms"] = int(timestamps[start_idx])
            if 0 <= end_idx < len(timestamps):
                temporal_debug["segment_end_ms"] = int(timestamps[end_idx])
    metrics["temporal"] = temporal_debug

    raw_pose = poses_seq[best_idx]
    if raw_pose is not None:
        best_landmarks = pose_to_json_points(raw_pose)
    else:
        best_landmarks = pose_to_json_points(smoothed_seq[best_idx])
    return best_score, best_frame, metrics, best_landmarks


def stabilize_pose_sequence_rts(
    poses_seq: list[PosePacket | None],
    *,
    fps: int,
    min_conf: float,
    r_base: float,
    accel_var: float,
    reset_gap_frames: int,
) -> list[PosePacket | None]:
    total = len(poses_seq)
    if total == 0:
        return []

    dt = 1.0 / max(float(fps), 1.0)
    points = np.full((total, 33, 3), np.nan, dtype=np.float32)
    vis = np.zeros((total, 33), dtype=np.float32)
    pres = np.zeros((total, 33), dtype=np.float32)

    for t, pose in enumerate(poses_seq):
        if pose is None:
            continue
        points[t] = pose.points.astype(np.float32, copy=False)
        vis[t] = pose.vis.astype(np.float32, copy=False)
        pres[t] = pose.pres.astype(np.float32, copy=False)

    conf = np.clip(np.minimum(vis, pres), 0.0, 1.0).astype(np.float32)
    out_points = np.full_like(points, np.nan, dtype=np.float32)
    for joint_idx in range(33):
        conf_joint = conf[:, joint_idx].astype(np.float64, copy=False)
        for axis_idx in range(3):
            z_axis = points[:, joint_idx, axis_idx].astype(np.float64, copy=False)
            out_points[:, joint_idx, axis_idx] = kalman_rts_smooth_1d(
                z=z_axis,
                w=conf_joint,
                dt=dt,
                r_base=float(r_base),
                accel_var=float(accel_var),
                min_w=float(min_conf),
                reset_gap_frames=int(reset_gap_frames),
            ).astype(np.float32, copy=False)

    out: list[PosePacket | None] = []
    for t, raw_pose in enumerate(poses_seq):
        if raw_pose is None:
            out.append(None)
            continue
        out.append(PosePacket(points=out_points[t], vis=raw_pose.vis, pres=raw_pose.pres))
    return out


def kalman_rts_smooth_1d(
    z: np.ndarray,
    w: np.ndarray,
    *,
    dt: float,
    r_base: float,
    accel_var: float,
    min_w: float,
    reset_gap_frames: int,
) -> np.ndarray:
    total = int(z.shape[0])
    if total == 0:
        return z.astype(np.float32, copy=True)

    z = np.asarray(z, dtype=np.float64).reshape(-1)
    w = np.asarray(w, dtype=np.float64).reshape(-1)

    valid = np.isfinite(z) & (w >= min_w)
    if not bool(np.any(valid)):
        return z.astype(np.float32, copy=True)

    first_idx = int(np.argmax(valid))
    init_val = float(z[first_idx])

    f = np.array([[1.0, float(dt)], [0.0, 1.0]], dtype=np.float64)
    h = np.array([1.0, 0.0], dtype=np.float64)
    eye2 = np.eye(2, dtype=np.float64)

    dt2 = float(dt) * float(dt)
    q = float(accel_var) * np.array(
        [
            [dt2 * dt2 / 4.0, dt2 * float(dt) / 2.0],
            [dt2 * float(dt) / 2.0, dt2],
        ],
        dtype=np.float64,
    )

    x_f = np.zeros((total, 2), dtype=np.float64)
    p_f = np.zeros((total, 2, 2), dtype=np.float64)
    x_p = np.zeros((total, 2), dtype=np.float64)
    p_p = np.zeros((total, 2, 2), dtype=np.float64)

    x = np.array([init_val, 0.0], dtype=np.float64)
    p = np.eye(2, dtype=np.float64)
    gap = 0

    for k in range(total):
        if k == 0:
            x_pred = x
            p_pred = p
        else:
            x_pred = f @ x
            p_pred = f @ p @ f.T + q

        x_p[k] = x_pred
        p_p[k] = p_pred

        zk = float(z[k]) if np.isfinite(z[k]) else float("nan")
        wk = float(w[k]) if np.isfinite(w[k]) else 0.0
        meas_ok = wk >= min_w and np.isfinite(zk)

        if meas_ok:
            if gap >= int(reset_gap_frames):
                x_pred = np.array([zk, 0.0], dtype=np.float64)
                p_pred = np.eye(2, dtype=np.float64)
            gap = 0

            r = float(r_base / max(wk * wk, 1e-6))
            y = zk - float(h @ x_pred)
            s = float(h @ p_pred @ h) + r
            if s < 1e-12:
                x = x_pred
                p = p_pred
            else:
                k_gain = (p_pred @ h) / s
                x = x_pred + k_gain * y
                p = (eye2 - np.outer(k_gain, h)) @ p_pred
        else:
            gap += 1
            x = x_pred
            p = p_pred

        x_f[k] = x
        p_f[k] = p

    x_s = np.zeros_like(x_f)
    p_s = np.zeros_like(p_f)
    x_s[total - 1] = x_f[total - 1]
    p_s[total - 1] = p_f[total - 1]

    for k in range(total - 2, -1, -1):
        p_pred_next = p_p[k + 1]
        det = float(p_pred_next[0, 0] * p_pred_next[1, 1] - p_pred_next[0, 1] * p_pred_next[1, 0])
        if abs(det) < 1e-12:
            x_s[k] = x_f[k]
            p_s[k] = p_f[k]
            continue
        inv = (1.0 / det) * np.array(
            [
                [p_pred_next[1, 1], -p_pred_next[0, 1]],
                [-p_pred_next[1, 0], p_pred_next[0, 0]],
            ],
            dtype=np.float64,
        )
        c = p_f[k] @ f.T @ inv
        x_s[k] = x_f[k] + c @ (x_s[k + 1] - x_p[k + 1])
        p_s[k] = p_f[k] + c @ (p_s[k + 1] - p_p[k + 1]) @ c.T

    return x_s[:, 0].astype(np.float32, copy=False)


def compute_motion_energy(
    poses_seq: list[PosePacket | None],
    *,
    conf_threshold: float,
) -> np.ndarray:
    total = len(poses_seq)
    vel = np.full((total,), np.nan, dtype=np.float32)
    if total <= 1:
        return vel

    for idx in range(1, total):
        prev_pose = poses_seq[idx - 1]
        cur_pose = poses_seq[idx]
        if prev_pose is None or cur_pose is None:
            continue

        prev_norm = center_and_scale(prev_pose.points)
        cur_norm = center_and_scale(cur_pose.points)
        prev_w = np.clip(np.minimum(prev_pose.vis, prev_pose.pres), 0.0, 1.0)
        cur_w = np.clip(np.minimum(cur_pose.vis, cur_pose.pres), 0.0, 1.0)
        weight = np.minimum(prev_w, cur_w)[POSE_SELECTED_INDICES]
        valid = weight >= conf_threshold
        if int(np.count_nonzero(valid)) < 6:
            continue

        delta = cur_norm[POSE_SELECTED_INDICES][valid] - prev_norm[POSE_SELECTED_INDICES][valid]
        vel[idx] = float(np.mean(np.linalg.norm(delta, axis=1)))
    return vel


def pick_representative_index(
    *,
    scores: np.ndarray,
    reliables: np.ndarray,
    vel: np.ndarray,
    fps: int,
    stable_vel_quantile: float,
    top_score_delta: float,
    min_stable_seconds: float,
    representative_percentile: float,
) -> tuple[int, dict[str, Any]] | None:
    total = int(scores.shape[0])
    valid = np.isfinite(scores) & reliables
    if int(np.count_nonzero(valid)) < 3:
        return None

    valid_scores = scores[valid]
    s_max = float(np.max(valid_scores))
    score_threshold = float(max(0.0, s_max - float(top_score_delta)))

    valid_vel = vel[np.isfinite(vel) & valid]
    if valid_vel.size > 0:
        vel_threshold = float(np.quantile(valid_vel, float(stable_vel_quantile)))
    else:
        vel_threshold = float("inf")

    stable = valid & (scores >= score_threshold) & np.isfinite(vel) & (vel <= vel_threshold)
    min_len = max(3, int(round(float(min_stable_seconds) * float(max(fps, 1)))))

    runs: list[tuple[int, int]] = []
    idx = 0
    while idx < total:
        if not stable[idx]:
            idx += 1
            continue
        end = idx + 1
        while end < total and stable[end]:
            end += 1
        if (end - idx) >= min_len:
            runs.append((idx, end))
        idx = end

    if not runs:
        candidate_idxs = np.where(valid)[0]
        k = min(7, candidate_idxs.size)
        top = candidate_idxs[np.argsort(scores[candidate_idxs])[-k:]]
        target = float(np.percentile(scores[top], float(representative_percentile)))
        pick = int(top[np.argmin(np.abs(scores[top] - target))])
        return pick, {
            "mode": "fallback_topk",
            "s_max": s_max,
            "score_thr": score_threshold,
            "vel_thr": vel_threshold,
            "picked_index": pick,
            "picked_score": float(scores[pick]),
            "topk": int(k),
        }

    best_run: tuple[int, int] | None = None
    best_med = -1.0
    best_len = -1
    for start, end in runs:
        run_scores = scores[start:end]
        finite_scores = run_scores[np.isfinite(run_scores)]
        if finite_scores.size == 0:
            continue
        med = float(np.median(finite_scores))
        run_len = int(end - start)
        if med > best_med or (med == best_med and run_len > best_len):
            best_med = med
            best_len = run_len
            best_run = (start, end)

    if best_run is None:
        return None

    start, end = best_run
    seg = np.arange(start, end, dtype=np.int32)
    seg_scores = scores[seg]
    target = float(np.percentile(seg_scores, float(representative_percentile)))
    pick = int(seg[np.argmin(np.abs(seg_scores - target))])

    return pick, {
        "mode": "stable_segment",
        "segment_start": int(start),
        "segment_end": int(end),
        "segment_len": int(end - start),
        "s_max": s_max,
        "score_thr": score_threshold,
        "vel_thr": vel_threshold,
        "representative_percentile": float(representative_percentile),
        "picked_index": pick,
        "picked_score": float(scores[pick]),
        "segment_score_median": float(np.median(seg_scores)),
        "segment_score_max": float(np.max(seg_scores)),
    }


def swap_left_right(values: np.ndarray) -> np.ndarray:
    out = values.copy()
    for left_idx, right_idx in LEFT_RIGHT_SWAP_PAIRS:
        out[left_idx] = values[right_idx]
        out[right_idx] = values[left_idx]
    return out


def mirror_and_swap_points(points: np.ndarray) -> np.ndarray:
    mirrored = points.copy()
    mirrored[:, 0] *= -1.0
    return swap_left_right(mirrored)


def center_and_scale(points_33: np.ndarray) -> np.ndarray:
    if points_33.shape != (33, 3):
        raise ValueError(f"Expected (33,3), got {points_33.shape}")

    left_hip = points_33[LEFT_HIP]
    right_hip = points_33[RIGHT_HIP]
    left_shoulder = points_33[LEFT_SHOULDER]
    right_shoulder = points_33[RIGHT_SHOULDER]

    hip_mid = 0.5 * (left_hip + right_hip)
    shoulder_mid = 0.5 * (left_shoulder + right_shoulder)
    centered = points_33 - hip_mid[None, :]

    torso_len = float(np.linalg.norm(shoulder_mid - hip_mid))
    if torso_len < 1e-6:
        fallback_pairs = [
            (LEFT_SHOULDER, LEFT_ELBOW),
            (LEFT_ELBOW, LEFT_WRIST),
            (RIGHT_SHOULDER, RIGHT_ELBOW),
            (RIGHT_ELBOW, RIGHT_WRIST),
            (LEFT_HIP, LEFT_KNEE),
            (LEFT_KNEE, LEFT_ANKLE),
            (RIGHT_HIP, RIGHT_KNEE),
            (RIGHT_KNEE, RIGHT_ANKLE),
            (LEFT_HIP, RIGHT_HIP),
            (LEFT_SHOULDER, RIGHT_SHOULDER),
        ]
        lengths: list[float] = []
        for i0, i1 in fallback_pairs:
            length = float(np.linalg.norm(points_33[i0] - points_33[i1]))
            if length > 1e-6:
                lengths.append(length)
        torso_len = float(np.mean(lengths)) if lengths else 1.0

    if torso_len < 1e-6:
        torso_len = 1.0
    return centered / torso_len


def procrustes_align(
    ref_points: np.ndarray,
    cur_points: np.ndarray,
    *,
    weights: np.ndarray,
    device: str,
) -> tuple[np.ndarray, float, np.ndarray, float, np.ndarray]:
    if ref_points.shape != cur_points.shape:
        raise ValueError("ref_points and cur_points shape mismatch")

    if ref_points.size == 0:
        return cur_points.copy(), float("inf"), np.eye(3, dtype=np.float32), 1.0, np.zeros(3, dtype=np.float32)

    if device == "cuda" and torch is not None and torch.cuda.is_available():
        try:
            return procrustes_align_torch(ref_points, cur_points, weights)
        except Exception as exc:  # noqa: BLE001
            LOGGER.warning("torch procrustes failed, fallback to numpy: %s", exc)

    return procrustes_align_numpy(ref_points, cur_points, weights)


def procrustes_align_numpy(
    ref_points: np.ndarray,
    cur_points: np.ndarray,
    weights: np.ndarray,
) -> tuple[np.ndarray, float, np.ndarray, float, np.ndarray]:
    n = ref_points.shape[0]

    w = np.asarray(weights, dtype=np.float64).reshape(-1)
    if w.shape[0] != n:
        raise ValueError("weights length mismatch")
    w = np.clip(w, 0.0, None)

    valid = (
        (w > 0.0)
        & np.all(np.isfinite(ref_points), axis=1)
        & np.all(np.isfinite(cur_points), axis=1)
    )
    if int(np.count_nonzero(valid)) < 3:
        return cur_points.copy(), float("inf"), np.eye(3, dtype=np.float32), 1.0, np.zeros(3, dtype=np.float32)

    a = ref_points[valid].astype(np.float64, copy=False)
    b = cur_points[valid].astype(np.float64, copy=False)
    wv = w[valid]
    w_sum = float(np.sum(wv))
    if w_sum <= 1e-12:
        return cur_points.copy(), float("inf"), np.eye(3, dtype=np.float32), 1.0, np.zeros(3, dtype=np.float32)
    wv /= w_sum

    mu_a = np.sum(a * wv[:, None], axis=0)
    mu_b = np.sum(b * wv[:, None], axis=0)

    xa = a - mu_a
    xb = b - mu_b

    xbw = xb * np.sqrt(wv[:, None])
    xaw = xa * np.sqrt(wv[:, None])
    h = xbw.T @ xaw

    u, svals, vt = np.linalg.svd(h)
    r = vt.T @ u.T
    if np.linalg.det(r) < 0:
        vt[-1, :] *= -1.0
        r = vt.T @ u.T

    denom = float(np.sum(wv * np.sum(xb * xb, axis=1)))
    scale = float(np.sum(svals) / max(denom, 1e-12))
    t = mu_a - scale * (mu_b @ r)

    aligned = scale * (cur_points @ r) + t
    aligned_valid = scale * (b @ r) + t
    err_vec = np.linalg.norm(a - aligned_valid, axis=1)
    err = float(np.sum(wv * err_vec))

    return aligned.astype(np.float32), err, r.astype(np.float32), scale, t.astype(np.float32)


def procrustes_align_torch(
    ref_points: np.ndarray,
    cur_points: np.ndarray,
    weights: np.ndarray,
) -> tuple[np.ndarray, float, np.ndarray, float, np.ndarray]:
    device = torch.device("cuda")

    a_all = torch.as_tensor(ref_points, dtype=torch.float64, device=device)
    b_all = torch.as_tensor(cur_points, dtype=torch.float64, device=device)
    w_all = torch.as_tensor(weights, dtype=torch.float64, device=device)

    valid = (
        (w_all > 0.0)
        & torch.isfinite(a_all).all(dim=1)
        & torch.isfinite(b_all).all(dim=1)
    )
    if int(valid.sum().item()) < 3:
        aligned = b_all.detach().cpu().numpy().astype(np.float32)
        return aligned, float("inf"), np.eye(3, dtype=np.float32), 1.0, np.zeros(3, dtype=np.float32)

    a = a_all[valid]
    b = b_all[valid]
    w = torch.clamp(w_all[valid], min=0.0)

    w_sum = w.sum()
    if float(w_sum.item()) <= 1e-12:
        aligned = b_all.detach().cpu().numpy().astype(np.float32)
        return aligned, float("inf"), np.eye(3, dtype=np.float32), 1.0, np.zeros(3, dtype=np.float32)

    w = w / w_sum

    mu_a = (a * w[:, None]).sum(dim=0)
    mu_b = (b * w[:, None]).sum(dim=0)

    xa = a - mu_a
    xb = b - mu_b

    h = (xb * torch.sqrt(w[:, None])).transpose(0, 1) @ (xa * torch.sqrt(w[:, None]))

    u, svals, vh = torch.linalg.svd(h)
    r = vh.transpose(0, 1) @ u.transpose(0, 1)
    if torch.linalg.det(r) < 0:
        vh[-1, :] *= -1.0
        r = vh.transpose(0, 1) @ u.transpose(0, 1)

    denom = (w * (xb * xb).sum(dim=1)).sum()
    scale = svals.sum() / torch.clamp(denom, min=1e-12)
    t = mu_a - scale * (mu_b @ r)

    aligned_all = scale * (b_all @ r) + t
    aligned_valid = scale * (b @ r) + t

    err_vec = torch.linalg.norm(a - aligned_valid, dim=1)
    err = float((w * err_vec).sum().item())

    return (
        aligned_all.detach().cpu().numpy().astype(np.float32),
        err,
        r.detach().cpu().numpy().astype(np.float32),
        float(scale.item()),
        t.detach().cpu().numpy().astype(np.float32),
    )


def compute_angle_score(
    *,
    ref_points: np.ndarray,
    cur_points: np.ndarray,
    joint_weights: np.ndarray,
    conf_threshold: float,
    sigma_angle: float,
) -> tuple[float | None, float | None, int, dict[str, float]]:
    diffs: list[float] = []
    ws: list[float] = []
    angle_map: dict[str, float] = {}

    for name, i0, i1, i2 in ANGLE_TRIPLETS:
        w = float(min(joint_weights[i0], joint_weights[i1], joint_weights[i2]))
        if w < conf_threshold:
            continue
        ref_angle = angle_deg(ref_points[i0], ref_points[i1], ref_points[i2])
        cur_angle = angle_deg(cur_points[i0], cur_points[i1], cur_points[i2])
        if ref_angle is None or cur_angle is None:
            continue
        diff = wrapped_angle_diff(ref_angle, cur_angle)
        diffs.append(diff)
        ws.append(w)
        angle_map[name] = float(diff)

    if not diffs:
        return None, None, 0, angle_map

    w_arr = np.asarray(ws, dtype=np.float64)
    d_arr = np.asarray(diffs, dtype=np.float64)
    w_arr /= max(float(np.sum(w_arr)), 1e-12)

    angle_err = float(np.sum(w_arr * d_arr))
    angle_score = float(np.exp(-angle_err / max(sigma_angle, 1e-6)))
    return angle_err, angle_score, len(diffs), angle_map


def compute_bone_score(
    *,
    ref_points: np.ndarray,
    cur_points: np.ndarray,
    joint_weights: np.ndarray,
    conf_threshold: float,
) -> tuple[float | None, int]:
    sims: list[float] = []
    ws: list[float] = []

    for _, i0, i1 in BONE_DEFS:
        w = float(min(joint_weights[i0], joint_weights[i1]))
        if w < conf_threshold:
            continue
        u_ref = unit_vector(ref_points[i1] - ref_points[i0])
        u_cur = unit_vector(cur_points[i1] - cur_points[i0])
        if u_ref is None or u_cur is None:
            continue
        cos_sim = float(np.dot(u_ref, u_cur))
        cos_sim = max(-1.0, min(1.0, cos_sim))
        sims.append(0.5 * (cos_sim + 1.0))
        ws.append(w)

    torso_w = float(
        min(
            joint_weights[LEFT_SHOULDER],
            joint_weights[RIGHT_SHOULDER],
            joint_weights[LEFT_HIP],
            joint_weights[RIGHT_HIP],
        )
    )
    if torso_w >= conf_threshold:
        ref_sh_mid = 0.5 * (ref_points[LEFT_SHOULDER] + ref_points[RIGHT_SHOULDER])
        ref_hip_mid = 0.5 * (ref_points[LEFT_HIP] + ref_points[RIGHT_HIP])
        cur_sh_mid = 0.5 * (cur_points[LEFT_SHOULDER] + cur_points[RIGHT_SHOULDER])
        cur_hip_mid = 0.5 * (cur_points[LEFT_HIP] + cur_points[RIGHT_HIP])

        u_ref_torso = unit_vector(ref_sh_mid - ref_hip_mid)
        u_cur_torso = unit_vector(cur_sh_mid - cur_hip_mid)
        if u_ref_torso is not None and u_cur_torso is not None:
            cos_t = float(np.dot(u_ref_torso, u_cur_torso))
            cos_t = max(-1.0, min(1.0, cos_t))
            sims.append(0.5 * (cos_t + 1.0))
            ws.append(torso_w)

    if not sims:
        return None, 0

    w_arr = np.asarray(ws, dtype=np.float64)
    s_arr = np.asarray(sims, dtype=np.float64)
    w_arr /= max(float(np.sum(w_arr)), 1e-12)
    return float(np.sum(w_arr * s_arr)), len(sims)


def angle_deg(a: np.ndarray, b: np.ndarray, c: np.ndarray) -> float | None:
    v1 = a - b
    v2 = c - b
    n1 = float(np.linalg.norm(v1))
    n2 = float(np.linalg.norm(v2))
    if n1 < 1e-8 or n2 < 1e-8:
        return None
    cos_theta = float(np.dot(v1, v2) / (n1 * n2))
    cos_theta = max(-1.0, min(1.0, cos_theta))
    return float(np.degrees(np.arccos(cos_theta)))


def wrapped_angle_diff(a: float, b: float) -> float:
    diff = abs(a - b)
    return min(diff, 360.0 - diff)


def unit_vector(v: np.ndarray) -> np.ndarray | None:
    n = float(np.linalg.norm(v))
    if n < 1e-8:
        return None
    return v / n


def parse_args() -> ServerConfig:
    parser = argparse.ArgumentParser(description="AI BOX stand-hold server")
    parser.add_argument("--host", default="0.0.0.0")
    parser.add_argument("--port", type=int, default=8091)

    parser.add_argument(
        "--camera-mode",
        choices=["auto", "webcam", "hikvision", "client"],
        default="auto",
        help=(
            "auto: use Android client frames if available, otherwise hikvision/webcam. "
            "webcam: use video-source only, hikvision: use rtsp/ip only, client: Android frames only"
        ),
    )
    parser.add_argument(
        "--video-source",
        default="0",
        help="OpenCV source for webcam/file/rtsp. Example: 0, 1, /path/video.mp4",
    )

    parser.add_argument("--hikvision-rtsp", default=None, help="Full RTSP URL")
    parser.add_argument("--hikvision-ip", default=None, help="Hikvision camera IP")
    parser.add_argument("--hikvision-password", default="aa123456")
    parser.add_argument("--hikvision-camera-type", choices=["hk", "dh"], default="hk")

    parser.add_argument("--fps", type=int, default=12)
    parser.add_argument("--jpeg-quality", type=int, default=80)
    parser.add_argument("--client-frame-timeout-sec", type=float, default=1.0)
    parser.add_argument("--session-seconds", type=int, default=5)

    parser.add_argument(
        "--prefer-world-landmarks",
        action="store_true",
        help="Use world landmarks if MediaPipe provides them",
    )
    parser.add_argument(
        "--scoring-device",
        choices=["auto", "cpu", "cuda"],
        default="auto",
        help="Score calculation device. Pose extraction itself uses MediaPipe CPU path.",
    )
    parser.add_argument("--send-landmarks", action="store_true")

    parser.add_argument("--allow-openai-feedback", action="store_true")
    parser.add_argument("--openai-model", default="gpt-4o-mini")
    parser.add_argument("--openai-timeout-sec", type=float, default=45.0)

    args = parser.parse_args()

    return ServerConfig(
        host=args.host,
        port=args.port,
        camera_mode=args.camera_mode,
        video_source=str(args.video_source),
        hikvision_rtsp=args.hikvision_rtsp,
        hikvision_ip=args.hikvision_ip,
        hikvision_password=str(args.hikvision_password),
        hikvision_camera_type=args.hikvision_camera_type,
        fps=max(1, int(args.fps)),
        jpeg_quality=max(10, min(95, int(args.jpeg_quality))),
        session_seconds=max(1, min(15, int(args.session_seconds))),
        prefer_world_landmarks=bool(args.prefer_world_landmarks),
        scoring_device=args.scoring_device,
        send_landmarks=bool(args.send_landmarks),
        client_frame_timeout_sec=max(0.2, float(args.client_frame_timeout_sec)),
        allow_openai_feedback=bool(args.allow_openai_feedback),
        openai_model=str(args.openai_model),
        openai_timeout_sec=max(5.0, float(args.openai_timeout_sec)),
    )


def setup_logging() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )


async def run_server(config: ServerConfig) -> None:
    async def _handle(reader: asyncio.StreamReader, writer: asyncio.StreamWriter) -> None:
        session = ClientSession(reader=reader, writer=writer, config=config)
        await session.run()

    server = await asyncio.start_server(
        _handle,
        host=config.host,
        port=config.port,
        limit=MAX_COMMAND_BYTES,
    )
    sockets = server.sockets or []
    for sock in sockets:
        LOGGER.info("listening on %s", sock.getsockname())

    async with server:
        await server.serve_forever()


def main() -> None:
    setup_logging()
    config = parse_args()
    LOGGER.info(
        "stand_hold server starting host=%s port=%d camera_mode=%s video_source=%s scoring_device=%s",
        config.host,
        config.port,
        config.camera_mode,
        config.video_source,
        config.scoring_device,
    )
    try:
        asyncio.run(run_server(config))
    except KeyboardInterrupt:
        LOGGER.info("server stopped")


if __name__ == "__main__":
    main()
