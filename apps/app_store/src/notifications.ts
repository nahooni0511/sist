import Constants from "expo-constants";

type NotificationPermission = "granted" | "denied" | "undetermined";

type NotificationModule = typeof import("expo-notifications");

let cachedModule: NotificationModule | null = null;

function isExpoGo(): boolean {
  return Constants.appOwnership === "expo";
}

async function loadNotificationsModule(): Promise<NotificationModule | null> {
  if (isExpoGo()) {
    return null;
  }

  if (cachedModule) {
    return cachedModule;
  }

  try {
    cachedModule = await import("expo-notifications");
    return cachedModule;
  } catch {
    return null;
  }
}

export async function initNotificationHandler(): Promise<void> {
  const module = await loadNotificationsModule();
  if (!module) {
    return;
  }

  module.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false
    })
  });
}

export async function getNotificationPermissionStatus(): Promise<NotificationPermission> {
  const module = await loadNotificationsModule();
  if (!module) {
    return "denied";
  }

  const settings = await module.getPermissionsAsync();
  if (settings.status === "granted") {
    return "granted";
  }
  if (settings.status === "undetermined") {
    return "undetermined";
  }
  return "denied";
}

export async function requestNotificationPermission(): Promise<NotificationPermission> {
  const module = await loadNotificationsModule();
  if (!module) {
    return "denied";
  }

  const settings = await module.requestPermissionsAsync();
  if (settings.status === "granted") {
    return "granted";
  }
  if (settings.status === "undetermined") {
    return "undetermined";
  }
  return "denied";
}

export async function sendLocalNotification(title: string, body: string): Promise<void> {
  const module = await loadNotificationsModule();
  if (!module) {
    return;
  }

  try {
    await module.scheduleNotificationAsync({
      content: {
        title,
        body
      },
      trigger: null
    });
  } catch {
    // ignore notification errors
  }
}
