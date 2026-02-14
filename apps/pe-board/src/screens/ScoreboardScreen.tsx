import { MaterialIcons } from "@expo/vector-icons";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { ActionChip, Panel } from "../components/AppScaffold";
import { useAppContext } from "../context/AppContext";
import { SCORES } from "../data/defaults";
import { formatTimer } from "../utils/time";

export const ScoreboardScreen = () => {
  const { state, actions, theme } = useAppContext();
  const scoreboard = state.scoreboard;

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <View style={styles.leftHeader}>
          <Pressable style={[styles.undoButton, { backgroundColor: theme.surface, borderColor: theme.border }]} onPress={actions.undoScoreboard}>
            <MaterialIcons name="undo" size={34} color={theme.text} />
            <Text style={[styles.undoText, { color: theme.text }]}>Undo</Text>
          </Pressable>

          <Pressable style={[styles.resetButton, { backgroundColor: theme.danger }]} onPress={actions.resetScoreboard}>
            <MaterialIcons name="refresh" size={34} color="#fff" />
            <Text style={styles.undoText}>초기화</Text>
          </Pressable>
        </View>

        <Panel darkMode={state.settings.darkMode} style={styles.timerBox}>
          <Text style={[styles.timerLabel, { color: theme.mutedText }]}>경기 타이머</Text>
          <Text style={[styles.timerValue, { color: theme.primary }]}>{formatTimer(scoreboard.gameTimerSec)}</Text>
          <View style={styles.timerButtons}>
            <Pressable style={[styles.timerControl, { backgroundColor: theme.surface, borderColor: theme.border }]} onPress={actions.startGameTimer}>
              <MaterialIcons name="play-arrow" size={30} color={theme.text} />
            </Pressable>
            <Pressable style={[styles.timerControl, { backgroundColor: theme.surface, borderColor: theme.border }]} onPress={actions.pauseGameTimer}>
              <MaterialIcons name="pause" size={30} color={theme.text} />
            </Pressable>
            <Pressable style={[styles.timerControl, { backgroundColor: theme.surface, borderColor: theme.border }]} onPress={actions.resetGameTimer}>
              <MaterialIcons name="replay" size={30} color={theme.text} />
            </Pressable>
          </View>
        </Panel>

        <Panel darkMode={state.settings.darkMode} style={styles.rightHeader}>
          <Text style={[styles.timerLabel, { color: theme.mutedText }]}>종목 프리셋</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.presetRow}
            style={styles.presetScroll}
          >
            {state.scoreboardPresets.map((preset) => (
              <ActionChip
                key={preset.id}
                label={preset.name}
                darkMode={state.settings.darkMode}
                active={scoreboard.presetId === preset.id}
                onPress={() => actions.setScoreboardPreset(preset.id)}
              />
            ))}
          </ScrollView>
          <View style={styles.teamCountRow}>
            <ActionChip
              label="2팀"
              darkMode={state.settings.darkMode}
              active={scoreboard.teams.length === 2}
              onPress={() => actions.setScoreboardTeamCount(2)}
            />
            <ActionChip
              label="3팀"
              darkMode={state.settings.darkMode}
              active={scoreboard.teams.length === 3}
              onPress={() => actions.setScoreboardTeamCount(3)}
            />
            <ActionChip
              label="4팀"
              darkMode={state.settings.darkMode}
              active={scoreboard.teams.length === 4}
              onPress={() => actions.setScoreboardTeamCount(4)}
            />
          </View>
        </Panel>
      </View>

      <View style={styles.setBar}>
        <Text style={[styles.setLabel, { color: theme.text }]}>세트 {scoreboard.currentSet} / {scoreboard.setCount}</Text>
        {Array.from({ length: scoreboard.setCount }, (_, idx) => (
          <View
            key={`set-${idx + 1}`}
            style={[
              styles.setDot,
              {
                backgroundColor: idx + 1 <= scoreboard.currentSet ? theme.primary : theme.bgAlt,
                borderColor: theme.border,
              },
            ]}
          />
        ))}
      </View>

      <View style={styles.teamRow}>
        {scoreboard.teams.map((team) => (
          <Panel key={team.id} darkMode={state.settings.darkMode} style={styles.teamPanel}>
            <View style={[styles.teamNameWrap, { backgroundColor: team.color }]}> 
              <TextInput
                value={team.name}
                onChangeText={(text) => actions.renameScoreboardTeam(team.id, text)}
                style={styles.teamNameInput}
                placeholder="팀 이름"
                placeholderTextColor="rgba(255,255,255,0.7)"
              />
            </View>

            <Text style={[styles.scoreText, { color: theme.text }]}>{team.score}</Text>

            <View style={styles.scoreButtons}>
              {SCORES.map((score) => (
                <Pressable
                  key={`${team.id}-${score}`}
                  style={[styles.scoreButton, { backgroundColor: theme.surface, borderColor: theme.border }]}
                  onPress={() => actions.adjustScore(team.id, score)}
                >
                  <Text style={[styles.scoreButtonText, { color: theme.text }]}>+{score}</Text>
                </Pressable>
              ))}
              <Pressable
                style={[styles.scoreButton, { backgroundColor: theme.bgAlt, borderColor: theme.border }]}
                onPress={() => actions.adjustScore(team.id, -1)}
              >
                <Text style={[styles.scoreButtonText, { color: theme.text }]}>-1</Text>
              </Pressable>
            </View>

            <View style={styles.counterRow}>
              <View style={[styles.counterBox, { borderColor: theme.border, backgroundColor: theme.surface }]}> 
                <Text style={[styles.counterLabel, { color: theme.mutedText }]}>파울</Text>
                <View style={styles.counterControls}>
                  <Pressable onPress={() => actions.adjustTeamCounter(team.id, "fouls", -1)} style={[styles.counterButton, { backgroundColor: theme.bgAlt }]}> 
                    <Text style={[styles.counterButtonText, { color: theme.text }]}>-</Text>
                  </Pressable>
                  <Text style={[styles.counterValue, { color: theme.text }]}>{team.fouls}</Text>
                  <Pressable onPress={() => actions.adjustTeamCounter(team.id, "fouls", 1)} style={[styles.counterButton, { backgroundColor: theme.bgAlt }]}> 
                    <Text style={[styles.counterButtonText, { color: theme.text }]}>+</Text>
                  </Pressable>
                </View>
              </View>

              <View style={[styles.counterBox, { borderColor: theme.border, backgroundColor: theme.surface }]}> 
                <Text style={[styles.counterLabel, { color: theme.mutedText }]}>타임아웃</Text>
                <View style={styles.counterControls}>
                  <Pressable onPress={() => actions.adjustTeamCounter(team.id, "timeouts", -1)} style={[styles.counterButton, { backgroundColor: theme.bgAlt }]}> 
                    <Text style={[styles.counterButtonText, { color: theme.text }]}>-</Text>
                  </Pressable>
                  <Text style={[styles.counterValue, { color: theme.text }]}>{team.timeouts}</Text>
                  <Pressable onPress={() => actions.adjustTeamCounter(team.id, "timeouts", 1)} style={[styles.counterButton, { backgroundColor: theme.bgAlt }]}> 
                    <Text style={[styles.counterButtonText, { color: theme.text }]}>+</Text>
                  </Pressable>
                </View>
              </View>
            </View>

            <Pressable style={[styles.setWinButton, { backgroundColor: team.color }]} onPress={() => actions.awardSetWin(team.id)}>
              <Text style={styles.setWinText}>세트 승리 +1 ({team.setWins})</Text>
            </Pressable>
          </Panel>
        ))}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    gap: 8,
  },
  headerRow: {
    flexDirection: "row",
    gap: 8,
    alignItems: "stretch",
  },
  leftHeader: {
    gap: 6,
    width: 170,
  },
  undoButton: {
    minHeight: 64,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 6,
  },
  resetButton: {
    minHeight: 64,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 6,
  },
  undoText: {
    color: "#fff",
    fontSize: 22,
    fontWeight: "900",
  },
  timerBox: {
    width: 250,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    gap: 6,
  },
  timerLabel: {
    fontSize: 16,
    fontWeight: "700",
  },
  timerValue: {
    fontSize: 42,
    fontWeight: "900",
  },
  timerButtons: {
    flexDirection: "row",
    gap: 6,
  },
  timerControl: {
    width: 52,
    height: 52,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  rightHeader: {
    flex: 1,
    paddingVertical: 10,
    gap: 6,
  },
  presetScroll: {
    flexGrow: 0,
  },
  presetRow: {
    flexDirection: "row",
    gap: 6,
    paddingRight: 8,
  },
  teamCountRow: {
    flexDirection: "row",
    gap: 6,
  },
  setBar: {
    minHeight: 44,
    borderRadius: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  setLabel: {
    fontSize: 20,
    fontWeight: "900",
    marginRight: 6,
  },
  setDot: {
    width: 22,
    height: 22,
    borderRadius: 99,
    borderWidth: 1,
  },
  teamRow: {
    flexDirection: "row",
    gap: 8,
  },
  teamPanel: {
    flex: 1,
    minHeight: 430,
    justifyContent: "space-between",
    padding: 12,
    gap: 8,
  },
  teamNameWrap: {
    borderRadius: 12,
    minHeight: 56,
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  teamNameInput: {
    color: "#fff",
    fontSize: 24,
    fontWeight: "900",
  },
  scoreText: {
    fontSize: 104,
    fontWeight: "900",
    textAlign: "center",
    letterSpacing: -2,
  },
  scoreButtons: {
    flexDirection: "row",
    gap: 6,
  },
  scoreButton: {
    flex: 1,
    minHeight: 64,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  scoreButtonText: {
    fontSize: 30,
    fontWeight: "900",
  },
  counterRow: {
    flexDirection: "row",
    gap: 6,
  },
  counterBox: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    minHeight: 86,
    padding: 6,
    gap: 4,
  },
  counterLabel: {
    fontSize: 16,
    fontWeight: "700",
    textAlign: "center",
  },
  counterControls: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 10,
  },
  counterButton: {
    width: 40,
    height: 40,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  counterButtonText: {
    fontSize: 24,
    fontWeight: "900",
  },
  counterValue: {
    fontSize: 30,
    fontWeight: "900",
    minWidth: 34,
    textAlign: "center",
  },
  setWinButton: {
    minHeight: 56,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  setWinText: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "900",
  },
});
