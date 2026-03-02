type JsonRecord = Record<string, unknown>;

class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export type SchoolAuthSession = {
  accessToken: string;
  accessTokenExpiresAt: string;
  refreshToken: string;
  refreshTokenExpiresAt: string;
  institutionId?: string;
  mustResetPassword: boolean;
};

export type SchoolUser = {
  id: string;
  loginId: string;
  role: string;
  institutionId?: string;
  mustResetPassword: boolean;
  lastLoginAt?: string;
};

export type SchoolApiConfig = {
  baseUrl: string;
  accessToken?: string;
  refreshToken?: string;
  onAuthSession?: (session: SchoolAuthSession | null) => void;
  onUnauthorized?: () => void;
};

function safeText(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (value === null || value === undefined) {
    return "";
  }
  return String(value);
}

function toIso(raw: string): string {
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error("토큰 만료시간 형식이 올바르지 않습니다.");
  }
  return parsed.toISOString();
}

export function createSchoolApi(config: SchoolApiConfig) {
  const baseUrl = config.baseUrl.replace(/\/$/, "");
  let accessToken = safeText(config.accessToken).trim();
  let refreshToken = safeText(config.refreshToken).trim();
  let refreshInFlight: Promise<void> | null = null;

  function applyAuthSession(session: SchoolAuthSession | null): void {
    accessToken = session?.accessToken ?? "";
    refreshToken = session?.refreshToken ?? "";
    config.onAuthSession?.(session);
  }

  function clearAuthSession(): void {
    applyAuthSession(null);
    config.onUnauthorized?.();
  }

  async function parseJsonOrThrow(response: Response): Promise<JsonRecord> {
    const text = await response.text();
    let body: JsonRecord = {};

    if (text) {
      try {
        body = JSON.parse(text) as JsonRecord;
      } catch {
        body = { message: text };
      }
    }

    if (!response.ok) {
      throw new ApiError(response.status, safeText(body.message) || `${response.status} ${response.statusText}`);
    }

    return body;
  }

  function parseAuthSession(raw: JsonRecord): SchoolAuthSession {
    const nextAccessToken = safeText(raw.accessToken).trim();
    const nextRefreshToken = safeText(raw.refreshToken).trim();
    const nextAccessTokenExpiresAt = safeText(raw.accessTokenExpiresAt).trim();
    const nextRefreshTokenExpiresAt = safeText(raw.refreshTokenExpiresAt).trim();

    if (!nextAccessToken || !nextRefreshToken || !nextAccessTokenExpiresAt || !nextRefreshTokenExpiresAt) {
      throw new Error("인증 응답이 올바르지 않습니다.");
    }

    return {
      accessToken: nextAccessToken,
      refreshToken: nextRefreshToken,
      accessTokenExpiresAt: toIso(nextAccessTokenExpiresAt),
      refreshTokenExpiresAt: toIso(nextRefreshTokenExpiresAt),
      institutionId: safeText(raw.institutionId) || undefined,
      mustResetPassword: Boolean(raw.mustResetPassword)
    };
  }

  async function request(
    path: string,
    options: {
      method?: string;
      body?: BodyInit | null;
      contentType?: string;
    } = {},
    requiresAuth = true,
    allowRefresh = true
  ): Promise<JsonRecord> {
    const headers = new Headers();
    if (requiresAuth && accessToken) {
      headers.set("x-school-token", accessToken);
    }
    if (options.contentType) {
      headers.set("content-type", options.contentType);
    }

    const response = await fetch(`${baseUrl}${path}`, {
      method: options.method ?? "GET",
      headers,
      body: options.body ?? null
    });

    if (requiresAuth && allowRefresh && response.status === 401) {
      await ensureRefreshed();
      return request(path, options, requiresAuth, false);
    }

    return parseJsonOrThrow(response);
  }

  async function refreshAuthSession(): Promise<void> {
    if (!refreshToken) {
      throw new ApiError(401, "세션이 만료되었습니다. 다시 로그인해 주세요.");
    }

    const response = await request(
      "/api/school/refresh",
      {
        method: "POST",
        contentType: "application/json",
        body: JSON.stringify({ refreshToken })
      },
      false,
      false
    );

    applyAuthSession(parseAuthSession(response));
  }

  async function ensureRefreshed(): Promise<void> {
    if (!refreshInFlight) {
      refreshInFlight = refreshAuthSession().finally(() => {
        refreshInFlight = null;
      });
    }
    return refreshInFlight;
  }

  async function login(input: { id: string; password: string }): Promise<SchoolAuthSession> {
    const response = await request(
      "/api/school/login",
      {
        method: "POST",
        contentType: "application/json",
        body: JSON.stringify(input)
      },
      false,
      false
    );

    const session = parseAuthSession(response);
    applyAuthSession(session);
    return session;
  }

  async function me(): Promise<SchoolUser> {
    const response = await request("/api/school/me");
    const user = (response.user as JsonRecord | undefined) ?? response;

    return {
      id: safeText(user.id),
      loginId: safeText(user.loginId),
      role: safeText(user.role),
      institutionId: safeText(user.institutionId) || undefined,
      mustResetPassword: Boolean(user.mustResetPassword),
      lastLoginAt: safeText(user.lastLoginAt) || undefined
    };
  }

  async function changePassword(newPassword: string): Promise<void> {
    await request("/api/school/change-password", {
      method: "POST",
      contentType: "application/json",
      body: JSON.stringify({ newPassword })
    });
  }

  function logout(): void {
    clearAuthSession();
  }

  return {
    login,
    me,
    changePassword,
    logout
  };
}
