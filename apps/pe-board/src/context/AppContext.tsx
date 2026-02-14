import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  DEFAULT_APP_STATE,
  DEFAULT_PERSISTED_STATE,
  DEFAULT_SCOREBOARD_PRESETS,
  DEFAULT_TIMER_PRESETS,
  DEFAULT_TEMPLATE_RUNNER,
  makeDefaultScoreboardState,
} from "../data/defaults";
import { getTheme } from "../theme";
import {
  AppState,
  ClassTemplate,
  MainTab,
  PersistedState,
  ScoreboardState,
  ScoreboardTeam,
  SettingsState,
  SoundKey,
  TemplateRunnerState,
  TimerPreset,
  TimerState,
  TimerTickResult,
} from "../types/app";
import { clamp, nowMs } from "../utils/time";
import { clearPersistedState, loadPersistedState, savePersistedState } from "../utils/storage";

interface AppActions {
  setCurrentTab: (tab: MainTab) => void;
  setSettingsOpen: (open: boolean) => void;
  updateSettings: (partial: Partial<SettingsState>) => void;
  resetAllData: () => Promise<void>;

  selectTimerPreset: (presetId: string) => void;
  updateTimerConfig: (partial: Partial<Pick<TimerState, "workSec" | "restSec" | "rounds" | "prepareSec">>) => void;
  addCurrentTimerPreset: () => void;
  startTimer: (override?: Partial<TimerPreset>) => void;
  pauseTimer: () => void;
  resumeTimer: () => void;
  toggleTimer: () => void;
  nextTimerPhase: () => void;
  prevTimerPhase: () => void;
  resetTimer: () => void;

  recordTeamHistory: (teams: string[][]) => void;

  setScoreboardPreset: (presetId: string) => void;
  setScoreboardTeamCount: (teamCount: 2 | 3 | 4) => void;
  renameScoreboardTeam: (teamId: string, name: string) => void;
  adjustScore: (teamId: string, delta: number) => void;
  adjustTeamCounter: (teamId: string, field: "fouls" | "timeouts", delta: number) => void;
  awardSetWin: (teamId: string) => void;
  undoScoreboard: () => void;
  resetScoreboard: () => void;
  startGameTimer: () => void;
  pauseGameTimer: () => void;
  resetGameTimer: () => void;

  startTemplate: (templateId: string) => void;
  pauseTemplate: () => void;
  resumeTemplate: () => void;
  nextTemplateStep: () => void;
  prevTemplateStep: () => void;
  stopTemplate: () => void;

  consumeSoundQueue: () => SoundKey[];
}

interface AppContextValue {
  state: AppState;
  theme: ReturnType<typeof getTheme>;
  actions: AppActions;
}

const AppContext = createContext<AppContextValue | undefined>(undefined);

const makeRecentId = (): string => `${Date.now()}-${Math.round(Math.random() * 100000)}`;

const toPersistedState = (state: AppState): PersistedState => ({
  settings: state.settings,
  timerPresets: state.timerPresets,
  timer: state.timer,
  recentItems: state.recentItems,
  teamHistory: state.teamHistory,
  scoreboardPresets: state.scoreboardPresets,
  scoreboard: state.scoreboard,
  templates: state.templates,
  templateRunner: state.templateRunner,
});

const cloneTeams = (teams: ScoreboardTeam[]): ScoreboardTeam[] => teams.map((team) => ({ ...team }));

const scoreboardSnapshot = (scoreboard: ScoreboardState) => ({
  teams: cloneTeams(scoreboard.teams),
  currentSet: scoreboard.currentSet,
  gameTimerSec: scoreboard.gameTimerSec,
  gameTimerMode: scoreboard.gameTimerMode,
  gameTimerStartedAt: scoreboard.gameTimerStartedAt,
  gameTimerBaseSec: scoreboard.gameTimerBaseSec,
});

const withScoreboardHistory = (scoreboard: ScoreboardState): ScoreboardState => {
  return {
    ...scoreboard,
    history: [scoreboardSnapshot(scoreboard), ...scoreboard.history].slice(0, 40),
  };
};

const getPresetById = (presets: TimerPreset[], id: string): TimerPreset => {
  return presets.find((preset) => preset.id === id) ?? presets[0] ?? DEFAULT_TIMER_PRESETS[0];
};

