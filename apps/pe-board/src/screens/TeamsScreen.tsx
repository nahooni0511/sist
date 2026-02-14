import { MaterialIcons } from "@expo/vector-icons";
import { useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { ActionChip, Panel } from "../components/AppScaffold";
import { useAppContext } from "../context/AppContext";
import { TeamHistoryEntry, TeamCard } from "../types/app";
import { generateBalancedTeams, parseRosterInput, pickRandomNumber } from "../utils/random";
import { clamp } from "../utils/time";

export const TeamsScreen = () => {
  const { state, actions, theme } = useAppContext();
  const [mode, setMode] = useState<"teams" | "draw">("teams");

  const [studentCount, setStudentCount] = useState(24);
  const [teamCount, setTeamCount] = useState(4);
  const [rosterText, setRosterText] = useState("");
  const [balanceGender, setBalanceGender] = useState(false);
  const [balanceLevel, setBalanceLevel] = useState(false);
  const [avoidRepeatPairs, setAvoidRepeatPairs] = useState(true);
  const [teams, setTeams] = useState<TeamCard[]>([]);
  const [pinnedMap, setPinnedMap] = useState<Record<string, number>>({});
  const [localHistory, setLocalHistory] = useState<TeamHistoryEntry[]>([]);

  const [drawMax, setDrawMax] = useState(24);
  const [drawnNumber, setDrawnNumber] = useState<number | null>(null);
  const [drawAnimating, setDrawAnimating] = useState(false);
  const drawTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const allHistory = useMemo(() => [...localHistory, ...state.teamHistory], [localHistory, state.teamHistory]);

  const createTeams = () => {
    const students = parseRosterInput(rosterText, studentCount);
    const result = generateBalancedTeams({
      students,
      teamCount,
      history: allHistory.slice(0, 20),
      balanceGender,
      balanceLevel,
      avoidRepeatPairs,
      pinnedTeamByStudentId: pinnedMap,
    });
    setTeams(result);

    const historyItem: TeamHistoryEntry = {
      id: `local-${Date.now()}`,
      createdAt: Date.now(),
      teams: result.map((team) => team.members.map((member) => member.name)),
    };
    setLocalHistory((prev) => [historyItem, ...prev].slice(0, 20));
  };

  const saveHistory = () => {
    if (teams.length === 0) {
      return;
    }
    actions.recordTeamHistory(teams.map((team) => team.members.map((member) => member.name)));
  };

  const shuffleAgain = () => {
    createTeams();
  };

  const togglePin = (studentId: string, teamIndex: number) => {
    setPinnedMap((prev) => {
      if (prev[studentId] === teamIndex) {
        const { [studentId]: _removed, ...rest } = prev;
        return rest;
      }
      return {
        ...prev,
        [studentId]: teamIndex,
      };
    });
  };

  const startDraw = () => {
    if (drawAnimating) {
      return;
    }
    if (drawTimerRef.current) {
      clearInterval(drawTimerRef.current);
    }

    setDrawAnimating(true);
    let ticks = 0;
    drawTimerRef.current = setInterval(() => {
      ticks += 1;
      setDrawnNumber(pickRandomNumber(drawMax));
      if (ticks >= 16) {
        if (drawTimerRef.current) {
          clearInterval(drawTimerRef.current);
        }
        setDrawnNumber(pickRandomNumber(drawMax));
        setDrawAnimating(false);
      }
    }, 80);
  };

  return (
    <View style={styles.container}>
      <View style={styles.modeRow}>
        <ActionChip label="팀 편성" active={mode === "teams"} onPress={() => setMode("teams")} darkMode={state.settings.darkMode} />
        <ActionChip label="번호 뽑기" active={mode === "draw"} onPress={() => setMode("draw")} darkMode={state.settings.darkMode} />
      </View>

      {mode === "teams" ? (
        <View style={styles.contentRow}>
          <Panel darkMode={state.settings.darkMode} style={styles.leftPanel}>
            <Text style={[styles.title, { color: theme.text }]}>입력</Text>

            <View style={styles.inputRow}>
              <Text style={[styles.label, { color: theme.mutedText }]}>학생 수</Text>
              <View style={styles.stepperRow}>
                <Pressable
                  style={[styles.circleButton, { borderColor: theme.border, backgroundColor: theme.bgAlt }]}
                  onPress={() => setStudentCount((prev) => clamp(prev - 1, 2, 80))}
                >
                  <MaterialIcons name="remove" size={34} color={theme.text} />
                </Pressable>
                <Text style={[styles.bigValue, { color: theme.text }]}>{studentCount}</Text>
                <Pressable
                  style={[styles.circleButton, { borderColor: theme.border, backgroundColor: theme.bgAlt }]}
                  onPress={() => setStudentCount((prev) => clamp(prev + 1, 2, 80))}
                >
                  <MaterialIcons name="add" size={34} color={theme.text} />
                </Pressable>
              </View>
            </View>

            <View style={styles.inputRow}>
              <Text style={[styles.label, { color: theme.mutedText }]}>팀 수 (2~6)</Text>
              <View style={styles.stepperRow}>
                <Pressable
                  style={[styles.circleButton, { borderColor: theme.border, backgroundColor: theme.bgAlt }]}
                  onPress={() => setTeamCount((prev) => clamp(prev - 1, 2, 6))}
                >
                  <MaterialIcons name="remove" size={34} color={theme.text} />
                </Pressable>
                <Text style={[styles.bigValue, { color: theme.text }]}>{teamCount}</Text>
                <Pressable
                  style={[styles.circleButton, { borderColor: theme.border, backgroundColor: theme.bgAlt }]}
                  onPress={() => setTeamCount((prev) => clamp(prev + 1, 2, 6))}
                >
                  <MaterialIcons name="add" size={34} color={theme.text} />
                </Pressable>
              </View>
            </View>

            <Text style={[styles.label, { color: theme.mutedText }]}>명단(선택): 이름,성별(M/F),레벨(숫자)</Text>
            <TextInput
              value={rosterText}
              onChangeText={setRosterText}
              multiline
              placeholder="예) 홍길동,M,3"
              placeholderTextColor={theme.mutedText}
              style={[styles.rosterInput, { color: theme.text, borderColor: theme.border, backgroundColor: theme.surface }]}
            />

            <View style={styles.toggleGrid}>
              <ActionChip label={`성별 균형 ${balanceGender ? "ON" : "OFF"}`} active={balanceGender} onPress={() => setBalanceGender((prev) => !prev)} darkMode={state.settings.darkMode} />
              <ActionChip label={`레벨 균형 ${balanceLevel ? "ON" : "OFF"}`} active={balanceLevel} onPress={() => setBalanceLevel((prev) => !prev)} darkMode={state.settings.darkMode} />
              <ActionChip label={`중복 최소화 ${avoidRepeatPairs ? "ON" : "OFF"}`} active={avoidRepeatPairs} onPress={() => setAvoidRepeatPairs((prev) => !prev)} darkMode={state.settings.darkMode} />
            </View>

            <Pressable onPress={createTeams} style={[styles.generateButton, { backgroundColor: theme.primary }]}> 
              <MaterialIcons name="shuffle" size={36} color="#fff" />
              <Text style={styles.generateText}>팀 만들기</Text>
            </Pressable>
          </Panel>

          <Panel darkMode={state.settings.darkMode} style={styles.rightPanel}>
            <View style={styles.resultHeader}>
              <Text style={[styles.title, { color: theme.text }]}>결과</Text>
              <View style={styles.resultActions}>
                <Pressable onPress={shuffleAgain} style={[styles.resultButton, { backgroundColor: theme.surface, borderColor: theme.border }]}> 
                  <Text style={[styles.resultButtonText, { color: theme.text }]}>다시 섞기</Text>
                </Pressable>
                <Pressable onPress={saveHistory} style={[styles.resultButton, { backgroundColor: theme.primary }]}> 
                  <Text style={[styles.resultButtonText, { color: "#fff" }]}>저장</Text>
                </Pressable>
              </View>
            </View>

            <ScrollView style={styles.teamScroll} contentContainerStyle={styles.teamGrid}>
              {teams.length === 0 ? (
                <Text style={[styles.emptyText, { color: theme.mutedText }]}>팀 만들기를 눌러 결과를 생성하세요.</Text>
              ) : (
                teams.map((team, teamIndex) => (
                  <View key={team.id} style={[styles.teamCard, { borderColor: theme.border, backgroundColor: theme.bgAlt }]}> 
                    <View style={[styles.teamTitleWrap, { backgroundColor: team.color }]}>
                      <Text style={styles.teamTitle}>{team.name}</Text>
                    </View>
                    <View style={styles.memberList}>
                      {team.members.map((member) => {
                        const pinned = pinnedMap[member.id] === teamIndex;
                        return (
                          <Pressable
                            key={member.id}
                            onPress={() => togglePin(member.id, teamIndex)}
                            style={[styles.memberRow, { borderColor: theme.border, backgroundColor: pinned ? theme.primary : theme.surface }]}
                          >
                            <Text style={[styles.memberText, { color: pinned ? "#fff" : theme.text }]} numberOfLines={1}>
                              {member.name}
                            </Text>
                            <MaterialIcons name={pinned ? "push-pin" : "push-pin"} size={22} color={pinned ? "#fff" : theme.mutedText} />
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>
                ))
              )}
            </ScrollView>
          </Panel>
        </View>
      ) : (
        <Panel darkMode={state.settings.darkMode} style={styles.drawPanel}>
          <Text style={[styles.title, { color: theme.text }]}>번호 뽑기</Text>
          <Text style={[styles.label, { color: theme.mutedText }]}>1 ~ N 범위에서 랜덤 추출</Text>

          <View style={styles.drawControls}>
            <Pressable
              style={[styles.circleButton, { borderColor: theme.border, backgroundColor: theme.bgAlt }]}
              onPress={() => setDrawMax((prev) => clamp(prev - 1, 2, 200))}
            >
              <MaterialIcons name="remove" size={34} color={theme.text} />
            </Pressable>
            <Text style={[styles.drawN, { color: theme.text }]}>N = {drawMax}</Text>
            <Pressable
              style={[styles.circleButton, { borderColor: theme.border, backgroundColor: theme.bgAlt }]}
              onPress={() => setDrawMax((prev) => clamp(prev + 1, 2, 200))}
            >
              <MaterialIcons name="add" size={34} color={theme.text} />
            </Pressable>
          </View>

          <View style={[styles.drawResult, { borderColor: theme.border, backgroundColor: theme.surface }]}> 
            <Text style={[styles.drawNumber, { color: drawAnimating ? theme.warning : theme.text }]}>
              {drawnNumber ?? "-"}
            </Text>
          </View>

          <Pressable onPress={startDraw} style={[styles.drawButton, { backgroundColor: theme.primary }]}> 
            <MaterialIcons name="casino" size={40} color="#fff" />
            <Text style={styles.drawButtonText}>{drawAnimating ? "추첨 중..." : "번호 뽑기"}</Text>
          </Pressable>
        </Panel>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    gap: 12,
  },
  modeRow: {
    flexDirection: "row",
    gap: 8,
  },
  contentRow: {
    flexDirection: "row",
    gap: 10,
  },
  leftPanel: {
    flex: 1,
    minHeight: 560,
  },
  rightPanel: {
    flex: 1.6,
    minHeight: 560,
  },
  title: {
    fontSize: 30,
    fontWeight: "900",
  },
  label: {
    fontSize: 18,
    fontWeight: "700",
  },
  inputRow: {
    gap: 6,
  },
  stepperRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  circleButton: {
    width: 68,
    height: 68,
    borderRadius: 16,
    borderWidth: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  bigValue: {
    fontSize: 62,
    fontWeight: "900",
    minWidth: 90,
    textAlign: "center",
  },
  rosterInput: {
    minHeight: 130,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 20,
    fontWeight: "600",
    textAlignVertical: "top",
  },
  toggleGrid: {
    gap: 8,
  },
  generateButton: {
    minHeight: 74,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
  },
  generateText: {
    color: "#fff",
    fontSize: 30,
    fontWeight: "900",
  },
  resultHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  resultActions: {
    flexDirection: "row",
    gap: 8,
  },
  resultButton: {
    minHeight: 58,
    minWidth: 130,
    borderRadius: 12,
    borderWidth: 2,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 10,
  },
  resultButtonText: {
    fontSize: 20,
    fontWeight: "800",
  },
  teamScroll: {
    flex: 1,
  },
  teamGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  teamCard: {
    width: "49.2%",
    borderRadius: 14,
    borderWidth: 1,
    padding: 8,
    gap: 6,
  },
  teamTitleWrap: {
    borderRadius: 10,
    minHeight: 48,
    justifyContent: "center",
    alignItems: "center",
  },
  teamTitle: {
    color: "#fff",
    fontSize: 24,
    fontWeight: "900",
  },
  memberList: {
    gap: 5,
  },
  memberRow: {
    borderRadius: 10,
    borderWidth: 1,
    minHeight: 46,
    paddingHorizontal: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  memberText: {
    fontSize: 18,
    fontWeight: "700",
    flex: 1,
  },
  emptyText: {
    fontSize: 22,
    fontWeight: "700",
    marginTop: 20,
  },
  drawPanel: {
    minHeight: 560,
    alignItems: "center",
    justifyContent: "center",
    gap: 18,
  },
  drawControls: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  drawN: {
    fontSize: 44,
    fontWeight: "900",
  },
  drawResult: {
    width: "100%",
    maxWidth: 720,
    borderWidth: 2,
    borderRadius: 24,
    minHeight: 260,
    justifyContent: "center",
    alignItems: "center",
  },
  drawNumber: {
    fontSize: 220,
    fontWeight: "900",
    letterSpacing: -4,
  },
  drawButton: {
    minHeight: 88,
    minWidth: 320,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 20,
  },
  drawButtonText: {
    color: "#fff",
    fontSize: 34,
    fontWeight: "900",
  },
});
