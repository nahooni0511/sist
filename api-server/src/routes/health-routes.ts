import { Express } from "express";

export type RegisterHealthRoutesInput = {
  app: Express;
  nowIso: () => string;
};

export function registerHealthRoutes(input: RegisterHealthRoutesInput): void {
  const { app, nowIso } = input;

  app.get("/health", (_req, res) => {
    res.json({ ok: true, timestamp: nowIso() });
  });
}
