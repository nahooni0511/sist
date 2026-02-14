export type MainTab = "home" | "timer" | "teams" | "scoreboard" | "sounds" | "templates";

export type SoundKey =
  | "whistle"
  | "shortBell"
  | "longBell"
  | "startSignal"
  | "stopSignal"
  | "clap"
  | "countdown"
  | "confirm";

export interface SettingsState {
  soundEnabled: boolean;
  masterVolume: number;
  keepAwake: boolean;
  darkMode: boolean;
  fullscreen: boolean;
  voiceCountdown: boolean;
  voiceCountdownLength: 3 | 5;
}

export interface RecentItem {
  id: string;
  type: "timer" | "scoreboard" | "template";
  label: string;
  payloadId: string;
  usedAt: number;
}

export interface TimerPreset {
  id: string;
  name: string;
  workSec: number;
  restSec: number;
  rounds: number;
  prepareSec: number;
  startSound: SoundKey;
  transitionSound: SoundKey;
  finishSound: SoundKey;
  lastFiveCountdown: boolean;
  builtIn?: boolean;
}

export type TimerMode = "idle" | "running" | "paused" | "completed";
export type TimerPhase = "prepare" | "work" | "rest" | "done";

export interface TimerState {
  selectedPresetId: string;
  workSec: number;
  restSec: number;
  rounds: number;
  prepareSec: number;
  mode: TimerMode;
  phase: TimerPhase;
  currentRound: number;
  phaseDurationSec: number;
  phaseStartedAt: number | null;
  remainingSec: number;
  elapsedSec: number;
  elapsedAnchorAt: number | null;
  elapsedAccumulatedSec: number;
  lastCountdownSpoken: number | null;
}

export interface StudentInput {
  id: string;
  name: string;
  gender?: "M" | "F";
  level?: number;
}

export interface TeamCard {
  id: string;
  name: string;
  color: string;
  members: StudentInput[];
}

export interface TeamHistoryEntry {
  id: string;
  createdAt: number;
  teams: string[][];
}

export interface ScoreboardPreset {
  id: string;
  name: string;
  teamCount: 2 | 3 | 4;
  defaultGameSec: number;
  setCount: number;
  builtIn?: boolean;
}

export interface ScoreboardTeam {
  id: string;
  name: string;
  color: string;
  score: number;
  fouls: number;
  timeouts: number;
  setWins: number;
}

export interface ScoreboardSnapshot {
  teams: ScoreboardTeam[];
  currentSet: number;
  gameTimerSec: number;
  gameTimerMode: "idle" | "running" | "paused";
  gameTimerStartedAt: number | null;
  gameTimerBaseSec: number;
}

export interface ScoreboardState {
  presetId: string;
  teams: ScoreboardTeam[];
  currentSet: number;
  setCount: number;
  gameTimerSec: number;
  gameTimerMode: "idle" | "running" | "paused";
  gameTimerStartedAt: number | null;
  gameTimerBaseSec: number;
  history: ScoreboardSnapshot[];
}

export interface TemplateStep {
  id: string;
  title: string;
  description: string;
  durationSec: number;
  targetTab: MainTab;
  timerConfig?: Partial<TimerPreset>;
}

export interface ClassTemplate {
  id: string;
  name: string;
  description: string;
  builtIn?: boolean;
  steps: TemplateStep[];
}

export interface TemplateRunnerState {
  mode: "idle" | "running" | "paused" | "completed";
  templateId: string | null;
  stepIndex: number;
  stepRemainingSec: number;
  stepBaseSec: number;
  stepStartedAt: number | null;
}

export interface PersistedState {
  settings: SettingsState;
  timerPresets: TimerPreset[];
  timer: TimerState;
  recentItems: RecentItem[];
  teamHistory: TeamHistoryEntry[];
  scoreboardPresets: ScoreboardPreset[];
  scoreboard: ScoreboardState;
  templates: ClassTemplate[];
  templateRunner: TemplateRunnerState;
}

export interface AppState extends PersistedState {
  hydrated: boolean;
  currentTab: MainTab;
  settingsOpen: boolean;
  soundQueue: SoundKey[];
}

export interface TimerTickResult {
  nextTimer: TimerState;
  sounds: SoundKey[];
  timerCompleted: boolean;
}
