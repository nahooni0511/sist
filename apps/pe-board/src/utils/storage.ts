import AsyncStorage from "@react-native-async-storage/async-storage";
import { STORAGE_KEY } from "../data/defaults";
import { PersistedState } from "../types/app";

export const loadPersistedState = async (): Promise<Partial<PersistedState> | null> => {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }
    return JSON.parse(raw) as Partial<PersistedState>;
  } catch {
    return null;
  }
};

export const savePersistedState = async (state: PersistedState): Promise<void> => {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // no-op
  }
};

export const clearPersistedState = async (): Promise<void> => {
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch {
    // no-op
  }
};
