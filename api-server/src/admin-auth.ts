import crypto from "node:crypto";
import { Request, Response } from "express";
import { RedisClientType } from "redis";
import { AuthSessionRecord, AuthSessionWithUser, AuthUserRecord, MySqlDb, UserRole } from "./db.js";

const REQUEST_AUTH_CACHE_KEY = Symbol("request-auth-cache");

type RequestWithAuthCache = Request & {
  [REQUEST_AUTH_CACHE_KEY]?: AuthSessionWithUser | null;
};

export type PortalAuthSessionResponse = {
  accessToken: string;
  accessTokenExpiresAt: string;
  refreshToken: string;
  refreshTokenExpiresAt: string;
  role: UserRole;
  institutionId?: string;
  mustResetPassword: boolean;
};

type DbAuthServiceOptions = {
  db: MySqlDb;
  redis: RedisClientType<any, any, any, any, any>;
  accessTokenTtlMs: number;
  refreshTokenTtlMs: number;
};

export class DbAuthService {
  private readonly db: MySqlDb;
  private readonly redis: RedisClientType<any, any, any, any, any>;
  private readonly accessTokenTtlMs: number;
  private readonly refreshTokenTtlMs: number;

  constructor(options: DbAuthServiceOptions) {
    this.db = options.db;
    this.redis = options.redis;
    this.accessTokenTtlMs = Math.max(1, options.accessTokenTtlMs);
    this.refreshTokenTtlMs = Math.max(1, options.refreshTokenTtlMs);
  }

  async login(
    loginId: string,
    password: string,
    allowedRoles: UserRole[]
  ): Promise<PortalAuthSessionResponse> {
    const now = new Date().toISOString();

    const user = await this.db.authenticateAuthUser(loginId, password);
    if (!user) {
      throw new Error("INVALID_CREDENTIALS");
    }
    if (!user.isActive) {
      throw new Error("ACCOUNT_DISABLED");
    }
    if (!allowedRoles.includes(user.role)) {
      throw new Error("ROLE_FORBIDDEN");
    }

    const session = await this.issueSession(user, now);
    await this.db.markAuthUserLoggedIn(user.id, now);
    return this.sessionToResponse(session, user);
  }

  async refresh(refreshToken: string, allowedRoles: UserRole[]): Promise<PortalAuthSessionResponse> {
    const now = new Date().toISOString();
    const sessionWithUser = await this.getSessionWithUserByRefreshToken(refreshToken.trim());
    if (!sessionWithUser) {
      throw new Error("INVALID_REFRESH_TOKEN");
    }

    const validation = this.validateSession(sessionWithUser, now);
    if (!validation.valid) {
      await this.revokeSessionById(sessionWithUser.session.id, now);
      throw new Error(validation.reason);
    }

    if (!allowedRoles.includes(sessionWithUser.user.role)) {
      throw new Error("ROLE_FORBIDDEN");
    }

    await this.revokeSessionById(sessionWithUser.session.id, now);

    const nextSession = await this.issueSession(sessionWithUser.user, now);
    return this.sessionToResponse(nextSession, sessionWithUser.user);
  }

  async requireRole(req: Request, res: Response, allowedRoles: UserRole[]): Promise<boolean> {
    const current = await this.getCurrentSession(req);
    if (!current) {
      res.status(401).json({ message: "Unauthorized" });
      return false;
    }

    if (!allowedRoles.includes(current.user.role)) {
      res.status(403).json({ message: "Forbidden" });
      return false;
    }

    return true;
  }

  async getCurrentUser(req: Request): Promise<AuthUserRecord | null> {
    const current = await this.getCurrentSession(req);
    return current?.user ?? null;
  }

  async getCurrentUserId(req: Request): Promise<string | null> {
    const user = await this.getCurrentUser(req);
    return user?.id ?? null;
  }

  async changePassword(userId: string, newPassword: string, now: string): Promise<void> {
    await this.db.updateAuthUserPassword({
      userId,
      newPassword,
      mustResetPassword: false,
      updatedAt: now
    });
  }

  private async issueSession(user: AuthUserRecord, now: string) {
    const accessToken = this.issueToken("atk");
    const refreshToken = this.issueToken("rtk");
    const accessTokenExpiresAt = new Date(Date.now() + this.accessTokenTtlMs).toISOString();
    const refreshTokenExpiresAt = new Date(Date.now() + this.refreshTokenTtlMs).toISOString();
    const session: AuthSessionRecord = {
      id: crypto.randomUUID(),
      userId: user.id,
      accessToken,
      refreshToken,
      accessTokenExpiresAt,
      refreshTokenExpiresAt,
      createdAt: now,
      updatedAt: now
    };
    await this.saveSession(session);
    return session;
  }

