import { MaterialIcons } from "@expo/vector-icons";
import { Modal, Pressable, StyleSheet, Switch, Text, View } from "react-native";
import { getTheme } from "../theme";
import { SettingsState } from "../types/app";

interface SettingsModalProps {
  visible: boolean;
  settings: SettingsState;
  darkMode: boolean;
  timerPresetCount: number;
  scorePresetCount: number;
  templateCount: number;
  onClose: () => void;
  onUpdateSettings: (partial: Partial<SettingsState>) => void;
  onResetAllData: () => void;
}

const Row = ({
  label,
  value,
  onToggle,
  darkMode,
}: {
  label: string;
  value: boolean;
  onToggle: (value: boolean) => void;
  darkMode: boolean;
}) => {
  const theme = getTheme(darkMode);
  return (
    <View style={[styles.row, { borderColor: theme.border, backgroundColor: theme.surface }]}> 
      <Text style={[styles.rowLabel, { color: theme.text }]}>{label}</Text>
      <Switch value={value} onValueChange={onToggle} trackColor={{ true: theme.primary }} />
    </View>
  );
};

export const SettingsModal = ({
  visible,
  settings,
  darkMode,
  timerPresetCount,
  scorePresetCount,
  templateCount,
  onClose,
  onUpdateSettings,
  onResetAllData,
}: SettingsModalProps) => {
  const theme = getTheme(darkMode);

  return (
    <Modal animationType="fade" visible={visible} transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.modalCard, { backgroundColor: theme.bgAlt, borderColor: theme.border }]}> 
          <View style={styles.header}>
            <View style={styles.titleWrap}>
              <MaterialIcons name="settings" size={34} color={theme.primary} />
              <Text style={[styles.title, { color: theme.text }]}>설정</Text>
            </View>
            <Pressable onPress={onClose} style={[styles.closeButton, { backgroundColor: theme.surface, borderColor: theme.border }]}> 
              <MaterialIcons name="close" size={34} color={theme.text} />
            </Pressable>
          </View>

          <View style={styles.section}>
            <Row
              label="사운드 사용"
              value={settings.soundEnabled}
              darkMode={darkMode}
              onToggle={(value) => onUpdateSettings({ soundEnabled: value })}
            />
            <Row
              label="화면 항상 켜짐"
              value={settings.keepAwake}
              darkMode={darkMode}
              onToggle={(value) => onUpdateSettings({ keepAwake: value })}
            />
            <Row
              label="다크 모드"
              value={settings.darkMode}
              darkMode={darkMode}
              onToggle={(value) => onUpdateSettings({ darkMode: value })}
            />
            <Row
              label="풀스크린/키오스크"
              value={settings.fullscreen}
              darkMode={darkMode}
              onToggle={(value) => onUpdateSettings({ fullscreen: value })}
            />
            <Row
              label="마지막 카운트다운 음성"
              value={settings.voiceCountdown}
              darkMode={darkMode}
              onToggle={(value) => onUpdateSettings({ voiceCountdown: value })}
            />
          </View>

          <View style={[styles.volumeCard, { borderColor: theme.border, backgroundColor: theme.surface }]}> 
            <Text style={[styles.volumeTitle, { color: theme.text }]}>볼륨 {Math.round(settings.masterVolume * 100)}%</Text>
            <View style={styles.volumeControls}>
              <Pressable
                style={[styles.volumeButton, { backgroundColor: theme.bgAlt, borderColor: theme.border }]}
                onPress={() => onUpdateSettings({ masterVolume: Math.max(0, settings.masterVolume - 0.05) })}
              >
                <MaterialIcons name="remove" size={34} color={theme.text} />
              </Pressable>
              <View style={[styles.volumeBar, { borderColor: theme.border }]}> 
                <View style={[styles.volumeFill, { width: `${settings.masterVolume * 100}%`, backgroundColor: theme.primary }]} />
              </View>
              <Pressable
                style={[styles.volumeButton, { backgroundColor: theme.bgAlt, borderColor: theme.border }]}
                onPress={() => onUpdateSettings({ masterVolume: Math.min(1, settings.masterVolume + 0.05) })}
              >
                <MaterialIcons name="add" size={34} color={theme.text} />
              </Pressable>
            </View>
            <View style={styles.countdownModeWrap}>
              <Text style={[styles.smallMuted, { color: theme.mutedText }]}>카운트다운 길이</Text>
              <View style={styles.modeButtons}>
                <Pressable
                  onPress={() => onUpdateSettings({ voiceCountdownLength: 3 })}
                  style={[
                    styles.modeButton,
                    {
                      borderColor: theme.border,
                      backgroundColor: settings.voiceCountdownLength === 3 ? theme.primary : theme.bgAlt,
                    },
                  ]}
                >
                  <Text style={[styles.modeButtonText, { color: settings.voiceCountdownLength === 3 ? "#fff" : theme.text }]}>3..1</Text>
                </Pressable>
                <Pressable
                  onPress={() => onUpdateSettings({ voiceCountdownLength: 5 })}
                  style={[
                    styles.modeButton,
                    {
                      borderColor: theme.border,
                      backgroundColor: settings.voiceCountdownLength === 5 ? theme.primary : theme.bgAlt,
                    },
                  ]}
                >
                  <Text style={[styles.modeButtonText, { color: settings.voiceCountdownLength === 5 ? "#fff" : theme.text }]}>5..1</Text>
                </Pressable>
              </View>
            </View>
          </View>

          <View style={[styles.metaRow, { borderColor: theme.border, backgroundColor: theme.surface }]}> 
            <Text style={[styles.metaText, { color: theme.text }]}>타이머 프리셋 {timerPresetCount}개</Text>
            <Text style={[styles.metaText, { color: theme.text }]}>점수판 프리셋 {scorePresetCount}개</Text>
            <Text style={[styles.metaText, { color: theme.text }]}>템플릿 {templateCount}개</Text>
          </View>

          <Pressable style={[styles.resetButton, { backgroundColor: theme.danger }]} onPress={onResetAllData}>
            <MaterialIcons name="delete-forever" size={34} color="#ffffff" />
            <Text style={styles.resetLabel}>앱 데이터 전체 초기화</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  modalCard: {
    width: "100%",
    maxWidth: 980,
    borderRadius: 22,
    borderWidth: 1,
    padding: 20,
    gap: 14,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  titleWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  title: {
    fontSize: 34,
    fontWeight: "900",
  },
  closeButton: {
    width: 66,
    height: 66,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  section: {
    gap: 10,
  },
  row: {
    minHeight: 64,
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "space-between",
    flexDirection: "row",
  },
  rowLabel: {
    fontSize: 23,
    fontWeight: "800",
  },
  volumeCard: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    gap: 12,
  },
  volumeTitle: {
    fontSize: 22,
    fontWeight: "900",
  },
  volumeControls: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  volumeButton: {
    width: 68,
    height: 68,
    borderWidth: 1,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  volumeBar: {
    flex: 1,
    height: 24,
    borderRadius: 99,
    borderWidth: 1,
    overflow: "hidden",
    backgroundColor: "rgba(0,0,0,0.2)",
  },
  volumeFill: {
    height: "100%",
  },
  countdownModeWrap: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  smallMuted: {
    fontSize: 16,
    fontWeight: "700",
  },
  modeButtons: {
    flexDirection: "row",
    gap: 8,
  },
  modeButton: {
    minWidth: 90,
    minHeight: 54,
    borderWidth: 1,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 8,
  },
  modeButtonText: {
    fontSize: 19,
    fontWeight: "900",
  },
  metaRow: {
    borderWidth: 1,
    borderRadius: 14,
    minHeight: 64,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  metaText: {
    fontSize: 19,
    fontWeight: "700",
  },
  resetButton: {
    minHeight: 72,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
  },
  resetLabel: {
    color: "#ffffff",
    fontSize: 24,
    fontWeight: "900",
  },
});
