import { StatusCodes } from 'http-status-codes';
import { JsonWebTokenError, TokenExpiredError } from 'jsonwebtoken';
import multer from 'multer';
import { ZodError } from 'zod';

import { env } from '@config/env';
import { logger } from '@config/logger';
import { ApiError } from '@utils/api-error';
import { localizeMessage } from '@utils/message-localize';
import type { NextFunction, Request, Response } from 'express';

export const errorMiddleware = (
  error: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
) => {
  let statusCode = StatusCodes.INTERNAL_SERVER_ERROR;
  let message = 'Internal server error';
  let details: Array<{ path: string; message: string }> | undefined;

  if (error instanceof ApiError) {
    statusCode = error.statusCode;
    message = error.message;
    details = error.details;
  } else if (error instanceof ZodError) {
    statusCode = StatusCodes.UNPROCESSABLE_ENTITY;
    message = 'Validation failed';
    details = error.issues.map((issue) => ({
      path: issue.path.join('.'),
      message: issue.message
    }));
  } else if (error instanceof multer.MulterError) {
    statusCode = StatusCodes.BAD_REQUEST;
    message = error.message;
  } else if (error instanceof TokenExpiredError || error instanceof JsonWebTokenError) {
    statusCode = StatusCodes.UNAUTHORIZED;
    message = 'Invalid token';
  }

  logger.error(error.stack ?? error.message);

  return res.status(statusCode).json({
    success: false,
    message: localizeMessage(message),
    errors: details?.map((detail) => ({
      ...detail,
      message: localizeMessage(detail.message)
    })),
    ...(env.isDevelopment && { stack: error.stack })
  });
};