  private sessionToResponse(
    session: {
      accessToken: string;
      refreshToken: string;
      accessTokenExpiresAt: string;
      refreshTokenExpiresAt: string;
    },
    user: AuthUserRecord
  ): PortalAuthSessionResponse {
    return {
      accessToken: session.accessToken,
      accessTokenExpiresAt: session.accessTokenExpiresAt,
      refreshToken: session.refreshToken,
      refreshTokenExpiresAt: session.refreshTokenExpiresAt,
      role: user.role,
      institutionId: user.institutionId,
      mustResetPassword: user.mustResetPassword
    };
  }

  private issueToken(prefix: "atk" | "rtk"): string {
    return `${prefix}_${crypto.randomBytes(32).toString("hex")}`;
  }

  private validateSession(
    sessionWithUser: AuthSessionWithUser,
    nowIso: string
  ): { valid: true } | { valid: false; reason: string } {
    const nowMs = Date.parse(nowIso);
    const accessExpiryMs = Date.parse(sessionWithUser.session.accessTokenExpiresAt);
    const refreshExpiryMs = Date.parse(sessionWithUser.session.refreshTokenExpiresAt);

    if (sessionWithUser.session.revokedAt) {
      return { valid: false, reason: "SESSION_REVOKED" };
    }
    if (!sessionWithUser.user.isActive) {
      return { valid: false, reason: "ACCOUNT_DISABLED" };
    }
    if (!Number.isFinite(refreshExpiryMs) || refreshExpiryMs <= nowMs) {
      return { valid: false, reason: "REFRESH_TOKEN_EXPIRED" };
    }
    if (!Number.isFinite(accessExpiryMs)) {
      return { valid: false, reason: "INVALID_ACCESS_TOKEN_EXPIRY" };
    }

    return { valid: true };
  }

  private async getCurrentSession(req: Request): Promise<AuthSessionWithUser | null> {
    const requestWithCache = req as RequestWithAuthCache;
    if (Object.prototype.hasOwnProperty.call(requestWithCache, REQUEST_AUTH_CACHE_KEY)) {
      return requestWithCache[REQUEST_AUTH_CACHE_KEY] ?? null;
    }

    const accessToken = this.resolveAccessToken(req);
    if (!accessToken) {
      requestWithCache[REQUEST_AUTH_CACHE_KEY] = null;
      return null;
    }

    const sessionWithUser = await this.getSessionWithUserByAccessToken(accessToken);
    if (!sessionWithUser) {
      requestWithCache[REQUEST_AUTH_CACHE_KEY] = null;
      return null;
    }

    const now = new Date().toISOString();
    const validation = this.validateSession(sessionWithUser, now);
    if (!validation.valid) {
      await this.revokeSessionById(sessionWithUser.session.id, now);
      requestWithCache[REQUEST_AUTH_CACHE_KEY] = null;
      return null;
    }

    const nowMs = Date.parse(now);
    const accessExpiryMs = Date.parse(sessionWithUser.session.accessTokenExpiresAt);
    if (!Number.isFinite(accessExpiryMs) || accessExpiryMs <= nowMs) {
      await this.revokeSessionById(sessionWithUser.session.id, now);
      requestWithCache[REQUEST_AUTH_CACHE_KEY] = null;
      return null;
    }

    requestWithCache[REQUEST_AUTH_CACHE_KEY] = sessionWithUser;
    return sessionWithUser;
  }

  private async getSessionWithUserByAccessToken(accessToken: string): Promise<AuthSessionWithUser | null> {
    const session = await this.getSessionByAccessToken(accessToken);
    if (!session) {
      return null;
    }

    const user = await this.db.getAuthUserById(session.userId);
    if (!user) {
      await this.revokeSessionById(session.id, new Date().toISOString());
      return null;
    }

    return {
      session,
      user
    };
  }

  private async getSessionWithUserByRefreshToken(refreshToken: string): Promise<AuthSessionWithUser | null> {
    const session = await this.getSessionByRefreshToken(refreshToken);
    if (!session) {
      return null;
    }

    const user = await this.db.getAuthUserById(session.userId);
    if (!user) {
      await this.revokeSessionById(session.id, new Date().toISOString());
      return null;
    }

    return {
      session,
      user
    };
  }

  private async getSessionByAccessToken(accessToken: string): Promise<AuthSessionRecord | null> {
    const sessionIdRaw = await this.redis.get(this.accessTokenKey(accessToken));
    const sessionId = this.normalizeRedisText(sessionIdRaw);
    if (!sessionId) {
      return null;
    }

    return this.getSessionById(sessionId);
  }

  private async getSessionByRefreshToken(refreshToken: string): Promise<AuthSessionRecord | null> {
    const sessionIdRaw = await this.redis.get(this.refreshTokenKey(refreshToken));
    const sessionId = this.normalizeRedisText(sessionIdRaw);
    if (!sessionId) {
      return null;
    }

    return this.getSessionById(sessionId);
  }

