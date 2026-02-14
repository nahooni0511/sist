import { useEffect, useRef } from "react";

export function usePolling(callback: () => void | Promise<void>, intervalMs: number, enabled = true) {
  const savedCallback = useRef(callback);

  useEffect(() => {
    savedCallback.current = callback;
  }, [callback]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const timer = window.setInterval(() => {
      void savedCallback.current();
    }, intervalMs);

    return () => window.clearInterval(timer);
  }, [intervalMs, enabled]);
}
