export const pad2 = (v: number): string => String(v).padStart(2, "0");

export const formatClock = (date: Date): string => {
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`;
};

export const formatTimer = (seconds: number): string => {
  const safe = Math.max(0, Math.floor(seconds));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${pad2(mins)}:${pad2(secs)}`;
};

export const formatBigTimer = (seconds: number): string => {
  const safe = Math.max(0, Math.floor(seconds));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${mins}:${pad2(secs)}`;
};

export const clamp = (value: number, min: number, max: number): number => {
  return Math.min(max, Math.max(min, value));
};

export const nowMs = (): number => Date.now();
