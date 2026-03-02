import { FormEvent, useEffect, useMemo, useState } from "react";
import { createSchoolApi, SchoolAuthSession, SchoolUser } from "./api/schoolApi";

const DEFAULT_API_PORT = 12000;
const SESSION_AUTH_KEY = "web-school-auth-session";
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

function parseStoredAuthSession(raw: string): SchoolAuthSession | null {
  try {
    const parsed = JSON.parse(raw) as Partial<SchoolAuthSession>;
    const accessToken = parsed.accessToken?.trim() || "";
    const refreshToken = parsed.refreshToken?.trim() || "";
    const accessTokenExpiresAt = parsed.accessTokenExpiresAt?.trim() || "";
    const refreshTokenExpiresAt = parsed.refreshTokenExpiresAt?.trim() || "";

    if (!accessToken || !refreshToken || !accessTokenExpiresAt || !refreshTokenExpiresAt) {
      return null;
    }

    const accessExpiry = new Date(accessTokenExpiresAt);
    const refreshExpiry = new Date(refreshTokenExpiresAt);
    if (Number.isNaN(accessExpiry.getTime()) || Number.isNaN(refreshExpiry.getTime())) {
      return null;
    }

    if (refreshExpiry.getTime() <= Date.now()) {
      return null;
    }

    return {
      accessToken,
      refreshToken,
      accessTokenExpiresAt: accessExpiry.toISOString(),
      refreshTokenExpiresAt: refreshExpiry.toISOString(),
      institutionId: parsed.institutionId,
      mustResetPassword: Boolean(parsed.mustResetPassword)
    };
  } catch {
    return null;
  }
}

function getStoredAuthSession(): SchoolAuthSession | null {
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
  const [authSession, setAuthSession] = useState<SchoolAuthSession | null>(() => getStoredAuthSession());
  const [user, setUser] = useState<SchoolUser | null>(null);

  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [resetError, setResetError] = useState("");
  const [isResetting, setIsResetting] = useState(false);

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
      createSchoolApi({
        baseUrl,
        accessToken: authSession?.accessToken,
        refreshToken: authSession?.refreshToken,
        onAuthSession: setAuthSession,
        onUnauthorized: () => {
          setAuthSession(null);
          setUser(null);
        }
      }),
    [baseUrl, authSession?.accessToken, authSession?.refreshToken]
  );

  useEffect(() => {
    if (!authSession) {
      setUser(null);
      return;
    }

    let mounted = true;
    void api
      .me()
      .then((nextUser) => {
        if (!mounted) {
          return;
        }
        setUser(nextUser);
      })
      .catch((error) => {
        if (!mounted) {
          return;
        }
        setLoginError((error as Error).message || "사용자 정보를 불러오지 못했습니다.");
      });

    return () => {
      mounted = false;
    };
  }, [api, authSession]);

  const mustResetPassword = Boolean(user?.mustResetPassword || authSession?.mustResetPassword);

  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
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
      setLoginError((error as Error).message || "로그인에 실패했습니다.");
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleChangePassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setResetError("");

    if (!newPassword) {
      setResetError("새 비밀번호를 입력해 주세요.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setResetError("비밀번호 확인 값이 일치하지 않습니다.");
      return;
    }

    setIsResetting(true);
    try {
      await api.changePassword(newPassword);
      const nextUser = await api.me();
      setUser(nextUser);
      setAuthSession((prev) => (prev ? { ...prev, mustResetPassword: false } : prev));
      setNewPassword("");
      setConfirmPassword("");
    } catch (error) {
      setResetError((error as Error).message || "비밀번호 변경에 실패했습니다.");
    } finally {
      setIsResetting(false);
    }
  };

  const logout = () => {
    api.logout();
    setLoginId("");
    setPassword("");
    setLoginError("");
    setResetError("");
    setNewPassword("");
    setConfirmPassword("");
  };

  if (!authSession) {
    return (
      <main className="shell">
        <form className="card" onSubmit={handleLogin}>
          <p className="eyebrow">SISTRUN HUB</p>
          <h1>학교 관리자 로그인</h1>
          <p className="muted">
            API 서버: <span className="mono">{baseUrl}</span>
          </p>

          <label>
            아이디
            <input value={loginId} onChange={(event) => setLoginId(event.target.value)} autoComplete="username" required />
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

          {loginError ? <p className="error">{loginError}</p> : null}

          <button type="submit" disabled={isLoggingIn}>
            {isLoggingIn ? "로그인 중..." : "로그인"}
          </button>
        </form>
      </main>
    );
  }

  return (
    <main className="shell">
      <section className="card">
        <header className="head-row">
          <div>
            <p className="eyebrow">SCHOOL PORTAL</p>
            <h1>학교 관리자 포털</h1>
          </div>
          <button onClick={logout}>로그아웃</button>
        </header>

        <div className="info-grid">
          <p>
            <strong>아이디</strong>
            <span>{user?.loginId || "-"}</span>
          </p>
          <p>
            <strong>권한</strong>
            <span>{user?.role || "-"}</span>
          </p>
          <p>
            <strong>기관 ID</strong>
            <span>{user?.institutionId || authSession.institutionId || "-"}</span>
          </p>
          <p>
            <strong>마지막 로그인</strong>
            <span>{user?.lastLoginAt || "-"}</span>
          </p>
        </div>

        {mustResetPassword ? (
          <div className="notice danger">첫 로그인입니다. 비밀번호를 재설정해야 서비스를 이용할 수 있습니다.</div>
        ) : (
          <div className="notice success">인증이 정상적으로 완료되었습니다.</div>
        )}
      </section>

      {mustResetPassword ? (
        <div className="modal-backdrop">
          <form className="modal" onSubmit={handleChangePassword}>
            <h2>비밀번호 재설정</h2>
            <p className="muted">보안을 위해 새 비밀번호를 설정해 주세요.</p>

            <label>
              새 비밀번호
              <input
                type="password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                autoComplete="new-password"
                required
              />
            </label>

            <label>
              새 비밀번호 확인
              <input
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                autoComplete="new-password"
                required
              />
            </label>

            {resetError ? <p className="error">{resetError}</p> : null}

            <button type="submit" disabled={isResetting}>
              {isResetting ? "변경 중..." : "비밀번호 변경"}
            </button>
          </form>
        </div>
      ) : null}
    </main>
  );
}
