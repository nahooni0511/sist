import { NextFunction, Request, RequestHandler, Response } from "express";

export type AsyncRouteHandler = (
  req: Request,
  res: Response,
  next: NextFunction
) => Promise<void>;

export type AsyncHandler = (handler: AsyncRouteHandler) => RequestHandler;

export type InstitutionErrorMapping = {
  status: number;
  message: string;
};
