import { useCallback, useEffect } from "react";
import { Alert, BackHandler, LogBox, StyleSheet, View, useWindowDimensions } from "react-native";
import * as NavigationBar from "expo-navigation-bar";
import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";
import * as ScreenOrientation from "expo-screen-orientation";
import { AppScaffold } from "./src/components/AppScaffold";
import { SettingsModal } from "./src/components/SettingsModal";
import { AppProvider, useAppContext } from "./src/context/AppContext";
import { useSoundEngine } from "./src/hooks/useSoundEngine";
import { HomeScreen } from "./src/screens/HomeScreen";
import { ScoreboardScreen } from "./src/screens/ScoreboardScreen";
import { SoundScreen } from "./src/screens/SoundScreen";
import { TeamsScreen } from "./src/screens/TeamsScreen";
import { TemplatesScreen } from "./src/screens/TemplatesScreen";
import { TimerScreen } from "./src/screens/TimerScreen";

const TAB_META = {
  home: { title: "홈 대시보드", subtitle: "즉시 실행" },
  timer: { title: "서킷/스테이션 타이머", subtitle: "준비→운동→휴식" },
  teams: { title: "랜덤 팀편성 / 번호뽑기", subtitle: "균형 + 중복 회피" },
  scoreboard: { title: "스포츠 점수판", subtitle: "Undo + 경기 타이머" },
  sounds: { title: "호루라기/벨/신호음", subtitle: "길게 누르면 반복" },
  templates: { title: "수업 흐름 템플릿", subtitle: "단계 자동 전환" },
};

const COMPACT_WIDTH_BREAKPOINT = 1700;
const COMPACT_UI_SCALE = 0.86;

const Root = () => {
  const { state, actions } = useAppContext();
  const sound = useSoundEngine(state.settings.masterVolume, state.settings.soundEnabled);
  const { width, height } = useWindowDimensions();

  useEffect(() => {
    void ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
  }, []);

  useEffect(() => {
    if (__DEV__) {
      LogBox.ignoreLogs(["[expo-av]: Expo AV has been deprecated and will be removed in SDK 54."]);
    }
  }, []);

  useEffect(() => {
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => true);
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    const applySystemUi = async () => {
      await NavigationBar.setVisibilityAsync(state.settings.fullscreen ? "hidden" : "visible");
      await NavigationBar.setButtonStyleAsync(state.settings.darkMode ? "light" : "dark");
    };
    void applySystemUi();
  }, [state.settings.darkMode, state.settings.fullscreen]);

  useEffect(() => {
    if (state.settings.keepAwake) {
      void activateKeepAwakeAsync("pe-board");
      return;
    }
    deactivateKeepAwake("pe-board");
  }, [state.settings.keepAwake]);

  useEffect(() => {
    if (state.soundQueue.length === 0) {
      return;
    }
    const queue = [...state.soundQueue];
    actions.consumeSoundQueue();
    queue.forEach((key) => {
      void sound.play(key);
    });
  }, [actions, sound, state.soundQueue]);

  const handleResetAll = () => {
    Alert.alert("전체 초기화", "저장된 프리셋/기록을 모두 삭제할까요?", [
      { text: "취소", style: "cancel" },
      {
        text: "삭제",
        style: "destructive",
        onPress: () => {
          void actions.resetAllData();
        },
      },
    ]);
  };

  const handleInAppBack = useCallback(() => {
    if (state.settingsOpen) {
      actions.setSettingsOpen(false);
      return;
    }

    if (state.currentTab !== "home") {
      actions.setCurrentTab("home");
      return;
    }

    BackHandler.exitApp();
  }, [actions, state.currentTab, state.settingsOpen]);

  const activeMeta = TAB_META[state.currentTab];
  const uiScale = width < COMPACT_WIDTH_BREAKPOINT ? COMPACT_UI_SCALE : 1;
  const horizontalOverflow = uiScale < 1 ? (width / uiScale - width) / 2 : 0;
  const verticalOverflow = uiScale < 1 ? (height / uiScale - height) / 2 : 0;

  return (
    <View style={styles.viewport}>
      <View
        style={[
          styles.rootCanvas,
          uiScale < 1
            ? {
                left: -horizontalOverflow,
                top: -verticalOverflow,
                transform: [{ scale: uiScale }],
                width: width / uiScale,
                height: height / uiScale,
              }
            : styles.fullCanvas,
        ]}
      >
        <AppScaffold
          title={activeMeta.title}
          subtitle={activeMeta.subtitle}
          tab={state.currentTab}
          darkMode={state.settings.darkMode}
          fullscreen={state.settings.fullscreen}
          onTabPress={actions.setCurrentTab}
          onBackPress={handleInAppBack}
          onOpenSettings={() => actions.setSettingsOpen(true)}
        >
          {state.currentTab === "home" ? <HomeScreen /> : null}
          {state.currentTab === "timer" ? <TimerScreen /> : null}
          {state.currentTab === "teams" ? <TeamsScreen /> : null}
          {state.currentTab === "scoreboard" ? <ScoreboardScreen /> : null}
          {state.currentTab === "sounds" ? (
            <SoundScreen onPlay={sound.play} onStartLoop={sound.startLoop} onStopLoop={sound.stopLoop} />
          ) : null}
          {state.currentTab === "templates" ? <TemplatesScreen /> : null}
        </AppScaffold>
      </View>

      <SettingsModal
        visible={state.settingsOpen}
        settings={state.settings}
        darkMode={state.settings.darkMode}
        timerPresetCount={state.timerPresets.length}
        scorePresetCount={state.scoreboardPresets.length}
        templateCount={state.templates.length}
        onClose={() => actions.setSettingsOpen(false)}
        onUpdateSettings={actions.updateSettings}
        onResetAllData={handleResetAll}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  viewport: {
    flex: 1,
    overflow: "hidden",
  },
  rootCanvas: {
    position: "absolute",
    left: 0,
    top: 0,
  },
  fullCanvas: {
    width: "100%",
    height: "100%",
  },
});

export default function App() {
  return (
    <AppProvider>
      <Root />
    </AppProvider>
  );
}
