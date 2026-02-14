import {
  AppState,
  ClassTemplate,
  MainTab,
  PersistedState,
  ScoreboardPreset,
  ScoreboardState,
  ScoreboardTeam,
  SettingsState,
  TemplateRunnerState,
  TimerPreset,
  TimerState,
} from "../types/app";

export const STORAGE_KEY = "pe-board/state/v1";

export const TAB_ITEMS: { key: MainTab; label: string; shortLabel: string }[] = [
  { key: "home", label: "홈", shortLabel: "홈" },
  { key: "timer", label: "타이머", shortLabel: "타이머" },
  { key: "teams", label: "팀/번호", shortLabel: "팀" },
  { key: "scoreboard", label: "점수판", shortLabel: "점수판" },
  { key: "sounds", label: "사운드", shortLabel: "사운드" },
  { key: "templates", label: "템플릿", shortLabel: "템플릿" },
];

export const TEAM_COLORS = ["#137fec", "#dc2626", "#16a34a", "#f59e0b", "#7c3aed", "#0891b2"];

export const DEFAULT_SETTINGS: SettingsState = {
  soundEnabled: true,
  masterVolume: 0.85,
  keepAwake: true,
  darkMode: true,
  fullscreen: true,
  voiceCountdown: true,
  voiceCountdownLength: 5,
};

export const DEFAULT_TIMER_PRESETS: TimerPreset[] = [
  {
    id: "timer-30",
    name: "30s x 6",
    workSec: 30,
    restSec: 15,
    rounds: 6,
    prepareSec: 3,
    startSound: "startSignal",
    transitionSound: "shortBell",
    finishSound: "longBell",
    lastFiveCountdown: true,
    builtIn: true,
  },
  {
    id: "timer-45",
    name: "45s x 6",
    workSec: 45,
    restSec: 15,
    rounds: 6,
    prepareSec: 3,
    startSound: "startSignal",
    transitionSound: "shortBell",
    finishSound: "longBell",
    lastFiveCountdown: true,
    builtIn: true,
  },
  {
    id: "timer-60",
    name: "60s x 6",
    workSec: 60,
    restSec: 20,
    rounds: 6,
    prepareSec: 3,
    startSound: "startSignal",
    transitionSound: "shortBell",
    finishSound: "longBell",
    lastFiveCountdown: true,
    builtIn: true,
  },
  {
    id: "timer-90",
    name: "90s x 6",
    workSec: 90,
    restSec: 30,
    rounds: 6,
    prepareSec: 3,
    startSound: "startSignal",
    transitionSound: "shortBell",
    finishSound: "longBell",
    lastFiveCountdown: false,
    builtIn: true,
  },
  {
    id: "timer-120",
    name: "120s x 6",
    workSec: 120,
    restSec: 30,
    rounds: 6,
    prepareSec: 3,
    startSound: "startSignal",
    transitionSound: "shortBell",
    finishSound: "longBell",
    lastFiveCountdown: false,
    builtIn: true,
  },
];

const baseTimerPreset = DEFAULT_TIMER_PRESETS[1];

export const DEFAULT_TIMER_STATE: TimerState = {
  selectedPresetId: baseTimerPreset.id,
  workSec: baseTimerPreset.workSec,
  restSec: baseTimerPreset.restSec,
  rounds: baseTimerPreset.rounds,
  prepareSec: baseTimerPreset.prepareSec,
  mode: "idle",
  phase: "prepare",
  currentRound: 1,
  phaseDurationSec: baseTimerPreset.prepareSec,
  phaseStartedAt: null,
  remainingSec: baseTimerPreset.prepareSec,
  elapsedSec: 0,
  elapsedAnchorAt: null,
  elapsedAccumulatedSec: 0,
  lastCountdownSpoken: null,
};

export const DEFAULT_SCOREBOARD_PRESETS: ScoreboardPreset[] = [
  { id: "dodgeball", name: "피구", teamCount: 2, defaultGameSec: 8 * 60, setCount: 3, builtIn: true },
  { id: "basketball", name: "농구", teamCount: 2, defaultGameSec: 10 * 60, setCount: 4, builtIn: true },
  { id: "volleyball", name: "배구", teamCount: 2, defaultGameSec: 12 * 60, setCount: 5, builtIn: true },
  { id: "soccer", name: "축구", teamCount: 2, defaultGameSec: 10 * 60, setCount: 2, builtIn: true },
  { id: "custom", name: "커스텀", teamCount: 2, defaultGameSec: 10 * 60, setCount: 3, builtIn: true },
];

const makeDefaultTeams = (count: number): ScoreboardTeam[] => {
  return Array.from({ length: count }, (_, idx) => ({
    id: `team-${idx + 1}`,
    name: `팀 ${String.fromCharCode(65 + idx)}`,
    color: TEAM_COLORS[idx],
    score: 0,
    fouls: 0,
    timeouts: 0,
    setWins: 0,
  }));
};

