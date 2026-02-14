import { createContext, useContext } from "react";
import { createAdminApi } from "../api/adminApi";

export interface AppContextValue {
  baseUrl: string;
  adminToken: string;
  setBaseUrl: (value: string) => void;
  setAdminToken: (value: string) => void;
  api: ReturnType<typeof createAdminApi>;
}

export const AppContext = createContext<AppContextValue | null>(null);

export function useAppContext(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) {
    throw new Error("useAppContext must be used within AppContext.Provider");
  }
  return ctx;
}
