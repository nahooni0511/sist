import { MaterialIcons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Panel } from "../components/AppScaffold";
import { useAppContext } from "../context/AppContext";
import { SOUND_BUTTONS, SOUND_LABELS } from "../data/sounds";
import { SoundKey } from "../types/app";

interface SoundScreenProps {
  onPlay: (key: SoundKey) => void;
  onStartLoop: (key: SoundKey) => void;
  onStopLoop: (key: SoundKey) => void;
}

export const SoundScreen = ({ onPlay, onStartLoop, onStopLoop }: SoundScreenProps) => {
  const { state, actions, theme } = useAppContext();

  return (
    <View style={styles.container}>
      <View style={styles.mainRow}>
        <View style={styles.grid}>
          {SOUND_BUTTONS.map((item) => (
            <Pressable
              key={item.key}
              onPress={() => onPlay(item.key)}
              onPressIn={() => {
                if (item.repeatable) {
                  onStartLoop(item.key);
                }
              }}
              onPressOut={() => {
                if (item.repeatable) {
                  onStopLoop(item.key);
                }
              }}
              style={[styles.pad, { backgroundColor: theme.surface, borderColor: theme.border }]}
            >
              <View style={[styles.iconCircle, { backgroundColor: item.accent }]}> 
                <MaterialIcons name={item.icon as keyof typeof MaterialIcons.glyphMap} size={48} color="#fff" />
              </View>
              <Text style={[styles.padTitle, { color: theme.text }]}>{SOUND_LABELS[item.key]}</Text>
              <Text style={[styles.padHint, { color: theme.mutedText }]}>
                {item.repeatable ? "길게 누르면 반복" : "탭해서 재생"}
              </Text>
            </Pressable>
          ))}
        </View>

        <Panel darkMode={state.settings.darkMode} style={styles.sidePanel}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>사운드 설정</Text>

          <Pressable
            style={[styles.testButton, { backgroundColor: theme.primary }]}
            onPress={() => onPlay("confirm")}
          >
            <MaterialIcons name="graphic-eq" size={34} color="#fff" />
            <Text style={styles.testButtonText}>볼륨 테스트</Text>
          </Pressable>

          <View style={[styles.infoCard, { borderColor: theme.border, backgroundColor: theme.surface }]}> 
            <Text style={[styles.infoLabel, { color: theme.mutedText }]}>볼륨</Text>
            <Text style={[styles.infoValue, { color: theme.text }]}>{Math.round(state.settings.masterVolume * 100)}%</Text>
          </View>

          <View style={[styles.infoCard, { borderColor: theme.border, backgroundColor: theme.surface }]}> 
            <Text style={[styles.infoLabel, { color: theme.mutedText }]}>카운트다운</Text>
            <Text style={[styles.infoValue, { color: theme.text }]}> 
              {state.settings.voiceCountdown ? `${state.settings.voiceCountdownLength}..1` : "OFF"}
            </Text>
          </View>

          <Pressable
            onPress={() => actions.updateSettings({ voiceCountdown: !state.settings.voiceCountdown })}
            style={[styles.toggleButton, { backgroundColor: state.settings.voiceCountdown ? theme.primary : theme.bgAlt, borderColor: theme.border }]}
          >
            <Text style={[styles.toggleText, { color: state.settings.voiceCountdown ? "#fff" : theme.text }]}> 
              음성 카운트다운 {state.settings.voiceCountdown ? "끄기" : "켜기"}
            </Text>
          </Pressable>

          <Pressable
            onPress={() => actions.updateSettings({ soundEnabled: !state.settings.soundEnabled })}
            style={[styles.toggleButton, { backgroundColor: state.settings.soundEnabled ? theme.primary : theme.bgAlt, borderColor: theme.border }]}
          >
            <Text style={[styles.toggleText, { color: state.settings.soundEnabled ? "#fff" : theme.text }]}> 
              사운드 {state.settings.soundEnabled ? "ON" : "OFF"}
            </Text>
          </Pressable>
        </Panel>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    gap: 10,
  },
  mainRow: {
    flexDirection: "row",
    gap: 10,
  },
  grid: {
    flex: 3,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  pad: {
    width: "32.7%",
    minHeight: 220,
    borderRadius: 18,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    padding: 10,
  },
  iconCircle: {
    width: 86,
    height: 86,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  padTitle: {
    fontSize: 30,
    fontWeight: "900",
    textAlign: "center",
  },
  padHint: {
    fontSize: 17,
    fontWeight: "700",
  },
  sidePanel: {
    flex: 1,
    minHeight: 470,
  },
  sectionTitle: {
    fontSize: 30,
    fontWeight: "900",
  },
  testButton: {
    minHeight: 74,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  testButtonText: {
    color: "#fff",
    fontSize: 28,
    fontWeight: "900",
  },
  infoCard: {
    borderWidth: 1,
    borderRadius: 14,
    minHeight: 90,
    justifyContent: "center",
    alignItems: "center",
    gap: 2,
  },
  infoLabel: {
    fontSize: 18,
    fontWeight: "700",
  },
  infoValue: {
    fontSize: 34,
    fontWeight: "900",
  },
  toggleButton: {
    minHeight: 64,
    borderRadius: 14,
    borderWidth: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 8,
  },
  toggleText: {
    fontSize: 24,
    fontWeight: "900",
  },
});
