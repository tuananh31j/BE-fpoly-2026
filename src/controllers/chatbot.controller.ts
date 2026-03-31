import { StatusCodes } from 'http-status-codes';

import {
  askChatbot,
  createChatbotPreset,
  deleteChatbotPreset,
  listActiveChatbotPresets,
  listAdminChatbotPresets,
  updateChatbotPreset
} from '@services/chatbot.service';
import { asyncHandler } from '@utils/async-handler';
import { getParam } from '@utils/request';
import { sendSuccess } from '@utils/response';

export const listChatbotPresetsController = asyncHandler(async (_req, res) => {
  const data = await listActiveChatbotPresets();

  return sendSuccess(res, {
    message: 'Get chatbot preset list successfully',
    data
  });
});

export const askChatbotController = asyncHandler(async (req, res) => {
  const data = await askChatbot({
    presetId: req.body.presetId,
    context: req.body.context
  });

  return sendSuccess(res, {
    message: 'Get chatbot response successfully',
    data
  });
});

export const listAdminChatbotPresetsController = asyncHandler(async (_req, res) => {
  const data = await listAdminChatbotPresets();

  return sendSuccess(res, {
    message: 'Get admin chatbot presets successfully',
    data
  });
});

export const createChatbotPresetController = asyncHandler(async (req, res) => {
  const data = await createChatbotPreset(req.body);

  return sendSuccess(res, {
    statusCode: StatusCodes.CREATED,
    message: 'Create chatbot preset successfully',
    data
  });
});

export const updateChatbotPresetController = asyncHandler(async (req, res) => {
  const data = await updateChatbotPreset(getParam(req.params.presetId, 'presetId'), req.body);

  return sendSuccess(res, {
    message: 'Update chatbot preset successfully',
    data
  });
});

export const deleteChatbotPresetController = asyncHandler(async (req, res) => {
  const data = await deleteChatbotPreset(getParam(req.params.presetId, 'presetId'));

  return sendSuccess(res, {
    message: 'Delete chatbot preset successfully',
    data
  });
});