const applyPresetToTimer = (timer: TimerState, preset: TimerPreset): TimerState => {
  return {
    ...timer,
    selectedPresetId: preset.id,
    workSec: preset.workSec,
    restSec: preset.restSec,
    rounds: preset.rounds,
    prepareSec: preset.prepareSec,
    mode: "idle",
    phase: "prepare",
    currentRound: 1,
    phaseDurationSec: preset.prepareSec,
    phaseStartedAt: null,
    remainingSec: preset.prepareSec,
    elapsedSec: 0,
    elapsedAnchorAt: null,
    elapsedAccumulatedSec: 0,
    lastCountdownSpoken: null,
  };
};

const startTimerFromState = (timer: TimerState, now: number): TimerState => {
  const prepareSec = Math.max(1, timer.prepareSec);
  return {
    ...timer,
    mode: "running",
    phase: "prepare",
    currentRound: 1,
    phaseDurationSec: prepareSec,
    phaseStartedAt: now,
    remainingSec: prepareSec,
    elapsedSec: 0,
    elapsedAnchorAt: now,
    elapsedAccumulatedSec: 0,
    lastCountdownSpoken: null,
  };
};

const transitionTimerPhase = (timer: TimerState, preset: TimerPreset, now: number): TimerTickResult => {
  if (timer.phase === "prepare") {
    const workSec = Math.max(1, timer.workSec);
    return {
      nextTimer: {
        ...timer,
        mode: "running",
        phase: "work",
        phaseDurationSec: workSec,
        phaseStartedAt: now,
        remainingSec: workSec,
        lastCountdownSpoken: null,
      },
      sounds: [preset.startSound],
      timerCompleted: false,
    };
  }

  if (timer.phase === "work") {
    if (timer.currentRound >= timer.rounds) {
      return {
        nextTimer: {
          ...timer,
          mode: "completed",
          phase: "done",
          phaseDurationSec: 0,
          phaseStartedAt: null,
          remainingSec: 0,
          lastCountdownSpoken: null,
        },
        sounds: [preset.finishSound],
        timerCompleted: true,
      };
    }
    const restSec = Math.max(1, timer.restSec);
    return {
      nextTimer: {
        ...timer,
        mode: "running",
        phase: "rest",
        phaseDurationSec: restSec,
        phaseStartedAt: now,
        remainingSec: restSec,
        lastCountdownSpoken: null,
      },
      sounds: [preset.transitionSound],
      timerCompleted: false,
    };
  }

  if (timer.phase === "rest") {
    const workSec = Math.max(1, timer.workSec);
    return {
      nextTimer: {
        ...timer,
        mode: "running",
        phase: "work",
        currentRound: timer.currentRound + 1,
        phaseDurationSec: workSec,
        phaseStartedAt: now,
        remainingSec: workSec,
        lastCountdownSpoken: null,
      },
      sounds: [preset.startSound],
      timerCompleted: false,
    };
  }

  return {
    nextTimer: timer,
    sounds: [],
    timerCompleted: false,
  };
};

const tickTimer = (
  timer: TimerState,
  preset: TimerPreset,
  settings: SettingsState,
  now: number
): TimerTickResult => {
  if (timer.mode !== "running" || timer.phaseStartedAt === null || timer.elapsedAnchorAt === null) {
    return { nextTimer: timer, sounds: [], timerCompleted: false };
  }

  const phaseElapsed = Math.max(0, Math.floor((now - timer.phaseStartedAt) / 1000));
  const remainingSec = Math.max(0, timer.phaseDurationSec - phaseElapsed);
  const elapsedSec = timer.elapsedAccumulatedSec + Math.max(0, Math.floor((now - timer.elapsedAnchorAt) / 1000));

  let nextTimer: TimerState = {
    ...timer,
    remainingSec,
    elapsedSec,
  };

  const sounds: SoundKey[] = [];

  if (
    settings.voiceCountdown &&
    timer.phase === "work" &&
    preset.lastFiveCountdown &&
    remainingSec > 0 &&
    remainingSec <= settings.voiceCountdownLength &&
    remainingSec !== timer.lastCountdownSpoken
  ) {
    nextTimer = { ...nextTimer, lastCountdownSpoken: remainingSec };
    sounds.push("countdown");
  }

  if (remainingSec <= 0) {
    const transitioned = transitionTimerPhase(nextTimer, preset, now);
    return {
      nextTimer: {
        ...transitioned.nextTimer,
        elapsedSec,
      },
      sounds: [...sounds, ...transitioned.sounds],
      timerCompleted: transitioned.timerCompleted,
    };
  }

  return { nextTimer, sounds, timerCompleted: false };
};

