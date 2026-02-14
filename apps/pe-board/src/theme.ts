export interface AppTheme {
  bg: string;
  bgAlt: string;
  surface: string;
  panel: string;
  border: string;
  text: string;
  mutedText: string;
  primary: string;
  primarySoft: string;
  success: string;
  warning: string;
  danger: string;
  tabInactive: string;
}

const darkTheme: AppTheme = {
  bg: "#0a0f14",
  bgAlt: "#101922",
  surface: "#162231",
  panel: "#0f1a27",
  border: "#243547",
  text: "#f3f8ff",
  mutedText: "#9bb0c8",
  primary: "#137fec",
  primarySoft: "#1b4f8f",
  success: "#22c55e",
  warning: "#f59e0b",
  danger: "#dc2626",
  tabInactive: "#5a6f86",
};

const lightTheme: AppTheme = {
  bg: "#eef3f8",
  bgAlt: "#dfe9f4",
  surface: "#ffffff",
  panel: "#f7fbff",
  border: "#c6d6e8",
  text: "#0f1d2c",
  mutedText: "#4a6078",
  primary: "#0f6bd7",
  primarySoft: "#cde3ff",
  success: "#16a34a",
  warning: "#d97706",
  danger: "#dc2626",
  tabInactive: "#6f7e8d",
};

export const getTheme = (darkMode: boolean): AppTheme => (darkMode ? darkTheme : lightTheme);