  private async getSessionById(sessionId: string): Promise<AuthSessionRecord | null> {
    const raw = this.normalizeRedisText(await this.redis.get(this.sessionKey(sessionId)));
    if (!raw) {
      return null;
    }

    try {
      const parsed = JSON.parse(raw) as Partial<AuthSessionRecord>;
      if (!parsed || typeof parsed !== "object") {
        return null;
      }
      if (
        typeof parsed.id !== "string" ||
        typeof parsed.userId !== "string" ||
        typeof parsed.accessToken !== "string" ||
        typeof parsed.refreshToken !== "string" ||
        typeof parsed.accessTokenExpiresAt !== "string" ||
        typeof parsed.refreshTokenExpiresAt !== "string" ||
        typeof parsed.createdAt !== "string" ||
        typeof parsed.updatedAt !== "string"
      ) {
        return null;
      }

      return {
        id: parsed.id,
        userId: parsed.userId,
        accessToken: parsed.accessToken,
        refreshToken: parsed.refreshToken,
        accessTokenExpiresAt: parsed.accessTokenExpiresAt,
        refreshTokenExpiresAt: parsed.refreshTokenExpiresAt,
        revokedAt: typeof parsed.revokedAt === "string" ? parsed.revokedAt : undefined,
        createdAt: parsed.createdAt,
        updatedAt: parsed.updatedAt
      };
    } catch {
      return null;
    }
  }

  private async saveSession(session: AuthSessionRecord): Promise<void> {
    const nowMs = Date.now();
    const accessExpiryMs = Date.parse(session.accessTokenExpiresAt);
    const refreshExpiryMs = Date.parse(session.refreshTokenExpiresAt);
    const accessTtlSec = Math.max(1, Math.ceil((accessExpiryMs - nowMs) / 1000));
    const refreshTtlSec = Math.max(1, Math.ceil((refreshExpiryMs - nowMs) / 1000));

    const multi = this.redis.multi();
    multi.set(this.sessionKey(session.id), JSON.stringify(session), {
      EX: refreshTtlSec
    });
    multi.set(this.accessTokenKey(session.accessToken), session.id, {
      EX: accessTtlSec
    });
    multi.set(this.refreshTokenKey(session.refreshToken), session.id, {
      EX: refreshTtlSec
    });
    multi.sAdd(this.userSessionsKey(session.userId), session.id);
    multi.expire(this.userSessionsKey(session.userId), refreshTtlSec);
    await multi.exec();
  }

  private async revokeSessionById(sessionId: string, revokedAt: string): Promise<void> {
    const session = await this.getSessionById(sessionId);
    if (!session) {
      return;
    }

    const multi = this.redis.multi();
    multi.del(this.accessTokenKey(session.accessToken));
    multi.del(this.refreshTokenKey(session.refreshToken));
    multi.sRem(this.userSessionsKey(session.userId), session.id);

    const refreshExpiryMs = Date.parse(session.refreshTokenExpiresAt);
    const nowMs = Date.now();
    const remainingTtlSec = Math.ceil((refreshExpiryMs - nowMs) / 1000);
    if (remainingTtlSec > 0) {
      multi.set(
        this.sessionKey(session.id),
        JSON.stringify({
          ...session,
          revokedAt: session.revokedAt ?? revokedAt,
          updatedAt: revokedAt
        }),
        { EX: remainingTtlSec }
      );
    } else {
      multi.del(this.sessionKey(session.id));
    }

    await multi.exec();
  }

  private sessionKey(sessionId: string): string {
    return `auth:session:${sessionId}`;
  }

  private accessTokenKey(accessToken: string): string {
    return `auth:access:${accessToken}`;
  }

  private refreshTokenKey(refreshToken: string): string {
    return `auth:refresh:${refreshToken}`;
  }

  private userSessionsKey(userId: string): string {
    return `auth:user_sessions:${userId}`;
  }

  private normalizeRedisText(value: string | Buffer<ArrayBufferLike> | null): string | null {
    if (typeof value === "string") {
      return value;
    }
    if (value instanceof Buffer) {
      return value.toString("utf8");
    }
    return null;
  }

  private resolveAccessToken(req: Request): string | null {
    const adminToken = req.header("x-admin-token")?.trim();
    if (adminToken) {
      return adminToken;
    }

    const schoolToken = req.header("x-school-token")?.trim();
    if (schoolToken) {
      return schoolToken;
    }

    const authHeader = req.header("authorization")?.trim();
    if (!authHeader) {
      return null;
    }

    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    if (!match) {
      return null;
    }

    const bearerToken = match[1]?.trim();
    return bearerToken || null;
  }
}
