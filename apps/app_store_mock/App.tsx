import { StatusBar } from "expo-status-bar";
import type { ImageSourcePropType } from "react-native";
import {
  Alert,
  Dimensions,
  Image,
  LogBox,
  NativeModules,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

type StoreApp = {
  packageName: string;
  name: string;
  description: string;
  rating: string;
  installs: string;
  image: ImageSourcePropType;
  launchComponent?: string;
};

const APP_DATA: StoreApp[] = [
  {
    packageName: "com.sistrun.standhold",
    name: "SISTRUN FIT",
    description: "전신 운동 루틴을 안내하고 실시간 자세 피드백을 제공합니다.",
    rating: "4.9★",
    installs: "2.8만",
    image: require("./assets/mock/fit.jpeg"),
  },
  {
    packageName: "com.sistrun.dance",
    name: "SISTRUN DANCE",
    description: "댄스 챌린지 기반 유산소 트레이닝으로 재미있게 운동하세요.",
    rating: "4.7★",
    installs: "1.6만",
    image: require("./assets/mock/dance.jpeg"),
  },
  {
    packageName: "com.yourcompany.peboard",
    name: "PE BOARD",
    description: "체육 수업용 타이머, 점수판, 사운드 도구를 한 번에 실행합니다.",
    rating: "4.8★",
    installs: "9.3천",
    image: require("./assets/mock/pe_board.jpeg"),
    launchComponent: "com.yourcompany.peboard/.MainActivity",
  },
  {
    packageName: "com.sistrun.volleyball",
    name: "VOLLEYBALL SCOREBOARD",
    description: "배구 스코어 보드를 실행하는 앱입니다.",
    rating: "4.6★",
    installs: "7.9천",
    image: require("./assets/mock/volleyball.jpeg"),
    launchComponent: "com.sistrun.volleyball/.MainActivity",
  },
  {
    packageName: "com.sistrun.integratetest",
    name: "INTEGRATE TEST",
    description: "스쿼트/멀리뛰기 측정 연동과 측정값 표시를 확인하는 테스트 앱입니다.",
    rating: "4.5★",
    installs: "5.1천",
    image: require("./assets/mock/test.jpeg"),
  },
  {
    packageName: "com.example.fluttter_data_park",
    name: "SISTRUN PAPS",
    description: "PAPS 측정 어플리케이션입니다.",
    rating: "4.4★",
    installs: "4.8천",
    image: require("./assets/mock/test.jpeg"),
  },
];

const { width } = Dimensions.get("window");
const GRID_GAP = 12;
const CARD_WIDTH = (width - 36 - GRID_GAP) / 2;
const PREVIEW_HEIGHT = Math.max(120, Math.min(220, CARD_WIDTH * 0.45));

LogBox.ignoreLogs(["SafeAreaView has been deprecated"]);

type AppLauncherNativeModule = {
  open: (componentName: string) => Promise<boolean>;
};

export default function App() {
  const featuredApps = APP_DATA.slice(0, 2);
  const listApps = APP_DATA.slice(2);
  const appLauncher = NativeModules.AppLauncher as AppLauncherNativeModule | undefined;

  const handleActionPress = async (app: StoreApp) => {
    if (!app.launchComponent) {
      return;
    }

    if (Platform.OS !== "android" || !appLauncher?.open) {
      Alert.alert("실행 불가", "Android 기기에서만 앱 열기를 지원합니다.");
      return;
    }

    try {
      await appLauncher.open(app.launchComponent);
    } catch (_error) {
      Alert.alert("실행 실패", `${app.name} 앱을 열 수 없습니다.`);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.headerRow}>
          <View style={styles.filterChip}>
            <Text style={styles.filterText}>필터</Text>
          </View>
          <View style={styles.searchBox}>
            <Text style={styles.searchText}>앱, 게임, 카테고리 검색</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>추천 앱</Text>
        <View style={styles.gridRow}>
          {featuredApps.map((app) => (
            <View key={app.packageName} style={[styles.featuredCard, { width: CARD_WIDTH }]}>
              <View style={styles.topRow}>
                <Image source={app.image} style={styles.appIcon} />
                <View style={styles.metaBox}>
                  <Text style={styles.appName}>{app.name}</Text>
                  <Text numberOfLines={1} style={styles.appDescription}>
                    {app.description}
                  </Text>
                  <Text style={styles.ratingText}>
                    {app.rating} · {app.installs}
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.getButton}
                  activeOpacity={0.9}
                  onPress={() => {
                    void handleActionPress(app);
                  }}
                >
                  <Text style={styles.getText}>{app.launchComponent ? "열기" : "받기"}</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.previewRow}>
                <Image source={app.image} style={[styles.previewShot, { height: PREVIEW_HEIGHT }]} />
                <Image source={app.image} style={[styles.previewShot, { height: PREVIEW_HEIGHT }]} />
              </View>
            </View>
          ))}
        </View>

        <Text style={styles.sectionTitle}>앱 리스트</Text>
        <View style={styles.gridRow}>
          {listApps.map((app) => (
            <View key={app.packageName} style={[styles.listCard, { width: CARD_WIDTH }]}>
              <View style={styles.topRow}>
                <Image source={app.image} style={styles.appIcon} />
                <View style={styles.metaBox}>
                  <Text style={styles.appName}>{app.name}</Text>
                  <Text numberOfLines={1} style={styles.appDescription}>
                    {app.description}
                  </Text>
                  <Text style={styles.ratingText}>
                    {app.rating} · {app.installs}
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.getButton}
                  activeOpacity={0.9}
                  onPress={() => {
                    void handleActionPress(app);
                  }}
                >
                  <Text style={styles.getText}>{app.launchComponent ? "열기" : "받기"}</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.previewRow}>
                <Image source={app.image} style={[styles.previewShot, { height: PREVIEW_HEIGHT }]} />
                <Image source={app.image} style={[styles.previewShot, { height: PREVIEW_HEIGHT }]} />
              </View>
            </View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#06070b",
  },
  content: {
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 36,
    gap: 16,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  filterChip: {
    backgroundColor: "#171a22",
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: "#2a3141",
  },
  filterText: {
    color: "#e2e8f0",
    fontSize: 15,
    fontWeight: "700",
  },
  searchBox: {
    flex: 1,
    backgroundColor: "#0f1118",
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#2a3141",
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  searchText: {
    color: "#97a3b6",
    fontSize: 15,
    fontWeight: "500",
  },
  sectionTitle: {
    color: "#eff4ff",
    fontSize: 24,
    fontWeight: "800",
    marginTop: 4,
  },
  gridRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: GRID_GAP,
  },
  featuredCard: {
    backgroundColor: "#111722",
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "#243042",
    padding: 14,
    gap: 14,
  },
  listCard: {
    backgroundColor: "#0c1017",
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "#1e2939",
    padding: 14,
    gap: 14,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  appIcon: {
    width: 64,
    height: 64,
    borderRadius: 16,
  },
  metaBox: {
    flex: 1,
    gap: 4,
  },
  appName: {
    color: "#f7faff",
    fontSize: 17,
    fontWeight: "800",
  },
  appDescription: {
    color: "#b4c1d7",
    fontSize: 12,
  },
  ratingText: {
    color: "#8d9bb2",
    fontSize: 12,
    fontWeight: "600",
  },
  getButton: {
    backgroundColor: "#0f1726",
    borderRadius: 18,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: "#2e3f59",
  },
  getText: {
    color: "#26a9ff",
    fontSize: 14,
    fontWeight: "800",
  },
  previewRow: {
    flexDirection: "row",
    gap: 10,
  },
  previewShot: {
    flex: 1,
    borderRadius: 16,
  },
});
