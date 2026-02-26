from __future__ import annotations

import csv
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Any, TextIO

DEFAULT_TASK_MODEL_URL = (
    "https://storage.googleapis.com/mediapipe-models/pose_landmarker/"
    "pose_landmarker_full/float16/latest/pose_landmarker_full.task"
)


@dataclass(frozen=True)
class RunnerConfig:
    input_path: Path
    output_path: Path | None = None
    landmarks_csv_path: Path | None = None
    pose_task_model_path: Path | None = None
    model_complexity: int = 1
    min_detection_confidence: float = 0.5
    min_tracking_confidence: float = 0.5
    max_frames: int | None = None


def _ensure_dependencies() -> tuple[Any, Any]:
    try:
        import cv2  # type: ignore
    except Exception as exc:  # noqa: BLE001
        raise RuntimeError(
            "opencv-python이 설치되어 있지 않습니다. `pip install -e .`로 설치하세요."
        ) from exc

    try:
        import mediapipe as mp  # type: ignore
    except Exception as exc:  # noqa: BLE001
        raise RuntimeError(
            "mediapipe가 설치되어 있지 않습니다. `pip install -e .`로 설치하세요."
        ) from exc

    return cv2, mp


def _resolve_output_path(input_path: Path, output_path: Path | None) -> Path:
    if output_path is not None:
        return output_path
    return input_path.with_name(f"{input_path.stem}_skeleton.mp4")


def _draw_joint_panel(
    cv2: Any,
    frame: Any,
    landmarks: Any,
    pose_landmark: Any,
    frame_index: int,
    total_frames: int,
) -> None:
    tracked_joints = [
        ("NOSE", pose_landmark.NOSE.value),
        ("L_SHOULDER", pose_landmark.LEFT_SHOULDER.value),
        ("R_SHOULDER", pose_landmark.RIGHT_SHOULDER.value),
        ("L_ELBOW", pose_landmark.LEFT_ELBOW.value),
        ("R_ELBOW", pose_landmark.RIGHT_ELBOW.value),
        ("L_WRIST", pose_landmark.LEFT_WRIST.value),
        ("R_WRIST", pose_landmark.RIGHT_WRIST.value),
        ("L_HIP", pose_landmark.LEFT_HIP.value),
        ("R_HIP", pose_landmark.RIGHT_HIP.value),
        ("L_KNEE", pose_landmark.LEFT_KNEE.value),
        ("R_KNEE", pose_landmark.RIGHT_KNEE.value),
        ("L_ANKLE", pose_landmark.LEFT_ANKLE.value),
        ("R_ANKLE", pose_landmark.RIGHT_ANKLE.value),
    ]

    status = f"frame: {frame_index}/{total_frames}" if total_frames else f"frame: {frame_index}"
    lines = [status]

    h, w = frame.shape[:2]
    for name, idx in tracked_joints:
        lm = landmarks[idx]
        visibility = float(getattr(lm, "visibility", 0.0))
        lines.append(f"{name:<10} x:{lm.x:>6.3f} y:{lm.y:>6.3f} v:{visibility:>5.2f}")

        px = int(lm.x * w)
        py = int(lm.y * h)
        if 0 <= px < w and 0 <= py < h:
            cv2.circle(frame, (px, py), 4, (0, 255, 255), -1)
            cv2.putText(
                frame,
                name,
                (px + 6, py - 6),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.35,
                (0, 255, 255),
                1,
                cv2.LINE_AA,
            )

    panel_x = 12
    panel_y = 12
    line_height = 20
    panel_width = 420
    panel_height = 14 + (len(lines) * line_height)

    overlay = frame.copy()
    cv2.rectangle(
        overlay,
        (panel_x, panel_y),
        (panel_x + panel_width, panel_y + panel_height),
        (0, 0, 0),
        -1,
    )
    cv2.addWeighted(overlay, 0.45, frame, 0.55, 0, frame)

    for i, line in enumerate(lines):
        text_y = panel_y + 18 + (i * line_height)
        cv2.putText(
            frame,
            line,
            (panel_x + 8, text_y),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.5,
            (255, 255, 255),
            1,
            cv2.LINE_AA,
        )


def _open_csv_writer(path: Path | None) -> tuple[TextIO | None, csv.writer | None]:
    if path is None:
        return None, None
    path.parent.mkdir(parents=True, exist_ok=True)
    csv_file = path.open("w", newline="", encoding="utf-8")
    writer = csv.writer(csv_file)
    writer.writerow(["frame_index", "landmark_index", "x", "y", "z", "visibility"])
    return csv_file, writer


