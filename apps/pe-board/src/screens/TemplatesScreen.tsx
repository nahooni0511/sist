import { MaterialIcons } from "@expo/vector-icons";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Panel } from "../components/AppScaffold";
import { useAppContext } from "../context/AppContext";
import { formatTimer } from "../utils/time";

export const TemplatesScreen = () => {
  const { state, actions, theme } = useAppContext();
  const runner = state.templateRunner;
  const activeTemplate = runner.templateId ? state.templates.find((item) => item.id === runner.templateId) : null;
  const activeStep = activeTemplate?.steps[runner.stepIndex] ?? null;

  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <Panel darkMode={state.settings.darkMode} style={styles.leftPanel}>
          <Text style={[styles.title, { color: theme.text }]}>수업 흐름 템플릿</Text>
          <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.templateList}>
            {state.templates.map((template) => {
              const selected = runner.templateId === template.id;
              return (
                <Pressable
                  key={template.id}
                  style={[
                    styles.templateCard,
                    {
                      borderColor: selected ? theme.primary : theme.border,
                      backgroundColor: selected ? theme.primarySoft : theme.surface,
                    },
                  ]}
                  onPress={() => actions.startTemplate(template.id)}
                >
                  <Text style={[styles.templateName, { color: selected ? "#ffffff" : theme.text }]}>{template.name}</Text>
                  <Text style={[styles.templateDesc, { color: selected ? "#dbeafe" : theme.mutedText }]}>{template.description}</Text>
                  <View style={styles.templateMeta}>
                    <Text style={[styles.metaText, { color: selected ? "#dbeafe" : theme.mutedText }]}>단계 {template.steps.length}</Text>
                    <MaterialIcons name="play-arrow" size={28} color={selected ? "#dbeafe" : theme.primary} />
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>
        </Panel>

        <Panel darkMode={state.settings.darkMode} style={styles.rightPanel}>
          <Text style={[styles.title, { color: theme.text }]}>실행 컨트롤</Text>

          {activeTemplate ? (
            <>
              <View style={[styles.runnerCard, { borderColor: theme.border, backgroundColor: theme.surface }]}> 
                <Text style={[styles.runnerName, { color: theme.text }]}>{activeTemplate.name}</Text>
                <Text style={[styles.runnerStatus, { color: theme.mutedText }]}>상태: {runner.mode}</Text>
                <Text style={[styles.runnerStep, { color: theme.text }]}> 
                  단계 {runner.stepIndex + 1} / {activeTemplate.steps.length}
                </Text>
                <Text style={[styles.runnerStepTitle, { color: theme.primary }]}>{activeStep?.title ?? "완료"}</Text>
                <Text style={[styles.runnerStepDesc, { color: theme.mutedText }]}>{activeStep?.description ?? ""}</Text>
                <Text style={[styles.runnerTimer, { color: theme.text }]}>남은 시간 {formatTimer(runner.stepRemainingSec)}</Text>
              </View>

              <View style={styles.controlGrid}>
                <Pressable onPress={actions.prevTemplateStep} style={[styles.controlButton, { borderColor: theme.border, backgroundColor: theme.surface }]}> 
                  <MaterialIcons name="skip-previous" size={36} color={theme.text} />
                  <Text style={[styles.controlText, { color: theme.text }]}>이전 단계</Text>
                </Pressable>

                {runner.mode === "running" ? (
                  <Pressable onPress={actions.pauseTemplate} style={[styles.controlButton, { borderColor: theme.border, backgroundColor: theme.surface }]}> 
                    <MaterialIcons name="pause" size={36} color={theme.text} />
                    <Text style={[styles.controlText, { color: theme.text }]}>일시정지</Text>
                  </Pressable>
                ) : (
                  <Pressable onPress={actions.resumeTemplate} style={[styles.controlButton, { borderColor: theme.border, backgroundColor: theme.surface }]}> 
                    <MaterialIcons name="play-arrow" size={36} color={theme.text} />
                    <Text style={[styles.controlText, { color: theme.text }]}>재개</Text>
                  </Pressable>
                )}

                <Pressable onPress={actions.nextTemplateStep} style={[styles.controlButton, { borderColor: theme.border, backgroundColor: theme.surface }]}> 
                  <MaterialIcons name="skip-next" size={36} color={theme.text} />
                  <Text style={[styles.controlText, { color: theme.text }]}>다음 단계</Text>
                </Pressable>

                <Pressable onPress={actions.stopTemplate} style={[styles.controlButtonDanger, { backgroundColor: theme.danger }]}> 
                  <MaterialIcons name="stop" size={36} color="#fff" />
                  <Text style={styles.controlTextDanger}>중지</Text>
                </Pressable>
              </View>
            </>
          ) : (
            <View style={[styles.emptyCard, { borderColor: theme.border, backgroundColor: theme.surface }]}> 
              <MaterialIcons name="assignment" size={64} color={theme.primary} />
              <Text style={[styles.emptyText, { color: theme.text }]}>왼쪽 템플릿을 눌러 실행하세요.</Text>
            </View>
          )}

          {activeTemplate ? (
            <Panel darkMode={state.settings.darkMode} style={styles.stepPanel}>
              <Text style={[styles.stepTitle, { color: theme.text }]}>단계 목록</Text>
              {activeTemplate.steps.map((step, idx) => (
                <View
                  key={step.id}
                  style={[
                    styles.stepRow,
                    {
                      borderColor: runner.stepIndex === idx ? theme.primary : theme.border,
                      backgroundColor: runner.stepIndex === idx ? theme.primarySoft : theme.bgAlt,
                    },
                  ]}
                >
                  <Text style={[styles.stepRowTitle, { color: runner.stepIndex === idx ? "#fff" : theme.text }]}>{idx + 1}. {step.title}</Text>
                  <Text style={[styles.stepRowDesc, { color: runner.stepIndex === idx ? "#dbeafe" : theme.mutedText }]}>
                    {step.durationSec > 0 ? `${formatTimer(step.durationSec)}` : "수동 진행"} · {step.targetTab}
                  </Text>
                </View>
              ))}
            </Panel>
          ) : null}
        </Panel>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    gap: 10,
  },
  row: {
    flexDirection: "row",
    gap: 10,
  },
  leftPanel: {
    flex: 1,
    minHeight: 560,
  },
  rightPanel: {
    flex: 1.5,
    minHeight: 560,
  },
  title: {
    fontSize: 30,
    fontWeight: "900",
  },
  templateList: {
    gap: 8,
  },
  templateCard: {
    borderWidth: 2,
    borderRadius: 14,
    padding: 12,
    gap: 6,
  },
  templateName: {
    fontSize: 26,
    fontWeight: "900",
  },
  templateDesc: {
    fontSize: 18,
    fontWeight: "600",
  },
  templateMeta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  metaText: {
    fontSize: 16,
    fontWeight: "700",
  },
  runnerCard: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    gap: 6,
  },
  runnerName: {
    fontSize: 30,
    fontWeight: "900",
  },
  runnerStatus: {
    fontSize: 18,
    fontWeight: "700",
  },
  runnerStep: {
    fontSize: 22,
    fontWeight: "800",
  },
  runnerStepTitle: {
    fontSize: 34,
    fontWeight: "900",
  },
  runnerStepDesc: {
    fontSize: 20,
    fontWeight: "600",
  },
  runnerTimer: {
    fontSize: 28,
    fontWeight: "900",
  },
  controlGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  controlButton: {
    width: "49.2%",
    minHeight: 84,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  controlButtonDanger: {
    width: "49.2%",
    minHeight: 84,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  controlText: {
    fontSize: 24,
    fontWeight: "900",
  },
  controlTextDanger: {
    color: "#fff",
    fontSize: 24,
    fontWeight: "900",
  },
  emptyCard: {
    borderWidth: 1,
    borderRadius: 16,
    minHeight: 220,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  emptyText: {
    fontSize: 24,
    fontWeight: "700",
  },
  stepPanel: {
    gap: 6,
  },
  stepTitle: {
    fontSize: 24,
    fontWeight: "900",
  },
  stepRow: {
    borderWidth: 1,
    borderRadius: 10,
    minHeight: 54,
    justifyContent: "center",
    paddingHorizontal: 10,
  },
  stepRowTitle: {
    fontSize: 20,
    fontWeight: "800",
  },
  stepRowDesc: {
    fontSize: 16,
    fontWeight: "600",
  },
});
