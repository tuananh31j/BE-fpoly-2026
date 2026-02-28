import { StatusCodes } from 'http-status-codes';

import {
  forgotPassword,
  forgotPasswordResponseMessage,
  getMe,
  login,
  logout,
  refreshAuthTokens,
  register,
  resetPassword
} from '@services/auth.service';
import { ApiError } from '@utils/api-error';
import { asyncHandler } from '@utils/async-handler';
import { sendSuccess } from '@utils/response';
import type { Request } from 'express';

const getCurrentUserId = (req: Request) => {
  const userId = req.user?.id;

  if (!userId) {
    throw new ApiError(StatusCodes.UNAUTHORIZED, 'Unauthorized');
  }

  return userId;
};

export const registerController = asyncHandler(async (req, res) => {
  const data = await register(req.body);

  return sendSuccess(res, {
    statusCode: StatusCodes.CREATED,
    message: 'Register successfully',
    data
  });
});

export const loginController = asyncHandler(async (req, res) => {
  const data = await login(req.body);

  return sendSuccess(res, {
    message: 'Login successfully',
    data
  });
});

export const forgotPasswordController = asyncHandler(async (req, res) => {
  await forgotPassword(req.body);

  return sendSuccess(res, {
    message: forgotPasswordResponseMessage()
  });
});

export const resetPasswordController = asyncHandler(async (req, res) => {
  await resetPassword(req.body);

  return sendSuccess(res, {
    message: 'Reset password successfully'
  });
});

export const refreshTokenController = asyncHandler(async (req, res) => {
  const data = await refreshAuthTokens(req.body);

  return sendSuccess(res, {
    message: 'Refresh token successfully',
    data
  });
});

export const logoutController = asyncHandler(async (req, res) => {
  const userId = getCurrentUserId(req);

  await logout({
    userId,
    refreshToken: req.body?.refreshToken
  });

  return sendSuccess(res, {
    message: 'Logout successfully'
  });
});

export const meController = asyncHandler(async (req, res) => {
  const userId = getCurrentUserId(req);
  const data = await getMe(userId);

  return sendSuccess(res, {
    message: 'Get profile successfully',
    data
  });
});
