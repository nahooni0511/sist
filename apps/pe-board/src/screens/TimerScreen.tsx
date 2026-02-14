import { MaterialIcons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { ActionChip, Panel } from "../components/AppScaffold";
import { useAppContext } from "../context/AppContext";
import { TimerPhase } from "../types/app";
import { formatBigTimer, formatTimer } from "../utils/time";

const Stepper = ({
  label,
  value,
  min,
  max,
  suffix,
  onChange,
  darkMode,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  suffix?: string;
  onChange: (next: number) => void;
  darkMode: boolean;
}) => {
  const { theme } = useAppContext();
  return (
    <View style={[styles.stepperCard, { backgroundColor: theme.surface, borderColor: theme.border }]}> 
      <Text style={[styles.stepperLabel, { color: theme.mutedText }]}>{label}</Text>
      <View style={styles.stepperControls}>
        <Pressable
          style={[styles.stepperButton, { backgroundColor: theme.bgAlt, borderColor: theme.border }]}
          onPress={() => onChange(Math.max(min, value - 1))}
        >
          <MaterialIcons name="remove" size={34} color={theme.text} />
        </Pressable>
        <Text style={[styles.stepperValue, { color: theme.text }]}>
          {value}
          {suffix}
        </Text>
        <Pressable
          style={[styles.stepperButton, { backgroundColor: theme.bgAlt, borderColor: theme.border }]}
          onPress={() => onChange(Math.min(max, value + 1))}
        >
          <MaterialIcons name="add" size={34} color={theme.text} />
        </Pressable>
      </View>
    </View>
  );
};

const phaseLabel = (phase: TimerPhase): string => {
  if (phase === "prepare") return "준비";
  if (phase === "work") return "운동";
  if (phase === "rest") return "휴식";
  return "완료";
};

export const TimerScreen = () => {
  const { state, actions, theme } = useAppContext();
  const timer = state.timer;

  return (
    <View style={styles.container}>
      <View style={styles.topRow}>
        <Panel darkMode={state.settings.darkMode} style={styles.timerPanel}>
          <View style={styles.timerHeaderRow}>
            <Text style={[styles.phaseBadge, { backgroundColor: timer.phase === "work" ? theme.success : timer.phase === "rest" ? theme.danger : theme.primary }]}> 
              {phaseLabel(timer.phase)}
            </Text>
            <Text style={[styles.roundText, { color: theme.text }]}>ROUND {timer.currentRound} / {timer.rounds}</Text>
            <Text style={[styles.elapsedText, { color: theme.mutedText }]}>총 경과 {formatTimer(timer.elapsedSec)}</Text>
          </View>

          <View style={styles.bigTimerWrap}>
            <Text style={[styles.bigTimerText, { color: theme.text }]}>{formatBigTimer(timer.remainingSec)}</Text>
          </View>

          <View style={styles.controlRow}>
            <Pressable
              onPress={timer.mode === "running" ? actions.pauseTimer : timer.mode === "paused" ? actions.resumeTimer : () => actions.startTimer()}
              style={[styles.controlButton, { backgroundColor: theme.primary }]}
            >
              <MaterialIcons
                name={timer.mode === "running" ? "pause" : "play-arrow"}
                size={40}
                color="#fff"
              />
              <Text style={styles.controlLabel}>{timer.mode === "running" ? "일시정지" : "시작"}</Text>
            </Pressable>

            <Pressable onPress={actions.prevTimerPhase} style={[styles.controlButton, { backgroundColor: theme.surface, borderColor: theme.border }]}> 
              <MaterialIcons name="skip-previous" size={40} color={theme.text} />
              <Text style={[styles.controlLabel, { color: theme.text }]}>이전</Text>
            </Pressable>

            <Pressable onPress={actions.nextTimerPhase} style={[styles.controlButton, { backgroundColor: theme.surface, borderColor: theme.border }]}> 
              <MaterialIcons name="skip-next" size={40} color={theme.text} />
              <Text style={[styles.controlLabel, { color: theme.text }]}>다음</Text>
            </Pressable>

            <Pressable onPress={actions.resetTimer} style={[styles.controlButton, { backgroundColor: theme.danger }]}> 
              <MaterialIcons name="refresh" size={40} color="#fff" />
              <Text style={styles.controlLabel}>리셋</Text>
            </Pressable>
          </View>
        </Panel>

        <Panel darkMode={state.settings.darkMode} style={styles.configPanel}>
          <Text style={[styles.panelTitle, { color: theme.text }]}>설정</Text>

          <View style={styles.stepperGrid}>
            <Stepper
              label="운동"
              value={timer.workSec}
              min={10}
              max={300}
              suffix="s"
              darkMode={state.settings.darkMode}
              onChange={(value) => actions.updateTimerConfig({ workSec: value })}
            />
            <Stepper
              label="휴식"
              value={timer.restSec}
              min={5}
              max={120}
              suffix="s"
              darkMode={state.settings.darkMode}
              onChange={(value) => actions.updateTimerConfig({ restSec: value })}
            />
            <Stepper
              label="라운드"
              value={timer.rounds}
              min={1}
              max={20}
              darkMode={state.settings.darkMode}
              onChange={(value) => actions.updateTimerConfig({ rounds: value })}
            />
            <Stepper
              label="준비"
              value={timer.prepareSec}
              min={1}
              max={10}
              suffix="s"
              darkMode={state.settings.darkMode}
              onChange={(value) => actions.updateTimerConfig({ prepareSec: value })}
            />
          </View>

          <View style={styles.toggleRow}>
            <ActionChip
              label={state.settings.voiceCountdown ? "마지막 카운트다운 ON" : "마지막 카운트다운 OFF"}
              darkMode={state.settings.darkMode}
              active={state.settings.voiceCountdown}
              onPress={() => actions.updateSettings({ voiceCountdown: !state.settings.voiceCountdown })}
            />
            <ActionChip
              label="현재 설정 프리셋 저장"
              darkMode={state.settings.darkMode}
              onPress={actions.addCurrentTimerPreset}
            />
          </View>
        </Panel>
      </View>

      <Panel darkMode={state.settings.darkMode}>
        <Text style={[styles.panelTitle, { color: theme.text }]}>프리셋</Text>
        <View style={styles.presetRow}>
          {state.timerPresets.map((preset) => (
            <ActionChip
              key={preset.id}
              label={`${preset.workSec}s`}
              active={preset.id === timer.selectedPresetId}
              onPress={() => actions.selectTimerPreset(preset.id)}
              darkMode={state.settings.darkMode}
            />
          ))}
        </View>
      </Panel>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    gap: 12,
  },
  topRow: {
    flexDirection: "row",
    gap: 12,
  },
  timerPanel: {
    flex: 2.4,
    minHeight: 470,
  },
  configPanel: {
    flex: 1,
    minHeight: 470,
  },
  timerHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 6,
  },
  phaseBadge: {
    color: "#ffffff",
    fontSize: 34,
    fontWeight: "900",
    minWidth: 130,
    textAlign: "center",
    borderRadius: 10,
    overflow: "hidden",
    paddingVertical: 4,
    paddingHorizontal: 10,
  },
  roundText: {
    fontSize: 32,
    fontWeight: "900",
  },
  elapsedText: {
    fontSize: 22,
    fontWeight: "700",
  },
  bigTimerWrap: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    minHeight: 220,
  },
  bigTimerText: {
    fontSize: 190,
    fontWeight: "900",
    letterSpacing: -3,
  },
  controlRow: {
    flexDirection: "row",
    gap: 10,
  },
  controlButton: {
    flex: 1,
    minHeight: 90,
    borderRadius: 18,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  controlLabel: {
    color: "#fff",
    fontSize: 24,
    fontWeight: "900",
  },
  panelTitle: {
    fontSize: 30,
    fontWeight: "900",
  },
  stepperGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  stepperCard: {
    width: "48.5%",
    minHeight: 132,
    borderRadius: 16,
    borderWidth: 1,
    padding: 8,
    justifyContent: "space-between",
  },
  stepperLabel: {
    fontSize: 20,
    fontWeight: "800",
  },
  stepperControls: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 6,
  },
  stepperButton: {
    width: 58,
    height: 58,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  stepperValue: {
    fontSize: 38,
    fontWeight: "900",
  },
  toggleRow: {
    gap: 8,
    marginTop: 6,
  },
  presetRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
});
