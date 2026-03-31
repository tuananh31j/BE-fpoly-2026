import { StatusCodes } from 'http-status-codes';

import {
  isWebPushConfigured,
  removePushSubscription,
  upsertPushSubscription
} from '@services/push-notification.service';
import { ApiError } from '@utils/api-error';
import { asyncHandler } from '@utils/async-handler';
import { sendSuccess } from '@utils/response';
import type { Request } from 'express';

const getAuthUser = (req: Request) => {
  if (!req.user?.id || !req.user.role) {
    throw new ApiError(StatusCodes.UNAUTHORIZED, 'Unauthorized');
  }

  return req.user;
};

export const subscribePushNotificationController = asyncHandler(async (req, res) => {
  const authUser = getAuthUser(req);
  const subscription = req.body?.subscription;

  if (!subscription) {
    throw new ApiError(StatusCodes.UNPROCESSABLE_ENTITY, 'subscription is required');
  }

  const data = await upsertPushSubscription({
    userId: authUser.id,
    role: authUser.role,
    subscription,
    userAgent: req.headers['user-agent']
  });

  return sendSuccess(res, {
    statusCode: StatusCodes.CREATED,
    message: 'Subscribe push notification successfully',
    data: {
      id: String(data?._id ?? ''),
      endpoint: data?.endpoint,
      enabled: isWebPushConfigured()
    }
  });
});

export const unsubscribePushNotificationController = asyncHandler(async (req, res) => {
  const authUser = getAuthUser(req);
  const endpoint = req.body?.endpoint;

  if (!endpoint) {
    throw new ApiError(StatusCodes.UNPROCESSABLE_ENTITY, 'endpoint is required');
  }

  const removed = await removePushSubscription({
    userId: authUser.id,
    endpoint
  });

  return sendSuccess(res, {
    message: 'Unsubscribe push notification successfully',
    data: {
      removed
    }
  });
});
