import { StatusCodes } from 'http-status-codes';

import { clearMyCart, getMyCart, removeMyCartItem, upsertMyCartItem } from '@services/cart.service';
import { ApiError } from '@utils/api-error';
import { asyncHandler } from '@utils/async-handler';
import { getParam } from '@utils/request';
import { sendSuccess } from '@utils/response';
import type { Request } from 'express';

const getUserId = (req: Request) => {
  const userId = req.user?.id;

  if (!userId) {
    throw new ApiError(StatusCodes.UNAUTHORIZED, 'Unauthorized');
  }

  return userId;
};

export const getMyCartController = asyncHandler(async (req, res) => {
  const data = await getMyCart(getUserId(req));

  return sendSuccess(res, {
    message: 'Get cart successfully',
    data
  });
});

export const upsertMyCartItemController = asyncHandler(async (req, res) => {
  const data = await upsertMyCartItem(getUserId(req), req.body);

  return sendSuccess(res, {
    message: 'Update cart successfully',
    data
  });
});

export const removeMyCartItemController = asyncHandler(async (req, res) => {
  const data = await removeMyCartItem(getUserId(req), getParam(req.params.variantId, 'variantId'));

  return sendSuccess(res, {
    message: 'Remove cart item successfully',
    data
  });
});

export const clearMyCartController = asyncHandler(async (req, res) => {
  const data = await clearMyCart(getUserId(req));

  return sendSuccess(res, {
    message: 'Clear cart successfully',
    data
  });
});
