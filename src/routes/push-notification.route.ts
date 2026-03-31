import {
  subscribePushNotificationController,
  unsubscribePushNotificationController
} from '@controllers/push-notification.controller';
import { requireBearerAuth } from '@middlewares/auth.middleware';
import { requireRoles } from '@middlewares/rbac.middleware';
import { validate } from '@middlewares/validate.middleware';
import {
  subscribePushNotificationSchema,
  unsubscribePushNotificationSchema
} from '@validators/push-notification.validator';
import { Router } from 'express';

const pushNotificationRouter = Router();

pushNotificationRouter.use(requireBearerAuth, requireRoles('staff', 'admin'));
pushNotificationRouter.post('/subscribe', validate(subscribePushNotificationSchema), subscribePushNotificationController);
pushNotificationRouter.post('/unsubscribe', validate(unsubscribePushNotificationSchema), unsubscribePushNotificationController);

export default pushNotificationRouter;
