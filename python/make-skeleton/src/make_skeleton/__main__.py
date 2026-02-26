from __future__ import annotations

import argparse
import sys
from pathlib import Path
from typing import Sequence

from .pipeline import RunnerConfig, run_pipeline


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="make-skeleton",
        description=(
            "입력 동영상에서 MediaPipe Pose로 관절을 추적하고, "
            "스켈레톤/좌표 정보를 원본 영상에 오버레이합니다."
        ),
    )
    parser.add_argument(
        "--input",
        required=True,
        type=Path,
        help="입력 영상 파일 경로",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=None,
        help="출력 영상 파일 경로 (기본값: <입력파일명>_skeleton.mp4)",
    )
    parser.add_argument(
        "--landmarks-csv",
        type=Path,
        default=None,
        help="프레임별 랜드마크 값을 저장할 CSV 경로 (옵션)",
    )
    parser.add_argument(
        "--pose-task-model",
        type=Path,
        default=None,
        help="(옵션) mediapipe tasks backend에서 사용할 .task 모델 파일 경로",
    )
    parser.add_argument(
        "--model-complexity",
        type=int,
        default=1,
        choices=[0, 1, 2],
        help="MediaPipe Pose model_complexity (0, 1, 2)",
    )
    parser.add_argument(
        "--min-detection-confidence",
        type=float,
        default=0.5,
        help="최소 탐지 신뢰도 (기본 0.5)",
    )
    parser.add_argument(
        "--min-tracking-confidence",
        type=float,
        default=0.5,
        help="최소 추적 신뢰도 (기본 0.5)",
    )
    parser.add_argument(
        "--max-frames",
        type=int,
        default=None,
        help="처리할 최대 프레임 수 (디버깅용, 옵션)",
    )
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)

    config = RunnerConfig(
        input_path=args.input,
        output_path=args.output,
        landmarks_csv_path=args.landmarks_csv,
        pose_task_model_path=args.pose_task_model,
        model_complexity=args.model_complexity,
        min_detection_confidence=args.min_detection_confidence,
        min_tracking_confidence=args.min_tracking_confidence,
        max_frames=args.max_frames,
    )

    try:
        run_pipeline(config)
    except Exception as exc:  # noqa: BLE001
        print(f"[ERROR] {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
