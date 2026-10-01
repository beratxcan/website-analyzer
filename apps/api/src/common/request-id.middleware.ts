import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

export const REQUEST_ID_HEADER = 'x-request-id';

export interface RequestWithRequestId extends Request {
  requestId?: string;
}

/** Assigns a correlation id to every request and echoes it in the response header. */
export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.headers[REQUEST_ID_HEADER];
  const requestId = typeof incoming === 'string' && incoming.length > 0 ? incoming : randomUUID();
  (req as RequestWithRequestId).requestId = requestId;
  res.setHeader(REQUEST_ID_HEADER, requestId);
  next();
}