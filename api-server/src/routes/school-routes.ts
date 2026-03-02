import { Express, Request, Response } from "express";
import { z } from "zod";
import { AuthUserRecord } from "../db.js";
import { AsyncHandler } from "./types.js";

type PortalAuthSessionResponse = {
  accessToken: string;
  accessTokenExpiresAt: string;
  refreshToken: string;
  refreshTokenExpiresAt: string;
  role: "SUPER_ADMIN" | "SCHOOL_ADMIN" | "PARK_ADMIN";
  institutionId?: string;
  mustResetPassword: boolean;
};

export type RegisterSchoolRoutesInput = {
  app: Express;
  asyncHandler: AsyncHandler;
  schoolLoginSchema: z.ZodTypeAny;
  schoolRefreshSchema: z.ZodTypeAny;
  schoolChangePasswordSchema: z.ZodTypeAny;
  loginSchool: (id: string, password: string) => Promise<PortalAuthSessionResponse>;
  refreshSchool: (refreshToken: string) => Promise<PortalAuthSessionResponse>;
  requireSchool: (req: Request, res: Response) => Promise<boolean>;
  getSchoolUser: (req: Request) => Promise<AuthUserRecord | null>;
  changeSchoolPassword: (userId: string, newPassword: string) => Promise<void>;
};

export function registerSchoolRoutes(input: RegisterSchoolRoutesInput): void {
  const {
    app,
    asyncHandler,
    schoolLoginSchema,
    schoolRefreshSchema,
    schoolChangePasswordSchema,
    loginSchool,
    refreshSchool,
    requireSchool,
    getSchoolUser,
    changeSchoolPassword
  } = input;

  app.post(
    "/api/school/login",
    asyncHandler(async (req, res) => {
      const parsed = schoolLoginSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ message: "입력값이 올바르지 않습니다.", issues: parsed.error.issues });
        return;
      }

      const { id, password } = parsed.data;
      try {
        const session = await loginSchool(id, password);
        res.json(session);
      } catch (error) {
        const message = (error as Error).message;
        if (message === "ROLE_FORBIDDEN") {
          res.status(403).json({ message: "해당 포털 접근 권한이 없습니다." });
          return;
        }
        res.status(401).json({ message: "아이디 또는 비밀번호가 올바르지 않습니다." });
      }
    })
  );

  app.post(
    "/api/school/refresh",
    asyncHandler(async (req, res) => {
      const parsed = schoolRefreshSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ message: "입력값이 올바르지 않습니다.", issues: parsed.error.issues });
        return;
      }

      try {
        const session = await refreshSchool(parsed.data.refreshToken.trim());
        res.json(session);
      } catch (error) {
        const message = (error as Error).message || "Refresh token이 유효하지 않습니다.";
        res.status(401).json({ message });
      }
    })
  );

  app.get(
    "/api/school/me",
    asyncHandler(async (req, res) => {
      if (!(await requireSchool(req, res))) {
        return;
      }

      const user = await getSchoolUser(req);
      if (!user) {
        res.status(401).json({ message: "Unauthorized" });
        return;
      }

      res.json({
        user: {
          id: user.id,
          loginId: user.loginId,
          role: user.role,
          institutionId: user.institutionId,
          mustResetPassword: user.mustResetPassword,
          lastLoginAt: user.lastLoginAt
        }
      });
    })
  );

  app.post(
    "/api/school/change-password",
    asyncHandler(async (req, res) => {
      if (!(await requireSchool(req, res))) {
        return;
      }

      const parsed = schoolChangePasswordSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ message: "입력값이 올바르지 않습니다.", issues: parsed.error.issues });
        return;
      }

      const user = await getSchoolUser(req);
      if (!user) {
        res.status(401).json({ message: "Unauthorized" });
        return;
      }

      await changeSchoolPassword(user.id, parsed.data.newPassword);
      res.json({ message: "비밀번호가 변경되었습니다." });
    })
  );
}
