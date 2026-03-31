import { StatusCodes } from 'http-status-codes';

import {
  createVoucher,
  deleteVoucher,
  getVoucherById,
  listAvailableVouchersForCheckout,
  listVouchers,
  updateVoucher
} from '@services/voucher.service';
import { ApiError } from '@utils/api-error';
import { asyncHandler } from '@utils/async-handler';
import { getParam } from '@utils/request';
import { sendSuccess } from '@utils/response';

export const listVouchersController = asyncHandler(async (req, res) => {
  const data = await listVouchers({
    page: res.locals.pagination?.page ?? 1,
    limit: res.locals.pagination?.limit ?? 20,
    isActive:
      req.query.isActive === undefined
        ? undefined
        : String(req.query.isActive).toLowerCase() === 'true',
    code: req.query.code as string | undefined
  });

  return sendSuccess(res, {
    message: 'Get vouchers successfully',
    data
  });
});

export const listAvailableVouchersController = asyncHandler(async (req, res) => {
  const subtotalRaw = Number(req.query.subtotal);
  const subtotal = Number.isFinite(subtotalRaw) ? Math.max(subtotalRaw, 0) : 0;
  const userId = req.user?.id;

  if (!userId) {
    throw new ApiError(StatusCodes.UNAUTHORIZED, 'Unauthorized');
  }

  const data = await listAvailableVouchersForCheckout({
    subtotal,
    userId
  });

  return sendSuccess(res, {
    message: 'Get available vouchers successfully',
    data
  });
});

export const getVoucherByIdController = asyncHandler(async (req, res) => {
  const data = await getVoucherById(getParam(req.params.voucherId, 'voucherId'));

  return sendSuccess(res, {
    message: 'Get voucher successfully',
    data
  });
});

export const createVoucherController = asyncHandler(async (req, res) => {
  const data = await createVoucher({
    ...req.body,
    startDate: new Date(req.body.startDate),
    expirationDate: new Date(req.body.expirationDate)
  });

  return sendSuccess(res, {
    statusCode: StatusCodes.CREATED,
    message: 'Create voucher successfully',
    data
  });
});

export const updateVoucherController = asyncHandler(async (req, res) => {
  const payload = {
    ...req.body
  } as Record<string, unknown>;

  if (payload.startDate) {
    payload.startDate = new Date(String(payload.startDate));
  }

  if (payload.expirationDate) {
    payload.expirationDate = new Date(String(payload.expirationDate));
  }

  const data = await updateVoucher(getParam(req.params.voucherId, 'voucherId'), payload);

  return sendSuccess(res, {
    message: 'Update voucher successfully',
    data
  });
});

export const deleteVoucherController = asyncHandler(async (req, res) => {
  const data = await deleteVoucher(getParam(req.params.voucherId, 'voucherId'));

  return sendSuccess(res, {
    message: 'Delete voucher successfully',
    data
  });
});
