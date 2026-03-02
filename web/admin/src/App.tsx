import { FormEvent, useEffect, useMemo, useState } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { createAdminApi } from "./api/adminApi";
import AdminLayout from "./layout/AdminLayout";
import { AppContext } from "./hooks/useAppContext";
import ApkListPage from "./pages/ApkListPage";
import ApkDetailPage from "./pages/ApkDetailPage";
import DevicesPage from "./pages/DevicesPage";
import DeviceCreatePage from "./pages/DeviceCreatePage";
import DeviceDetailPage from "./pages/DeviceDetailPage";
import StoreMonitorPage from "./pages/StoreMonitorPage";
import StoreDeviceDetailPage from "./pages/StoreDeviceDetailPage";
import InstitutionsPage from "./pages/InstitutionsPage";
import InstitutionFormPage from "./pages/InstitutionFormPage";
import InstitutionDetailPage from "./pages/InstitutionDetailPage";
import InstitutionLogsPage from "./pages/InstitutionLogsPage";
import { AdminAuthSession } from "./types/admin";

const DEFAULT_API_PORT = 12000;
const SESSION_AUTH_KEY = "web-admin-auth-session";
const ENV_API_BASE_URL = import.meta.env.VITE_API_BASE_URL?.trim();

function inferRuntimeBaseUrl(): string {
  if (typeof window === "undefined") {
    return `http://localhost:${DEFAULT_API_PORT}`;
  }

  const host = window.location.hostname || "localhost";
  const protocol = window.location.protocol === "https:" ? "https:" : "http:";
  return `${protocol}//${host}:${DEFAULT_API_PORT}`;
}

function resolveBaseUrl(): string {
  return ENV_API_BASE_URL || inferRuntimeBaseUrl();
}

function parseStoredAuthSession(raw: string): AdminAuthSession | null {
  try {
    const parsed = JSON.parse(raw) as Partial<AdminAuthSession>;
    const accessToken = parsed.accessToken?.trim() || "";
    const refreshToken = parsed.refreshToken?.trim() || "";
    const accessTokenExpiresAt = parsed.accessTokenExpiresAt?.trim() || "";
    const refreshTokenExpiresAt = parsed.refreshTokenExpiresAt?.trim() || "";

    if (!accessToken || !refreshToken || !accessTokenExpiresAt || !refreshTokenExpiresAt) {
      return null;
    }

    const accessExpiresAtDate = new Date(accessTokenExpiresAt);
    const refreshExpiresAtDate = new Date(refreshTokenExpiresAt);
    if (Number.isNaN(accessExpiresAtDate.getTime()) || Number.isNaN(refreshExpiresAtDate.getTime())) {
      return null;
    }

    if (refreshExpiresAtDate.getTime() <= Date.now()) {
      return null;
    }

    return {
      accessToken,
      refreshToken,
      accessTokenExpiresAt: accessExpiresAtDate.toISOString(),
      refreshTokenExpiresAt: refreshExpiresAtDate.toISOString()
    };
  } catch {
    return null;
  }
}

function getStoredAuthSession(): AdminAuthSession | null {
  if (typeof window === "undefined") {
    return null;
  }

  const raw = sessionStorage.getItem(SESSION_AUTH_KEY);
  if (!raw) {
    return null;
  }

  const parsed = parseStoredAuthSession(raw);
  if (!parsed) {
    sessionStorage.removeItem(SESSION_AUTH_KEY);
    return null;
  }
  return parsed;
}

export default function App() {
  const [baseUrl] = useState(resolveBaseUrl);
  const [authSession, setAuthSession] = useState<AdminAuthSession | null>(() => getStoredAuthSession());
  const [loginId, setLoginId] = useState("sist-admin");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    if (!authSession) {
      sessionStorage.removeItem(SESSION_AUTH_KEY);
      return;
    }
    sessionStorage.setItem(SESSION_AUTH_KEY, JSON.stringify(authSession));
  }, [authSession]);

  const api = useMemo(
    () =>
      createAdminApi({
        baseUrl,
        accessToken: authSession?.accessToken,
        refreshToken: authSession?.refreshToken,
        onAuthSession: setAuthSession,
        onUnauthorized: () => {
          setAuthSession(null);
        }
      }),
    [baseUrl, authSession?.accessToken, authSession?.refreshToken]
  );

  const logout = () => {
    setAuthSession(null);
    setPassword("");
    setLoginError("");
  };

  const submitLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoginError("");
    setIsLoggingIn(true);
    try {
      const session = await api.login({
        id: loginId.trim(),
        password
      });
      setAuthSession(session);
      setPassword("");
    } catch (error) {
      const message = error instanceof Error ? error.message : "로그인에 실패했습니다.";
      setLoginError(message);
    } finally {
      setIsLoggingIn(false);
    }
  };

  if (!authSession) {
    return (
      <main className="login-shell">
        <form className="panel login-card" onSubmit={submitLogin}>
          <p className="eyebrow">SISTRUN HUB</p>
          <h1>관리자 로그인</h1>
          <p className="muted login-desc">
            API 서버: <span className="mono">{baseUrl}</span>
          </p>

          <label>
            아이디
            <input
              value={loginId}
              onChange={(event) => setLoginId(event.target.value)}
              autoComplete="username"
              required
            />
          </label>

          <label>
            비밀번호
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              required
            />
          </label>

          {loginError ? <p className="status danger-text">{loginError}</p> : null}

          <button type="submit" className="primary-button" disabled={isLoggingIn}>
            {isLoggingIn ? "로그인 중..." : "로그인"}
          </button>
        </form>
      </main>
    );
  }

  return (
    <AppContext.Provider
      value={{
        baseUrl,
        logout,
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
            <Route path="devices/new" element={<DeviceCreatePage />} />
            <Route path="devices/:deviceId" element={<DeviceDetailPage />} />
            <Route path="store" element={<StoreMonitorPage />} />
            <Route path="store/devices/:deviceId" element={<StoreDeviceDetailPage />} />
            <Route path="institutions" element={<InstitutionsPage />} />
            <Route path="institutions/new" element={<InstitutionFormPage mode="create" />} />
            <Route path="institutions/logs" element={<InstitutionLogsPage />} />
            <Route path="institutions/:institutionId/edit" element={<InstitutionFormPage mode="edit" />} />
            <Route path="institutions/:institutionId" element={<InstitutionDetailPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/apk" replace />} />
        </Routes>
      </BrowserRouter>
    </AppContext.Provider>
  );
}