const pauseTimerState = (timer: TimerState, now: number): TimerState => {
  if (timer.mode !== "running" || timer.phaseStartedAt === null || timer.elapsedAnchorAt === null) {
    return timer;
  }
  const phaseElapsed = Math.max(0, Math.floor((now - timer.phaseStartedAt) / 1000));
  const remainingSec = Math.max(0, timer.phaseDurationSec - phaseElapsed);
  const elapsedSec = timer.elapsedAccumulatedSec + Math.max(0, Math.floor((now - timer.elapsedAnchorAt) / 1000));

  return {
    ...timer,
    mode: "paused",
    phaseStartedAt: null,
    phaseDurationSec: Math.max(1, remainingSec),
    remainingSec,
    elapsedSec,
    elapsedAccumulatedSec: elapsedSec,
    elapsedAnchorAt: null,
  };
};

const resumeTimerState = (timer: TimerState, now: number): TimerState => {
  if (timer.mode !== "paused") {
    return timer;
  }
  const remaining = Math.max(1, timer.remainingSec);
  return {
    ...timer,
    mode: "running",
    phaseStartedAt: now,
    phaseDurationSec: remaining,
    remainingSec: remaining,
    elapsedAnchorAt: now,
    elapsedAccumulatedSec: timer.elapsedSec,
  };
};

const addRecent = (state: AppState, type: "timer" | "scoreboard" | "template", label: string, payloadId: string): AppState => {
  const item = { id: makeRecentId(), type, label, payloadId, usedAt: nowMs() };
  return {
    ...state,
    recentItems: [item, ...state.recentItems].slice(0, 10),
  };
};

const normalizeHydratedState = (data: Partial<PersistedState> | null): PersistedState => {
  if (!data) {
    return DEFAULT_PERSISTED_STATE;
  }

  const presets = data.timerPresets?.length ? data.timerPresets : DEFAULT_TIMER_PRESETS;
  const selectedPresetId = data.timer?.selectedPresetId ?? presets[0].id;
  const selectedPreset = presets.find((preset) => preset.id === selectedPresetId) ?? presets[0];
  const timer = data.timer ? { ...data.timer } : applyPresetToTimer(DEFAULT_PERSISTED_STATE.timer, selectedPreset);

  return {
    settings: { ...DEFAULT_PERSISTED_STATE.settings, ...(data.settings ?? {}) },
    timerPresets: presets,
    timer: {
      ...applyPresetToTimer(timer, selectedPreset),
      ...timer,
      mode: "idle",
      phaseStartedAt: null,
      elapsedAnchorAt: null,
    },
    recentItems: data.recentItems ?? [],
    teamHistory: data.teamHistory ?? [],
    scoreboardPresets: data.scoreboardPresets?.length ? data.scoreboardPresets : DEFAULT_SCOREBOARD_PRESETS,
    scoreboard: data.scoreboard
      ? {
          ...makeDefaultScoreboardState(),
          ...data.scoreboard,
          teams: data.scoreboard.teams?.length ? data.scoreboard.teams : makeDefaultScoreboardState().teams,
          history: [],
          gameTimerMode: "idle",
          gameTimerStartedAt: null,
        }
      : makeDefaultScoreboardState(),
    templates: data.templates?.length ? data.templates : DEFAULT_PERSISTED_STATE.templates,
    templateRunner: {
      ...DEFAULT_TEMPLATE_RUNNER,
      ...(data.templateRunner ?? {}),
      mode: "idle",
      templateId: null,
      stepStartedAt: null,
      stepRemainingSec: 0,
      stepBaseSec: 0,
    },
  };
};