export const makeDefaultScoreboardState = (): ScoreboardState => {
  const preset = DEFAULT_SCOREBOARD_PRESETS[0];
  return {
    presetId: preset.id,
    teams: makeDefaultTeams(preset.teamCount),
    currentSet: 1,
    setCount: preset.setCount,
    gameTimerSec: preset.defaultGameSec,
    gameTimerMode: "idle",
    gameTimerStartedAt: null,
    gameTimerBaseSec: preset.defaultGameSec,
    history: [],
  };
};

export const DEFAULT_TEMPLATES: ClassTemplate[] = [
  {
    id: "tpl-circuit",
    name: "준비운동 + 서킷",
    description: "준비운동 3분 → 서킷 6라운드(45/15) → 정리 2분",
    builtIn: true,
    steps: [
      { id: "w1", title: "준비운동", description: "가벼운 준비운동", durationSec: 3 * 60, targetTab: "timer" },
      {
        id: "w2",
        title: "서킷 6라운드",
        description: "45초 운동 / 15초 휴식",
        durationSec: 6 * 60,
        targetTab: "timer",
        timerConfig: { workSec: 45, restSec: 15, rounds: 6, prepareSec: 3 },
      },
      { id: "w3", title: "정리", description: "정리운동", durationSec: 2 * 60, targetTab: "timer" },
    ],
  },
  {
    id: "tpl-basketball",
    name: "농구 수업",
    description: "준비(3) → 드릴(5) → 경기(10) → 정리(2)",
    builtIn: true,
    steps: [
      { id: "b1", title: "준비", description: "몸풀기", durationSec: 3 * 60, targetTab: "timer" },
      { id: "b2", title: "드릴", description: "드리블/패스 드릴", durationSec: 5 * 60, targetTab: "timer" },
      { id: "b3", title: "경기", description: "미니게임", durationSec: 10 * 60, targetTab: "scoreboard" },
      { id: "b4", title: "정리", description: "쿨다운", durationSec: 2 * 60, targetTab: "timer" },
    ],
  },
  {
    id: "tpl-dodgeball",
    name: "피구 수업",
    description: "준비(3) → 팀편성 → 경기(8) → 정리(2)",
    builtIn: true,
    steps: [
      { id: "d1", title: "준비", description: "준비운동", durationSec: 3 * 60, targetTab: "timer" },
      { id: "d2", title: "팀편성", description: "팀 나누기", durationSec: 0, targetTab: "teams" },
      { id: "d3", title: "경기", description: "피구 경기", durationSec: 8 * 60, targetTab: "scoreboard" },
      { id: "d4", title: "정리", description: "정리운동", durationSec: 2 * 60, targetTab: "timer" },
    ],
  },
  {
    id: "tpl-volleyball",
    name: "배구 수업",
    description: "준비(3) → 리시브/토스(5) → 경기(10) → 정리(2)",
    builtIn: true,
    steps: [
      { id: "v1", title: "준비", description: "스트레칭", durationSec: 3 * 60, targetTab: "timer" },
      { id: "v2", title: "기본기", description: "리시브/토스", durationSec: 5 * 60, targetTab: "timer" },
      { id: "v3", title: "경기", description: "팀 경기", durationSec: 10 * 60, targetTab: "scoreboard" },
      { id: "v4", title: "정리", description: "정리운동", durationSec: 2 * 60, targetTab: "timer" },
    ],
  },
  {
    id: "tpl-custom",
    name: "커스텀 템플릿",
    description: "예시: 준비(3) → 팀편성 → 경기(10) → 정리(2)",
    builtIn: true,
    steps: [
      { id: "c1", title: "준비", description: "준비운동", durationSec: 3 * 60, targetTab: "timer" },
      { id: "c2", title: "팀편성", description: "임의 팀편성", durationSec: 0, targetTab: "teams" },
      { id: "c3", title: "경기", description: "점수판 사용", durationSec: 10 * 60, targetTab: "scoreboard" },
      { id: "c4", title: "정리", description: "수업 마무리", durationSec: 2 * 60, targetTab: "timer" },
    ],
  },
];

export const DEFAULT_TEMPLATE_RUNNER: TemplateRunnerState = {
  mode: "idle",
  templateId: null,
  stepIndex: 0,
  stepRemainingSec: 0,
  stepBaseSec: 0,
  stepStartedAt: null,
};

export const DEFAULT_PERSISTED_STATE: PersistedState = {
  settings: DEFAULT_SETTINGS,
  timerPresets: DEFAULT_TIMER_PRESETS,
  timer: DEFAULT_TIMER_STATE,
  recentItems: [],
  teamHistory: [],
  scoreboardPresets: DEFAULT_SCOREBOARD_PRESETS,
  scoreboard: makeDefaultScoreboardState(),
  templates: DEFAULT_TEMPLATES,
  templateRunner: DEFAULT_TEMPLATE_RUNNER,
};

export const DEFAULT_APP_STATE: AppState = {
  ...DEFAULT_PERSISTED_STATE,
  hydrated: false,
  currentTab: "home",
  settingsOpen: false,
  soundQueue: [],
};

export const SCORES = [1, 2, 3];
