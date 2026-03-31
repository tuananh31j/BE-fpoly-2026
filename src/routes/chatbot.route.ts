import {
  askChatbotController,
  createChatbotPresetController,
  deleteChatbotPresetController,
  listAdminChatbotPresetsController,
  listChatbotPresetsController,
  updateChatbotPresetController
} from '@controllers/chatbot.controller';
import { requireBearerAuth } from '@middlewares/auth.middleware';
import { requireRoles } from '@middlewares/rbac.middleware';
import { validate } from '@middlewares/validate.middleware';
import {
  askChatbotSchema,
  chatbotPresetParamSchema,
  createChatbotPresetSchema,
  updateChatbotPresetSchema
} from '@validators/chatbot.validator';
import { Router } from 'express';

const chatbotRouter = Router();

chatbotRouter.get('/presets', listChatbotPresetsController);
chatbotRouter.post('/ask', validate(askChatbotSchema), askChatbotController);

chatbotRouter.get(
  '/admin/presets',
  requireBearerAuth,
  requireRoles('admin'),
  listAdminChatbotPresetsController
);
chatbotRouter.post(
  '/admin/presets',
  requireBearerAuth,
  requireRoles('admin'),
  validate(createChatbotPresetSchema),
  createChatbotPresetController
);
chatbotRouter.patch(
  '/admin/presets/:presetId',
  requireBearerAuth,
  requireRoles('admin'),
  validate(chatbotPresetParamSchema.merge(updateChatbotPresetSchema)),
  updateChatbotPresetController
);
chatbotRouter.delete(
  '/admin/presets/:presetId',
  requireBearerAuth,
  requireRoles('admin'),
  validate(chatbotPresetParamSchema),
  deleteChatbotPresetController
);

export default chatbotRouter;