const applyTemplateStepToState = (state: AppState, runner: TemplateRunnerState, now: number): AppState => {
  if (!runner.templateId) {
    return state;
  }

  const template = state.templates.find((item) => item.id === runner.templateId);
  const step = template?.steps[runner.stepIndex];
  if (!template || !step) {
    return state;
  }

  let next = {
    ...state,
    currentTab: step.targetTab,
  };

  if (step.targetTab === "timer") {
    const mergedTimer = {
      ...next.timer,
      workSec: step.timerConfig?.workSec ?? next.timer.workSec,
      restSec: step.timerConfig?.restSec ?? next.timer.restSec,
      rounds: step.timerConfig?.rounds ?? next.timer.rounds,
      prepareSec: step.timerConfig?.prepareSec ?? next.timer.prepareSec,
    };
    next = {
      ...next,
      timer: startTimerFromState(mergedTimer, now),
      soundQueue: [...next.soundQueue, "startSignal"],
    };
  }

  if (step.targetTab === "scoreboard" && step.durationSec > 0) {
    next = {
      ...next,
      scoreboard: {
        ...next.scoreboard,
        gameTimerSec: step.durationSec,
        gameTimerBaseSec: step.durationSec,
        gameTimerMode: "running",
        gameTimerStartedAt: now,
      },
    };
  }

  return next;
};

