import { SoundKey } from "../types/app";

export const SOUND_LABELS: Record<SoundKey, string> = {
  whistle: "호루라기",
  shortBell: "짧은 벨",
  longBell: "긴 벨",
  startSignal: "시작 신호",
  stopSignal: "정지 신호",
  clap: "박수",
  countdown: "카운트다운",
  confirm: "확인음",
};

export const SOUND_BUTTONS: Array<{ key: SoundKey; repeatable: boolean; accent: string; icon: string }> = [
  { key: "whistle", repeatable: true, accent: "#137fec", icon: "sports" },
  { key: "shortBell", repeatable: true, accent: "#f59e0b", icon: "notifications" },
  { key: "longBell", repeatable: true, accent: "#dc2626", icon: "notifications-active" },
  { key: "startSignal", repeatable: false, accent: "#16a34a", icon: "play-circle-filled" },
  { key: "stopSignal", repeatable: false, accent: "#dc2626", icon: "stop-circle" },
  { key: "clap", repeatable: true, accent: "#0891b2", icon: "front-hand" },
];
