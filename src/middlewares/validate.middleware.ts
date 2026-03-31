import { ZodError, type ZodTypeAny } from 'zod';

import { ApiError } from '@utils/api-error';
import type { NextFunction, Request, Response } from 'express';

export const validate = (schema: ZodTypeAny) => {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      const parsed = schema.parse({
        body: req.body,
        query: req.query,
        params: req.params
      }) as {
        body?: Request['body'];
        params?: Request['params'];
      };

      if (parsed.body) {
        req.body = parsed.body;
      }

      if (parsed.params) {
        req.params = parsed.params;
      }

      return next();
    } catch (error) {
      if (error instanceof ZodError) {
        const details = error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message
        }));
        return next(new ApiError(422, 'Validation failed', details));
      }

      return next(error);
    }
  };
};
