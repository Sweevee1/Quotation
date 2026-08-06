import type { NextFunction, Request, Response } from "express";

type AsyncRoute = (req: Request, res: Response, next: NextFunction) => Promise<void>;

/**
 * Express 4 doesn't forward rejected promises from async handlers to error middleware —
 * an unhandled rejection just hangs the request or crashes the process. Wrap every async
 * route callback with this so thrown/rejected errors reach the global error handler.
 */
export function asyncHandler(fn: AsyncRoute) {
  return (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res, next).catch(next);
  };
}
