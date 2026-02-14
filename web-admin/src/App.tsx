import { useEffect, useMemo, useState } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { createAdminApi } from "./api/adminApi";
import AdminLayout from "./layout/AdminLayout";
import { AppContext } from "./hooks/useAppContext";
import ApkListPage from "./pages/ApkListPage";
import ApkDetailPage from "./pages/ApkDetailPage";
import DevicesPage from "./pages/DevicesPage";
import DeviceDetailPage from "./pages/DeviceDetailPage";

function inferDefaultBaseUrl(): string {
  if (typeof window === "undefined") {
    return "http://localhost:4000";
  }

  const host = window.location.hostname;
  if (!host) {
    return "http://localhost:4000";
  }
  return `http://${host}:4000`;
}

function migrateLocalhostBaseUrl(raw: string): string {
  if (typeof window === "undefined") {
    return raw;
  }

  const currentHost = window.location.hostname;
  const localHosts = new Set(["localhost", "127.0.0.1"]);
  if (localHosts.has(currentHost)) {
    return raw;
  }

  try {
    const parsed = new URL(raw);
    if (localHosts.has(parsed.hostname)) {
      return `http://${currentHost}:4000`;
    }
  } catch {
    return raw;
  }

  return raw;
}

export default function App() {
  const [baseUrl, setBaseUrlState] = useState(() => {
    const saved = localStorage.getItem("baseUrl");
    if (!saved) {
      return inferDefaultBaseUrl();
    }
    return migrateLocalhostBaseUrl(saved);
  });
  const [adminToken, setAdminTokenState] = useState(() => localStorage.getItem("adminToken") ?? "sistrun-admin");

  useEffect(() => {
    localStorage.setItem("baseUrl", baseUrl);
  }, [baseUrl]);

  useEffect(() => {
    localStorage.setItem("adminToken", adminToken);
  }, [adminToken]);

  const api = useMemo(
    () =>
      createAdminApi({
        baseUrl,
        adminToken
      }),
    [baseUrl, adminToken]
  );

  return (
    <AppContext.Provider
      value={{
        baseUrl,
        adminToken,
        setBaseUrl: setBaseUrlState,
        setAdminToken: setAdminTokenState,
        api
      }}
    >
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<AdminLayout />}>
            <Route index element={<Navigate to="/apk" replace />} />
            <Route path="apk" element={<ApkListPage />} />
            <Route path="apk/:apkId" element={<ApkDetailPage />} />
            <Route path="devices" element={<DevicesPage />} />
            <Route path="devices/:deviceId" element={<DeviceDetailPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/apk" replace />} />
        </Routes>
      </BrowserRouter>
    </AppContext.Provider>
  );
}
