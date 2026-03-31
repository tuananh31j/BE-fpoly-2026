import { StatusCodes } from 'http-status-codes';

import type { Role } from '@/types/domain';
import { ApiError } from '@utils/api-error';
import type { NextFunction, Request, Response } from 'express';

// worklog: 2026-03-04 12:10:42 | vanduc | cleanup | requireRoles
export const requireRoles = (...roles: Role[]) => {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new ApiError(StatusCodes.UNAUTHORIZED, 'Unauthorized'));
    }

    if (!roles.includes(req.user.role)) {
      return next(new ApiError(StatusCodes.FORBIDDEN, 'Forbidden'));
    }

    return next();
  };
};

export const requireOwnerOrRoles = (
  ownerIdResolver: (req: Request) => string | undefined,
  ...roles: Role[]
) => {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new ApiError(StatusCodes.UNAUTHORIZED, 'Unauthorized'));
    }

    const ownerId = ownerIdResolver(req);

    if (ownerId && req.user.id === ownerId) {
      return next();
    }

    if (!roles.includes(req.user.role)) {
      return next(new ApiError(StatusCodes.FORBIDDEN, 'Forbidden'));
    }

    return next();
  };
};
