import { MaterialIcons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Panel } from "../components/AppScaffold";
import { useAppContext } from "../context/AppContext";

const QUICK_ACTIONS = [
  { id: "timer", label: "타이머 시작", icon: "timer", tab: "timer" as const },
  { id: "teams", label: "팀 만들기", icon: "groups", tab: "teams" as const },
  { id: "scoreboard", label: "점수판", icon: "scoreboard", tab: "scoreboard" as const },
  { id: "whistle", label: "호루라기", icon: "volume-up", tab: "sounds" as const },
  { id: "template", label: "수업 템플릿 시작", icon: "assignment", tab: "templates" as const },
  { id: "sound", label: "신호음 패드", icon: "campaign", tab: "sounds" as const },
];

export const HomeScreen = () => {
  const { state, actions, theme } = useAppContext();

  return (
    <View style={styles.container}>
      <Text style={[styles.headline, { color: theme.text }]}>수업 운영 올인원</Text>
      <Text style={[styles.subHeadline, { color: theme.mutedText }]}>큰 버튼으로 바로 실행하세요.</Text>

      <View style={styles.grid}>
        {QUICK_ACTIONS.map((item) => (
          <Pressable
            key={item.id}
            onPress={() => actions.setCurrentTab(item.tab)}
            style={[styles.tile, { backgroundColor: theme.surface, borderColor: theme.border }]}
          >
            <MaterialIcons name={item.icon as keyof typeof MaterialIcons.glyphMap} size={54} color={theme.primary} />
            <Text style={[styles.tileLabel, { color: theme.text }]}>{item.label}</Text>
          </Pressable>
        ))}
      </View>

      <Panel darkMode={state.settings.darkMode} style={styles.recentPanel}>
        <View style={styles.panelHeaderRow}>
          <Text style={[styles.panelTitle, { color: theme.text }]}>최근 사용 프리셋</Text>
          <Text style={[styles.panelHint, { color: theme.mutedText }]}>최대 3개</Text>
        </View>
        {state.recentItems.length === 0 ? (
          <Text style={[styles.emptyText, { color: theme.mutedText }]}>아직 최근 사용 기록이 없습니다.</Text>
        ) : (
          state.recentItems.slice(0, 3).map((item) => (
            <Pressable
              key={item.id}
              onPress={() => {
                if (item.type === "timer") {
                  actions.setCurrentTab("timer");
                  actions.selectTimerPreset(item.payloadId);
                } else if (item.type === "scoreboard") {
                  actions.setCurrentTab("scoreboard");
                  actions.setScoreboardPreset(item.payloadId);
                } else {
                  actions.setCurrentTab("templates");
                  actions.startTemplate(item.payloadId);
                }
              }}
              style={[styles.recentCard, { borderColor: theme.border, backgroundColor: theme.bgAlt }]}
            >
              <View style={[styles.recentBadge, { backgroundColor: theme.primary }]}> 
                <Text style={styles.recentBadgeText}>{item.type.toUpperCase()}</Text>
              </View>
              <Text style={[styles.recentText, { color: theme.text }]} numberOfLines={1}>
                {item.label}
              </Text>
            </Pressable>
          ))
        )}
      </Panel>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    gap: 14,
  },
  headline: {
    fontSize: 42,
    fontWeight: "900",
  },
  subHeadline: {
    fontSize: 21,
    fontWeight: "600",
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  tile: {
    width: "32.6%",
    minHeight: 160,
    borderRadius: 20,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
    gap: 8,
  },
  tileLabel: {
    fontSize: 28,
    fontWeight: "900",
    textAlign: "center",
  },
  recentPanel: {
    minHeight: 250,
  },
  panelHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  panelTitle: {
    fontSize: 28,
    fontWeight: "900",
  },
  panelHint: {
    fontSize: 16,
    fontWeight: "700",
  },
  emptyText: {
    fontSize: 19,
    fontWeight: "600",
    marginTop: 10,
  },
  recentCard: {
    minHeight: 66,
    borderWidth: 1,
    borderRadius: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 10,
  },
  recentBadge: {
    borderRadius: 999,
    minWidth: 74,
    minHeight: 36,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 8,
  },
  recentBadgeText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "900",
  },
  recentText: {
    fontSize: 20,
    fontWeight: "700",
    flex: 1,
  },
});