def _write_landmarks_csv(writer: csv.writer | None, frame_index: int, landmarks: Any) -> None:
    if writer is None:
        return
    for idx, lm in enumerate(landmarks):
        visibility = float(getattr(lm, "visibility", 0.0))
        writer.writerow(
            [
                frame_index,
                idx,
                f"{lm.x:.6f}",
                f"{lm.y:.6f}",
                f"{lm.z:.6f}",
                f"{visibility:.6f}",
            ]
        )


def _draw_connections(cv2: Any, frame: Any, landmarks: Any, connections: Any) -> None:
    h, w = frame.shape[:2]
    for conn in connections:
        start_idx = int(conn.start)
        end_idx = int(conn.end)
        start = landmarks[start_idx]
        end = landmarks[end_idx]

        sx = int(start.x * w)
        sy = int(start.y * h)
        ex = int(end.x * w)
        ey = int(end.y * h)

        if 0 <= sx < w and 0 <= sy < h and 0 <= ex < w and 0 <= ey < h:
            cv2.line(frame, (sx, sy), (ex, ey), (0, 255, 0), 2, cv2.LINE_AA)

    for lm in landmarks:
        px = int(lm.x * w)
        py = int(lm.y * h)
        if 0 <= px < w and 0 <= py < h:
            cv2.circle(frame, (px, py), 3, (0, 140, 255), -1)


def _ensure_pose_task_model(model_path: Path | None) -> Path:
    resolved = model_path
    if resolved is None:
        resolved = Path.home() / ".cache" / "make-skeleton" / "pose_landmarker_full.task"

    resolved = resolved.expanduser().resolve()
    if resolved.exists():
        return resolved

    resolved.parent.mkdir(parents=True, exist_ok=True)
    print(f"[INFO] downloading pose landmarker model: {resolved}")
    try:
        urllib.request.urlretrieve(DEFAULT_TASK_MODEL_URL, resolved)
    except Exception as exc:  # noqa: BLE001
        raise RuntimeError(
            "PoseLandmarker 모델 다운로드에 실패했습니다. "
            f"`--pose-task-model`로 직접 모델 경로를 지정하세요. ({exc})"
        ) from exc
    return resolved


class SolutionsPoseBackend:
    def __init__(self, mp: Any, config: RunnerConfig) -> None:
        self._pose_module = mp.solutions.pose
        self._drawing_utils = mp.solutions.drawing_utils
        self._drawing_styles = mp.solutions.drawing_styles
        self.pose_landmark_enum = self._pose_module.PoseLandmark
        self._pose = self._pose_module.Pose(
            static_image_mode=False,
            model_complexity=config.model_complexity,
            smooth_landmarks=True,
            enable_segmentation=False,
            min_detection_confidence=config.min_detection_confidence,
            min_tracking_confidence=config.min_tracking_confidence,
        )

    def annotate_frame(self, cv2: Any, frame: Any, frame_index: int) -> tuple[Any, Any | None]:
        _ = frame_index
        rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        results = self._pose.process(rgb_frame)
        annotated = frame.copy()
        if results.pose_landmarks:
            self._drawing_utils.draw_landmarks(
                annotated,
                results.pose_landmarks,
                self._pose_module.POSE_CONNECTIONS,
                landmark_drawing_spec=self._drawing_styles.get_default_pose_landmarks_style(),
            )
            return annotated, results.pose_landmarks.landmark
        return annotated, None

    def close(self) -> None:
        self._pose.close()


