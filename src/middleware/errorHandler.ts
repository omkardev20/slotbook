import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../lib/errors.ts';

function isInvalidJson(err: unknown): boolean {
  return (
    err instanceof SyntaxError &&
    'status' in err &&
    err.status === 400 &&
    'type' in err &&
    err.type === 'entity.parse.failed'
  );
}

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    return res.status(err.status).json({
      error: {
        code: err.code,
        message: err.message,
      },
    });
  }

  // express.json() rejects a body that is not JSON. That is a client mistake.
  if (isInvalidJson(err)) {
    return res.status(400).json({
      error: {
        code: 'INVALID_JSON',
        message: 'Request body must be JSON',
      },
    });
  }

  // A request that failed schema validation is a client mistake, not a bug.
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: err.issues.map((issue) => issue.message).join('; '),
      },
    });
  }

  console.error(err);

  return res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'Something went wrong',
    },
  });
}
