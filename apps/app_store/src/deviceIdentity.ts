import AsyncStorage from "@react-native-async-storage/async-storage";

const DEVICE_ID_KEY = "app_store_device_id_v1";

function generateDeviceId(): string {
  const ts = Date.now().toString(36);
  const rnd = Math.random().toString(36).slice(2, 10);
  return `store-${ts}-${rnd}`;
}

export async function getOrCreateDeviceId(): Promise<string> {
  const existing = (await AsyncStorage.getItem(DEVICE_ID_KEY))?.trim();
  if (existing) {
    return existing;
  }

  const created = generateDeviceId();
  await AsyncStorage.setItem(DEVICE_ID_KEY, created);
  return created;
}