class TasksPoseBackend:
    def __init__(self, mp: Any, config: RunnerConfig, fps: float) -> None:
        from mediapipe.tasks import python as mp_tasks_python  # type: ignore
        from mediapipe.tasks.python import vision  # type: ignore
        from mediapipe.tasks.python.vision.pose_landmarker import (  # type: ignore
            PoseLandmark,
            PoseLandmarksConnections,
        )

        model_path = _ensure_pose_task_model(config.pose_task_model_path)
        options = vision.PoseLandmarkerOptions(
            base_options=mp_tasks_python.BaseOptions(model_asset_path=str(model_path)),
            running_mode=vision.RunningMode.VIDEO,
            num_poses=1,
            min_pose_detection_confidence=config.min_detection_confidence,
            min_pose_presence_confidence=config.min_detection_confidence,
            min_tracking_confidence=config.min_tracking_confidence,
        )

        self._mp = mp
        self._landmarker = vision.PoseLandmarker.create_from_options(options)
        self._connections = PoseLandmarksConnections.POSE_LANDMARKS
        self.pose_landmark_enum = PoseLandmark
        self._timestamp_step_ms = max(1, int(round(1000.0 / fps)))

    def annotate_frame(self, cv2: Any, frame: Any, frame_index: int) -> tuple[Any, Any | None]:
        rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        image = self._mp.Image(image_format=self._mp.ImageFormat.SRGB, data=rgb_frame)
        timestamp_ms = frame_index * self._timestamp_step_ms
        result = self._landmarker.detect_for_video(image, timestamp_ms)
        annotated = frame.copy()

        if result.pose_landmarks:
            landmarks = result.pose_landmarks[0]
            _draw_connections(cv2, annotated, landmarks, self._connections)
            return annotated, landmarks
        return annotated, None

    def close(self) -> None:
        self._landmarker.close()


def _create_backend(mp: Any, config: RunnerConfig, fps: float) -> Any:
    if hasattr(mp, "solutions") and hasattr(mp.solutions, "pose"):
        print("[INFO] backend: mediapipe.solutions.pose")
        return SolutionsPoseBackend(mp=mp, config=config)
    print("[INFO] backend: mediapipe.tasks.pose_landmarker")
    return TasksPoseBackend(mp=mp, config=config, fps=fps)


def run_pipeline(config: RunnerConfig) -> None:
    cv2, mp = _ensure_dependencies()

    input_path = config.input_path.expanduser().resolve()
    if not input_path.exists():
        raise FileNotFoundError(f"입력 영상 파일이 없습니다: {input_path}")

    output_path = _resolve_output_path(input_path, config.output_path)
    output_path = output_path.expanduser().resolve()
    output_path.parent.mkdir(parents=True, exist_ok=True)

    csv_path = config.landmarks_csv_path
    if csv_path is not None:
        csv_path = csv_path.expanduser().resolve()

    cap = cv2.VideoCapture(str(input_path))
    if not cap.isOpened():
        raise RuntimeError(f"영상 파일을 열 수 없습니다: {input_path}")

    writer = None
    csv_file, csv_writer = _open_csv_writer(csv_path)

    processed_frames = 0
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    fps = float(cap.get(cv2.CAP_PROP_FPS) or 0.0)
    if fps <= 1e-6:
        fps = 30.0

    backend = _create_backend(mp=mp, config=config, fps=fps)

    try:
        while True:
            ok, frame = cap.read()
            if not ok:
                break

            if writer is None:
                height, width = frame.shape[:2]
                fourcc = cv2.VideoWriter_fourcc(*"mp4v")
                writer = cv2.VideoWriter(str(output_path), fourcc, fps, (width, height))
                if not writer.isOpened():
                    raise RuntimeError(
                        f"출력 영상 파일을 열 수 없습니다. 코덱/경로를 확인하세요: {output_path}"
                    )

            current_frame_index = processed_frames + 1
            annotated, landmarks = backend.annotate_frame(cv2=cv2, frame=frame, frame_index=current_frame_index)

            if landmarks is not None:
                _draw_joint_panel(
                    cv2=cv2,
                    frame=annotated,
                    landmarks=landmarks,
                    pose_landmark=backend.pose_landmark_enum,
                    frame_index=current_frame_index,
                    total_frames=total_frames,
                )
                _write_landmarks_csv(
                    writer=csv_writer,
                    frame_index=current_frame_index,
                    landmarks=landmarks,
                )
            else:
                cv2.putText(
                    annotated,
                    f"frame: {current_frame_index}/{total_frames} | no pose",
                    (16, 30),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.75,
                    (0, 0, 255),
                    2,
                    cv2.LINE_AA,
                )

            writer.write(annotated)
            processed_frames += 1

            if processed_frames % 30 == 0:
                print(f"[INFO] processed {processed_frames} frames...")

            if config.max_frames is not None and processed_frames >= config.max_frames:
                break
    finally:
        cap.release()
        backend.close()
        if writer is not None:
            writer.release()
        if csv_file is not None:
            csv_file.close()

    print(f"[DONE] output video: {output_path}")
    if csv_path is not None:
        print(f"[DONE] landmarks csv: {csv_path}")