export const AppProvider = ({ children }: { children: React.ReactNode }) => {
  const [state, setState] = useState<AppState>(DEFAULT_APP_STATE);

  useEffect(() => {
    const hydrate = async () => {
      const loaded = await loadPersistedState();
      const normalized = normalizeHydratedState(loaded);
      setState((prev) => ({
        ...prev,
        ...normalized,
        hydrated: true,
      }));
    };

    void hydrate();
  }, []);

  useEffect(() => {
    if (!state.hydrated) {
      return;
    }
    const persisted = toPersistedState(state);
    void savePersistedState(persisted);
  }, [state]);

  useEffect(() => {
    if (!state.hydrated) {
      return;
    }

    const hasRunningRuntime =
      state.timer.mode === "running" || state.scoreboard.gameTimerMode === "running" || state.templateRunner.mode === "running";

    if (!hasRunningRuntime) {
      return;
    }

    const interval = setInterval(() => {
      const now = nowMs();
      setState((prev) => {
        let next = { ...prev };
        const queuedSounds: SoundKey[] = [];

        const preset = getPresetById(prev.timerPresets, prev.timer.selectedPresetId);
        if (prev.timer.mode === "running") {
          const ticked = tickTimer(prev.timer, preset, prev.settings, now);
          next = { ...next, timer: ticked.nextTimer };
          queuedSounds.push(...ticked.sounds);
        }

        if (prev.scoreboard.gameTimerMode === "running" && prev.scoreboard.gameTimerStartedAt) {
          const elapsed = Math.max(0, Math.floor((now - prev.scoreboard.gameTimerStartedAt) / 1000));
          const remaining = Math.max(0, prev.scoreboard.gameTimerBaseSec - elapsed);
          next = {
            ...next,
            scoreboard: {
              ...next.scoreboard,
              gameTimerSec: remaining,
              gameTimerMode: remaining === 0 ? "paused" : "running",
              gameTimerStartedAt: remaining === 0 ? null : prev.scoreboard.gameTimerStartedAt,
              gameTimerBaseSec: remaining === 0 ? 0 : prev.scoreboard.gameTimerBaseSec,
            },
          };
          if (remaining === 0) {
            queuedSounds.push("stopSignal");
          }
        }

        if (prev.templateRunner.mode === "running" && prev.templateRunner.templateId) {
          const template = prev.templates.find((item) => item.id === prev.templateRunner.templateId);
          const currentStep = template?.steps[prev.templateRunner.stepIndex];
          if (template && currentStep && prev.templateRunner.stepBaseSec > 0 && prev.templateRunner.stepStartedAt) {
            const elapsed = Math.max(0, Math.floor((now - prev.templateRunner.stepStartedAt) / 1000));
            const remaining = Math.max(0, prev.templateRunner.stepBaseSec - elapsed);

            if (remaining === 0) {
              const nextIndex = prev.templateRunner.stepIndex + 1;
              const nextStep = template.steps[nextIndex];
              if (nextStep) {
                let runnerState: TemplateRunnerState = {
                  ...prev.templateRunner,
                  stepIndex: nextIndex,
                  stepRemainingSec: nextStep.durationSec,
                  stepBaseSec: nextStep.durationSec,
                  stepStartedAt: nextStep.durationSec > 0 ? now : null,
                };
                next = {
                  ...next,
                  templateRunner: runnerState,
                  soundQueue: [...next.soundQueue, "shortBell"],
                };
                next = applyTemplateStepToState(next, runnerState, now);
              } else {
                next = {
                  ...next,
                  templateRunner: {
                    ...prev.templateRunner,
                    mode: "completed",
                    stepRemainingSec: 0,
                    stepBaseSec: 0,
                    stepStartedAt: null,
                  },
                  soundQueue: [...next.soundQueue, "longBell"],
                  currentTab: "home",
                };
              }
            } else {
              next = {
                ...next,
                templateRunner: {
                  ...next.templateRunner,
                  stepRemainingSec: remaining,
                },
              };
            }
          }
        }

        if (queuedSounds.length) {
          next = {
            ...next,
            soundQueue: [...next.soundQueue, ...queuedSounds],
          };
        }

        return next;
      });
    }, 250);

    return () => clearInterval(interval);
  }, [
    state.hydrated,
    state.scoreboard.gameTimerMode,
    state.templateRunner.mode,
    state.timer.mode,
    state.timer.selectedPresetId,
    state.settings.voiceCountdown,
    state.settings.voiceCountdownLength,
  ]);

  const actions: AppActions = useMemo(
    () => ({
      setCurrentTab: (tab) => {
        setState((prev) => ({ ...prev, currentTab: tab }));
      },
      setSettingsOpen: (open) => {
        setState((prev) => ({ ...prev, settingsOpen: open }));
      },
      updateSettings: (partial) => {
        setState((prev) => ({ ...prev, settings: { ...prev.settings, ...partial } }));
      },
      resetAllData: async () => {
        await clearPersistedState();
        setState({ ...DEFAULT_APP_STATE, hydrated: true });
      },

      selectTimerPreset: (presetId) => {
        setState((prev) => {
          const preset = getPresetById(prev.timerPresets, presetId);
          return {
            ...prev,
            timer: applyPresetToTimer(prev.timer, preset),
          };
        });
      },
      updateTimerConfig: (partial) => {
        setState((prev) => {
          const nextTimer = {
            ...prev.timer,
            ...partial,
          };
          if (nextTimer.mode === "idle") {
            return {
              ...prev,
              timer: {
                ...nextTimer,
                phaseDurationSec: nextTimer.prepareSec,
                remainingSec: nextTimer.prepareSec,
              },
            };
          }
          return { ...prev, timer: nextTimer };
        });
      },
      addCurrentTimerPreset: () => {
        setState((prev) => {
          const customPreset: TimerPreset = {
            id: `custom-${Date.now()}`,
            name: `커스텀 ${prev.timer.workSec}s/${prev.timer.restSec}s`,
            workSec: prev.timer.workSec,
            restSec: prev.timer.restSec,
            rounds: prev.timer.rounds,
            prepareSec: prev.timer.prepareSec,
            startSound: "startSignal",
            transitionSound: "shortBell",
            finishSound: "longBell",
            lastFiveCountdown: true,
          };
          return {
            ...prev,
            timerPresets: [customPreset, ...prev.timerPresets].slice(0, 20),
            timer: {
              ...prev.timer,
              selectedPresetId: customPreset.id,
            },
            soundQueue: [...prev.soundQueue, "confirm"],
          };
        });
      },
      startTimer: (override) => {
        setState((prev) => {
          const now = nowMs();
          let nextTimer = { ...prev.timer };
          if (override) {
            nextTimer = {
              ...nextTimer,
              workSec: override.workSec ?? nextTimer.workSec,
              restSec: override.restSec ?? nextTimer.restSec,
              rounds: override.rounds ?? nextTimer.rounds,
              prepareSec: override.prepareSec ?? nextTimer.prepareSec,
            };
          }
          const started = startTimerFromState(nextTimer, now);
          const preset = getPresetById(prev.timerPresets, prev.timer.selectedPresetId);
          const withRecent = addRecent(
            {
              ...prev,
              timer: started,
              soundQueue: [...prev.soundQueue, preset.startSound],
            },
            "timer",
            `${started.workSec}s x ${started.rounds}`,
            prev.timer.selectedPresetId
          );
          return withRecent;
        });
      },
      pauseTimer: () => {
        setState((prev) => ({ ...prev, timer: pauseTimerState(prev.timer, nowMs()) }));
      },
      resumeTimer: () => {
        setState((prev) => ({ ...prev, timer: resumeTimerState(prev.timer, nowMs()) }));
      },
      toggleTimer: () => {
        setState((prev) => {
          if (prev.timer.mode === "running") {
            return { ...prev, timer: pauseTimerState(prev.timer, nowMs()) };
          }
          if (prev.timer.mode === "paused") {
            return { ...prev, timer: resumeTimerState(prev.timer, nowMs()) };
          }
          const preset = getPresetById(prev.timerPresets, prev.timer.selectedPresetId);
          return {
            ...prev,
            timer: startTimerFromState(prev.timer, nowMs()),
            soundQueue: [...prev.soundQueue, preset.startSound],
          };
        });
      },
      nextTimerPhase: () => {
        setState((prev) => {
          const preset = getPresetById(prev.timerPresets, prev.timer.selectedPresetId);
          const transitioned = transitionTimerPhase(
            {
              ...prev.timer,
              mode: "running",
            },
            preset,
            nowMs()
          );
          return {
            ...prev,
            timer: transitioned.nextTimer,
            soundQueue: [...prev.soundQueue, ...transitioned.sounds],
          };
        });
      },
      prevTimerPhase: () => {
        setState((prev) => {
          const now = nowMs();
          const timer = prev.timer;
          let next = timer;

          if (timer.phase === "rest") {
            next = {
              ...timer,
              phase: "work",
              phaseDurationSec: timer.workSec,
              phaseStartedAt: now,
              remainingSec: timer.workSec,
            };
          } else if (timer.phase === "work" && timer.currentRound > 1) {
            next = {
              ...timer,
              phase: "rest",
              currentRound: timer.currentRound - 1,
              phaseDurationSec: timer.restSec,
              phaseStartedAt: now,
              remainingSec: timer.restSec,
            };
          } else if (timer.phase === "work" && timer.currentRound === 1) {
            next = {
              ...timer,
              phase: "prepare",
              phaseDurationSec: timer.prepareSec,
              phaseStartedAt: now,
              remainingSec: timer.prepareSec,
            };
          }

          return { ...prev, timer: next };
        });
      },
      resetTimer: () => {
        setState((prev) => {
          const preset = getPresetById(prev.timerPresets, prev.timer.selectedPresetId);
          return {
            ...prev,
            timer: applyPresetToTimer(prev.timer, preset),
          };
        });
      },

      recordTeamHistory: (teams) => {
        setState((prev) => ({
          ...prev,
          teamHistory: [{ id: `hist-${Date.now()}`, createdAt: Date.now(), teams }, ...prev.teamHistory].slice(0, 20),
        }));
      },

      setScoreboardPreset: (presetId) => {
        setState((prev) => {
          const preset = prev.scoreboardPresets.find((item) => item.id === presetId) ?? prev.scoreboardPresets[0];
          const teams = Array.from({ length: preset.teamCount }, (_, idx) => ({
            id: `team-${idx + 1}`,
            name: `팀 ${String.fromCharCode(65 + idx)}`,
            color: ["#137fec", "#dc2626", "#16a34a", "#f59e0b"][idx],
            score: 0,
            fouls: 0,
            timeouts: 0,
            setWins: 0,
          }));
          const scoreboard = {
            ...prev.scoreboard,
            presetId: preset.id,
            teams,
            currentSet: 1,
            setCount: preset.setCount,
            gameTimerSec: preset.defaultGameSec,
            gameTimerMode: "idle" as const,
            gameTimerStartedAt: null,
            gameTimerBaseSec: preset.defaultGameSec,
            history: [],
          };
          return addRecent({ ...prev, scoreboard }, "scoreboard", preset.name, preset.id);
        });
      },
      setScoreboardTeamCount: (teamCount) => {
        setState((prev) => {
          const capped = clamp(teamCount, 2, 4) as 2 | 3 | 4;
          const current = cloneTeams(prev.scoreboard.teams);
          const nextTeams = Array.from({ length: capped }, (_, idx) => {
            return (
              current[idx] ?? {
                id: `team-${idx + 1}`,
                name: `팀 ${String.fromCharCode(65 + idx)}`,
                color: ["#137fec", "#dc2626", "#16a34a", "#f59e0b"][idx],
                score: 0,
                fouls: 0,
                timeouts: 0,
                setWins: 0,
              }
            );
          });
          return {
            ...prev,
            scoreboard: {
              ...withScoreboardHistory(prev.scoreboard),
              teams: nextTeams,
            },
          };
        });
      },
      renameScoreboardTeam: (teamId, name) => {
        setState((prev) => ({
          ...prev,
          scoreboard: {
            ...withScoreboardHistory(prev.scoreboard),
            teams: prev.scoreboard.teams.map((team) => (team.id === teamId ? { ...team, name: name || team.name } : team)),
          },
        }));
      },
      adjustScore: (teamId, delta) => {
        setState((prev) => {
          const scoreboard = withScoreboardHistory(prev.scoreboard);
          return {
            ...prev,
            scoreboard: {
              ...scoreboard,
              teams: scoreboard.teams.map((team) =>
                team.id === teamId ? { ...team, score: Math.max(0, team.score + delta) } : team
              ),
            },
          };
        });
      },
      adjustTeamCounter: (teamId, field, delta) => {
        setState((prev) => {
          const scoreboard = withScoreboardHistory(prev.scoreboard);
          return {
            ...prev,
            scoreboard: {
              ...scoreboard,
              teams: scoreboard.teams.map((team) => {
                if (team.id !== teamId) {
                  return team;
                }
                return {
                  ...team,
                  [field]: Math.max(0, team[field] + delta),
                } as ScoreboardTeam;
              }),
            },
          };
        });
      },
      awardSetWin: (teamId) => {
        setState((prev) => {
          const scoreboard = withScoreboardHistory(prev.scoreboard);
          const nextSet = Math.min(scoreboard.setCount, scoreboard.currentSet + 1);
          return {
            ...prev,
            scoreboard: {
              ...scoreboard,
              currentSet: nextSet,
              teams: scoreboard.teams.map((team) => {
                if (team.id !== teamId) {
                  return team;
                }
                return {
                  ...team,
                  setWins: team.setWins + 1,
                };
              }),
            },
            soundQueue: [...prev.soundQueue, "confirm"],
          };
        });
      },
      undoScoreboard: () => {
        setState((prev) => {
          const [latest, ...rest] = prev.scoreboard.history;
          if (!latest) {
            return prev;
          }
          return {
            ...prev,
            scoreboard: {
              ...prev.scoreboard,
              ...latest,
              history: rest,
            },
            soundQueue: [...prev.soundQueue, "confirm"],
          };
        });
      },
      resetScoreboard: () => {
        setState((prev) => ({
          ...prev,
          scoreboard: makeDefaultScoreboardState(),
        }));
      },
      startGameTimer: () => {
        setState((prev) => {
          if (prev.scoreboard.gameTimerMode === "running") {
            return prev;
          }
          return {
            ...prev,
            scoreboard: {
              ...prev.scoreboard,
              gameTimerMode: "running",
              gameTimerStartedAt: nowMs(),
              gameTimerBaseSec: prev.scoreboard.gameTimerSec,
            },
          };
        });
      },
      pauseGameTimer: () => {
        setState((prev) => {
          if (prev.scoreboard.gameTimerMode !== "running" || !prev.scoreboard.gameTimerStartedAt) {
            return prev;
          }
          const elapsed = Math.max(0, Math.floor((nowMs() - prev.scoreboard.gameTimerStartedAt) / 1000));
          const remaining = Math.max(0, prev.scoreboard.gameTimerBaseSec - elapsed);
          return {
            ...prev,
            scoreboard: {
              ...prev.scoreboard,
              gameTimerSec: remaining,
              gameTimerMode: "paused",
              gameTimerStartedAt: null,
              gameTimerBaseSec: remaining,
            },
          };
        });
      },
      resetGameTimer: () => {
        setState((prev) => {
          const preset = prev.scoreboardPresets.find((item) => item.id === prev.scoreboard.presetId) ?? prev.scoreboardPresets[0];
          return {
            ...prev,
            scoreboard: {
              ...prev.scoreboard,
              gameTimerMode: "idle",
              gameTimerStartedAt: null,
              gameTimerBaseSec: preset.defaultGameSec,
              gameTimerSec: preset.defaultGameSec,
            },
          };
        });
      },

      startTemplate: (templateId) => {
        setState((prev) => {
          const template = prev.templates.find((item) => item.id === templateId);
          if (!template) {
            return prev;
          }
          const firstStep = template.steps[0];
          const runner: TemplateRunnerState = {
            mode: "running",
            templateId,
            stepIndex: 0,
            stepRemainingSec: firstStep?.durationSec ?? 0,
            stepBaseSec: firstStep?.durationSec ?? 0,
            stepStartedAt: firstStep && firstStep.durationSec > 0 ? nowMs() : null,
          };
          const withRunner = addRecent(
            {
              ...prev,
              templateRunner: runner,
              soundQueue: [...prev.soundQueue, "startSignal"],
            },
            "template",
            template.name,
            template.id
          );
          return applyTemplateStepToState(withRunner, runner, nowMs());
        });
      },
      pauseTemplate: () => {
        setState((prev) => {
          if (prev.templateRunner.mode !== "running") {
            return prev;
          }
          const now = nowMs();
          const elapsed = prev.templateRunner.stepStartedAt
            ? Math.max(0, Math.floor((now - prev.templateRunner.stepStartedAt) / 1000))
            : 0;
          const remaining = Math.max(0, prev.templateRunner.stepBaseSec - elapsed);
          return {
            ...prev,
            templateRunner: {
              ...prev.templateRunner,
              mode: "paused",
              stepRemainingSec: remaining,
              stepBaseSec: remaining,
              stepStartedAt: null,
            },
          };
        });
      },
      resumeTemplate: () => {
        setState((prev) => {
          if (prev.templateRunner.mode !== "paused") {
            return prev;
          }
          return {
            ...prev,
            templateRunner: {
              ...prev.templateRunner,
              mode: "running",
              stepStartedAt: prev.templateRunner.stepBaseSec > 0 ? nowMs() : null,
            },
          };
        });
      },
      nextTemplateStep: () => {
        setState((prev) => {
          if (!prev.templateRunner.templateId) {
            return prev;
          }
          const template = prev.templates.find((item) => item.id === prev.templateRunner.templateId);
          if (!template) {
            return prev;
          }
          const nextIndex = prev.templateRunner.stepIndex + 1;
          const step = template.steps[nextIndex];
          if (!step) {
            return {
              ...prev,
              templateRunner: {
                ...prev.templateRunner,
                mode: "completed",
                stepRemainingSec: 0,
                stepBaseSec: 0,
                stepStartedAt: null,
              },
              currentTab: "home",
              soundQueue: [...prev.soundQueue, "longBell"],
            };
          }
          const runner = {
            ...prev.templateRunner,
            mode: "running" as const,
            stepIndex: nextIndex,
            stepRemainingSec: step.durationSec,
            stepBaseSec: step.durationSec,
            stepStartedAt: step.durationSec > 0 ? nowMs() : null,
          };
          const nextState: AppState = {
            ...prev,
            templateRunner: runner,
            soundQueue: [...prev.soundQueue, "shortBell"],
          };
          return applyTemplateStepToState(nextState, runner, nowMs());
        });
      },
      prevTemplateStep: () => {
        setState((prev) => {
          if (!prev.templateRunner.templateId) {
            return prev;
          }
          const template = prev.templates.find((item) => item.id === prev.templateRunner.templateId);
          if (!template) {
            return prev;
          }
          const nextIndex = Math.max(0, prev.templateRunner.stepIndex - 1);
          const step = template.steps[nextIndex];
          const runner = {
            ...prev.templateRunner,
            mode: "running" as const,
            stepIndex: nextIndex,
            stepRemainingSec: step?.durationSec ?? 0,
            stepBaseSec: step?.durationSec ?? 0,
            stepStartedAt: step && step.durationSec > 0 ? nowMs() : null,
          };
          const nextState = {
            ...prev,
            templateRunner: runner,
          };
          return applyTemplateStepToState(nextState, runner, nowMs());
        });
      },
      stopTemplate: () => {
        setState((prev) => ({
          ...prev,
          templateRunner: DEFAULT_TEMPLATE_RUNNER,
          soundQueue: [...prev.soundQueue, "stopSignal"],
          currentTab: "home",
        }));
      },

      consumeSoundQueue: () => {
        let queue: SoundKey[] = [];
        setState((prev) => {
          queue = [...prev.soundQueue];
          return {
            ...prev,
            soundQueue: [],
          };
        });
        return queue;
      },
    }),
    []
  );

  const theme = useMemo(() => getTheme(state.settings.darkMode), [state.settings.darkMode]);

  const contextValue = useMemo(
    () => ({
      state,
      theme,
      actions,
    }),
    [actions, state, theme]
  );

  return <AppContext.Provider value={contextValue}>{children}</AppContext.Provider>;
};

export const useAppContext = (): AppContextValue => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error("useAppContext must be used inside AppProvider");
  }
  return context;
};
