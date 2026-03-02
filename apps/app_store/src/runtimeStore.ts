import AsyncStorage from "@react-native-async-storage/async-storage";
import { QueueRuntimeState, StructuredLogRecord } from "./types";

const QUEUE_STATE_KEY = "app_store_queue_state_v1";
const LOGS_KEY = "app_store_structured_logs_v1";
const ONBOARDING_KEY = "app_store_onboarding_done_v1";

const MAX_LOGS = 400;

function nowIso(): string {
  return new Date().toISOString();
}

function defaultQueueState(): QueueRuntimeState {
  return {
    policy: "RETRY_THEN_CONTINUE",
    maxRetries: 2,
    items: [],
    updatedAt: nowIso()
  };
}

export async function loadQueueRuntimeState(): Promise<QueueRuntimeState> {
  const raw = await AsyncStorage.getItem(QUEUE_STATE_KEY);
  if (!raw) {
    return defaultQueueState();
  }

  try {
    const parsed = JSON.parse(raw) as QueueRuntimeState;
    if (!Array.isArray(parsed.items)) {
      return defaultQueueState();
    }

    return {
      policy:
        parsed.policy === "STOP_ON_FAILURE" ||
        parsed.policy === "CONTINUE_ON_FAILURE" ||
        parsed.policy === "RETRY_THEN_CONTINUE"
          ? parsed.policy
          : "RETRY_THEN_CONTINUE",
      maxRetries: Number.isFinite(parsed.maxRetries) ? Math.max(0, Math.floor(parsed.maxRetries)) : 2,
      items: parsed.items,
      activeItemId: parsed.activeItemId,
      updatedAt: parsed.updatedAt || nowIso()
    };
  } catch {
    return defaultQueueState();
  }
}

export async function saveQueueRuntimeState(state: QueueRuntimeState): Promise<void> {
  await AsyncStorage.setItem(
    QUEUE_STATE_KEY,
    JSON.stringify({
      ...state,
      updatedAt: nowIso()
    })
  );
}

export async function clearQueueRuntimeState(): Promise<void> {
  await AsyncStorage.removeItem(QUEUE_STATE_KEY);
}

export async function loadStructuredLogs(): Promise<StructuredLogRecord[]> {
  const raw = await AsyncStorage.getItem(LOGS_KEY);
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as StructuredLogRecord[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function appendStructuredLog(log: StructuredLogRecord): Promise<StructuredLogRecord[]> {
  const existing = await loadStructuredLogs();
  const next = [log, ...existing].slice(0, MAX_LOGS);
  await AsyncStorage.setItem(LOGS_KEY, JSON.stringify(next));
  return next;
}

export async function saveStructuredLogs(logs: StructuredLogRecord[]): Promise<void> {
  await AsyncStorage.setItem(LOGS_KEY, JSON.stringify(logs.slice(0, MAX_LOGS)));
}

export async function loadOnboardingDone(): Promise<boolean> {
  return (await AsyncStorage.getItem(ONBOARDING_KEY)) === "true";
}

export async function saveOnboardingDone(done: boolean): Promise<void> {
  await AsyncStorage.setItem(ONBOARDING_KEY, done ? "true" : "false");
}
