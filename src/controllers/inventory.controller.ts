import { StatusCodes } from 'http-status-codes';

import { adjustStock, listInventoryLogs } from '@services/inventory.service';
import { ApiError } from '@utils/api-error';
import { asyncHandler } from '@utils/async-handler';
import { sendSuccess } from '@utils/response';
import type { Request } from 'express';

const getUserId = (req: Request) => {
  const userId = req.user?.id;

  if (!userId) {
    throw new ApiError(StatusCodes.UNAUTHORIZED, 'Unauthorized');
  }

  return userId;
};

export const listInventoryLogsController = asyncHandler(async (req, res) => {
  const data = await listInventoryLogs({
    page: res.locals.pagination?.page ?? 1,
    limit: res.locals.pagination?.limit ?? 20,
    productId: req.query.productId as string | undefined,
    variantId: req.query.variantId as string | undefined
  });

  return sendSuccess(res, {
    message: 'Get inventory logs successfully',
    data
  });
});

export const adjustStockController = asyncHandler(async (req, res) => {
  const data = await adjustStock({
    ...req.body,
    performedBy: getUserId(req)
  });

  return sendSuccess(res, {
    statusCode: StatusCodes.CREATED,
    message: 'Adjust stock successfully',
    data
  });
});
