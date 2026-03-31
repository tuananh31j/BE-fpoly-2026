import { env } from '@config/env';
import { logger } from '@config/logger';
import { PushSubscriptionModel } from '@models/push-subscription.model';
import webpush from 'web-push';

import type { Role } from '@/types/domain';

interface PushSubscriptionPayload {
  endpoint: string;
  expirationTime?: number | null;
  keys: {
    p256dh: string;
    auth: string;
  };
}

interface UpsertPushSubscriptionInput {
  userId: string;
  role: Role;
  subscription: PushSubscriptionPayload;
  userAgent?: string;
}

interface RemovePushSubscriptionInput {
  userId: string;
  endpoint: string;
}

interface WebPushNotificationPayload {
  title: string;
  body: string;
  url: string;
  tag?: string;
  metadata?: Record<string, unknown>;
}

const vapidSubject = env.WEB_PUSH_SUBJECT?.trim();
const vapidPublicKey = env.WEB_PUSH_PUBLIC_KEY?.trim();
const vapidPrivateKey = env.WEB_PUSH_PRIVATE_KEY?.trim();

const isWebPushConfiguredInternal = Boolean(vapidSubject && vapidPublicKey && vapidPrivateKey);

if (isWebPushConfiguredInternal) {
  webpush.setVapidDetails(vapidSubject!, vapidPublicKey!, vapidPrivateKey!);
} else {
  logger.warn(
    'Web Push is not configured. Missing WEB_PUSH_SUBJECT / WEB_PUSH_PUBLIC_KEY / WEB_PUSH_PRIVATE_KEY'
  );
}

export const isWebPushConfigured = () => isWebPushConfiguredInternal;

const isPushSubscriptionValid = (subscription: PushSubscriptionPayload) => {
  if (!subscription.endpoint?.trim()) {
    return false;
  }

  return Boolean(subscription.keys?.auth && subscription.keys?.p256dh);
};

export const upsertPushSubscription = async ({
  userId,
  role,
  subscription,
  userAgent
}: UpsertPushSubscriptionInput) => {
  if (!isPushSubscriptionValid(subscription)) {
    throw new Error('Invalid push subscription payload');
  }

  const updated = await PushSubscriptionModel.findOneAndUpdate(
    {
      endpoint: subscription.endpoint.trim()
    },
    {
      userId,
      role,
      endpoint: subscription.endpoint.trim(),
      expirationTime: subscription.expirationTime ?? null,
      keys: {
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth
      },
      userAgent: userAgent?.slice(0, 500)
    },
    {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true
    }
  ).lean();

  return updated;
};

export const removePushSubscription = async ({ userId, endpoint }: RemovePushSubscriptionInput) => {
  const deleted = await PushSubscriptionModel.findOneAndDelete({
    userId,
    endpoint: endpoint.trim()
  }).lean();

  return Boolean(deleted);
};

const removeInvalidSubscriptionByEndpoint = async (endpoint: string) => {
  await PushSubscriptionModel.deleteOne({ endpoint });
};

const sendPushToSubscription = async (
  subscription: PushSubscriptionPayload,
  payload: WebPushNotificationPayload
) => {
  if (!isWebPushConfiguredInternal) {
    return false;
  }

  try {
    await webpush.sendNotification(
      subscription,
      JSON.stringify({
        title: payload.title,
        body: payload.body,
        url: payload.url,
        tag: payload.tag,
        metadata: payload.metadata,
        timestamp: new Date().toISOString()
      })
    );

    return true;
  } catch (error) {
    const statusCode = (error as { statusCode?: number })?.statusCode;
    const endpoint = subscription.endpoint;

    if (statusCode === 404 || statusCode === 410) {
      await removeInvalidSubscriptionByEndpoint(endpoint);
      logger.warn(`Removed expired push subscription endpoint: ${endpoint}`);
      return false;
    }

    logger.error(`Failed to send Web Push to endpoint ${endpoint}: ${(error as Error).message}`);
    return false;
  }
};

export const sendPushNotificationToRoles = async (
  roles: Role[],
  payload: WebPushNotificationPayload
) => {
  if (!isWebPushConfiguredInternal) {
    return {
      attempted: 0,
      sent: 0
    };
  }

  const subscriptions = await PushSubscriptionModel.find({
    role: {
      $in: roles
    }
  })
    .select('endpoint expirationTime keys')
    .lean();

  let sent = 0;

  for (const item of subscriptions) {
    const ok = await sendPushToSubscription(
      {
        endpoint: item.endpoint,
        expirationTime: item.expirationTime ?? null,
        keys: {
          p256dh: item.keys.p256dh,
          auth: item.keys.auth
        }
      },
      payload
    );

    if (ok) {
      sent += 1;
    }
  }

  return {
    attempted: subscriptions.length,
    sent
  };
};

export const sendBackofficeWebPushNotification = async (payload: WebPushNotificationPayload) => {
  return sendPushNotificationToRoles(['staff', 'admin'], payload);
};
