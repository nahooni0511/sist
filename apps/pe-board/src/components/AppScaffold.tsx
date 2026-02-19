import { MaterialIcons } from "@expo/vector-icons";
import { useEffect, useMemo, useState } from "react";
import {
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from "react-native";
import { TAB_ITEMS } from "../data/defaults";
import { getTheme } from "../theme";
import { MainTab } from "../types/app";
import { formatClock } from "../utils/time";

interface AppScaffoldProps {
  title: string;
  subtitle?: string;
  tab: MainTab;
  darkMode: boolean;
  fullscreen: boolean;
  onTabPress: (tab: MainTab) => void;
  onBackPress: () => void;
  onOpenSettings: () => void;
  children: React.ReactNode;
  contentContainerStyle?: ViewStyle;
}

const TAB_ICONS: Record<MainTab, keyof typeof MaterialIcons.glyphMap> = {
  home: "home",
  timer: "timer",
  teams: "groups",
  scoreboard: "scoreboard",
  sounds: "volume-up",
  templates: "assignment",
};

export const AppScaffold = ({
  title,
  subtitle,
  tab,
  darkMode,
  fullscreen,
  onTabPress,
  onBackPress,
  onOpenSettings,
  children,
  contentContainerStyle,
}: AppScaffoldProps) => {
  const theme = useMemo(() => getTheme(darkMode), [darkMode]);
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <View style={[styles.safeArea, { backgroundColor: theme.bg }]}> 
      <StatusBar hidden={fullscreen} translucent barStyle={darkMode ? "light-content" : "dark-content"} />

      <View style={[styles.topBar, { backgroundColor: theme.bgAlt, borderBottomColor: theme.border }]}> 
        <View style={styles.brandWrap}>
          <View style={[styles.logoBox, { backgroundColor: theme.primary }]}> 
            <MaterialIcons name="sports-handball" size={30} color="#ffffff" />
          </View>
          <View>
            <Text style={[styles.brandTitle, { color: theme.text }]}>PE Board</Text>
            {subtitle ? <Text style={[styles.brandSubTitle, { color: theme.mutedText }]}>{subtitle}</Text> : null}
          </View>
        </View>

        <View style={styles.clockWrap}>
          <Text style={[styles.clockText, { color: theme.primary }]}>{formatClock(now)}</Text>
          <Text style={[styles.screenTitle, { color: theme.text }]}>{title}</Text>
        </View>

        <View style={styles.topRightWrap}>
          <Pressable
            accessibilityLabel="뒤로가기"
            onPress={onBackPress}
            style={[styles.topIconButton, { borderColor: theme.border, backgroundColor: theme.surface }]}
          >
            <MaterialIcons name="arrow-back" size={36} color={theme.text} />
          </Pressable>

          <Pressable
            accessibilityLabel="설정"
            onPress={onOpenSettings}
            style={[styles.topIconButton, { borderColor: theme.border, backgroundColor: theme.surface }]}
          >
            <MaterialIcons name="settings" size={36} color={theme.text} />
          </Pressable>
        </View>
      </View>

      <ScrollView
        key={tab}
        contentContainerStyle={[styles.contentWrap, contentContainerStyle]}
        style={{ flex: 1, backgroundColor: theme.bg }}
        horizontal={false}
        showsVerticalScrollIndicator={false}
      >
        {children}
      </ScrollView>

      <View style={[styles.bottomTab, { borderTopColor: theme.border, backgroundColor: theme.bgAlt }]}> 
        {TAB_ITEMS.map((item) => {
          const active = item.key === tab;
          return (
            <Pressable
              key={item.key}
              accessibilityLabel={item.label}
              onPress={() => onTabPress(item.key)}
              style={[
                styles.tabButton,
                {
                  backgroundColor: active ? theme.primary : theme.surface,
                  borderColor: active ? theme.primary : theme.border,
                },
              ]}
            >
              <MaterialIcons name={TAB_ICONS[item.key]} size={30} color={active ? "#ffffff" : theme.tabInactive} />
              <Text style={[styles.tabLabel, { color: active ? "#ffffff" : theme.tabInactive }]}>{item.shortLabel}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
};

export const Panel = ({
  children,
  darkMode,
  style,
}: {
  children: React.ReactNode;
  darkMode: boolean;
  style?: ViewStyle;
}) => {
  const theme = getTheme(darkMode);
  return (
    <View style={[styles.panel, { backgroundColor: theme.panel, borderColor: theme.border }, style]}>{children}</View>
  );
};

export const ActionChip = ({
  label,
  active,
  onPress,
  darkMode,
}: {
  label: string;
  active?: boolean;
  onPress: () => void;
  darkMode: boolean;
}) => {
  const theme = getTheme(darkMode);
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.chip,
        {
          backgroundColor: active ? theme.primary : theme.surface,
          borderColor: active ? theme.primary : theme.border,
        },
      ]}
    >
      <Text style={[styles.chipText, { color: active ? "#ffffff" : theme.text }]}>{label}</Text>
    </Pressable>
  );
};

export const BigActionButton = ({
  label,
  icon,
  onPress,
  darkMode,
  color,
}: {
  label: string;
  icon: keyof typeof MaterialIcons.glyphMap;
  onPress: () => void;
  darkMode: boolean;
  color?: string;
}) => {
  const theme = getTheme(darkMode);
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.bigActionButton,
        {
          borderColor: theme.border,
          backgroundColor: color ?? theme.surface,
        },
      ]}
    >
      <MaterialIcons name={icon} size={40} color={theme.text} />
      <Text style={[styles.bigActionLabel, { color: theme.text }]}>{label}</Text>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  topBar: {
    minHeight: 98,
    borderBottomWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 24,
    paddingVertical: 8,
    gap: 12,
  },
  brandWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minWidth: 260,
  },
  logoBox: {
    width: 54,
    height: 54,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  brandTitle: {
    fontSize: 30,
    fontWeight: "900",
    letterSpacing: 0.2,
  },
  brandSubTitle: {
    fontSize: 16,
    fontWeight: "700",
  },
  clockWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  clockText: {
    fontSize: 36,
    fontWeight: "900",
  },
  screenTitle: {
    fontSize: 18,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  topRightWrap: {
    minWidth: 170,
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    gap: 8,
  },
  topIconButton: {
    width: 70,
    height: 70,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  contentWrap: {
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 16,
    gap: 16,
  },
  bottomTab: {
    minHeight: 96,
    borderTopWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    gap: 10,
  },
  tabButton: {
    flex: 1,
    minHeight: 72,
    borderRadius: 16,
    borderWidth: 2,
    justifyContent: "center",
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
  },
  tabLabel: {
    fontSize: 22,
    fontWeight: "900",
  },
  panel: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 16,
    gap: 10,
  },
  chip: {
    minHeight: 64,
    borderWidth: 2,
    borderRadius: 14,
    paddingHorizontal: 20,
    justifyContent: "center",
    alignItems: "center",
  },
  chipText: {
    fontSize: 20,
    fontWeight: "900",
  },
  bigActionButton: {
    minHeight: 90,
    borderWidth: 2,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: 10,
  },
  bigActionLabel: {
    fontSize: 22,
    fontWeight: "900",
  },
});
