import { StatusCodes } from 'http-status-codes';

import type { OrderStatus } from '@/types/domain';
import {
  cancelMyOrder,
  createCancelRefundRequest,
  createOrderFromCart,
  confirmOrderReceived,
  createReturnRequest,
  handleZalopayCallback,
  handleZalopayRedirect,
  handleVnpayReturn,
  getOrderStatistics,
  getMyOrderById,
  listAllOrders,
  listMyOrders,
  retryMyVnpayPayment,
  updateCancelRefundRequest,
  updateReturnRequest,
  updateOrderStatus
} from '@services/order.service';
import { ApiError } from '@utils/api-error';
import { asyncHandler } from '@utils/async-handler';
import { getOptionalParam, getParam } from '@utils/request';
import { sendSuccess } from '@utils/response';
import type { Request } from 'express';

const getUserId = (req: Request) => {
  const userId = req.user?.id;

  if (!userId) {
    throw new ApiError(StatusCodes.UNAUTHORIZED, 'Unauthorized');
  }

  return userId;
};

// worklog: 2026-03-04 20:35:23 | dung | feature | getClientIpAddress
const getClientIpAddress = (req: Request) => {
  const xForwardedFor = req.headers['x-forwarded-for'];

  if (typeof xForwardedFor === 'string' && xForwardedFor.trim()) {
    return xForwardedFor.split(',')[0].trim();
  }

  return req.ip;
};

export const createOrderController = asyncHandler(async (req, res) => {
  const data = await createOrderFromCart(getUserId(req), {
    ...req.body,
    clientIp: getClientIpAddress(req)
  });

  return sendSuccess(res, {
    statusCode: StatusCodes.CREATED,
    message: 'Create order successfully',
    data
  });
});

export const listMyOrdersController = asyncHandler(async (req, res) => {
  const data = await listMyOrders(getUserId(req), {
    page: res.locals.pagination?.page ?? 1,
    limit: res.locals.pagination?.limit ?? 20,
    search: getOptionalParam(req.query.search as string | string[] | undefined),
    status: getOptionalParam(req.query.status as string | string[] | undefined) as
      | OrderStatus
      | undefined
  });

  return sendSuccess(res, {
    message: 'Get orders successfully',
    data
  });
});

export const listAllOrdersController = asyncHandler(async (req, res) => {
  const data = await listAllOrders({
    page: res.locals.pagination?.page ?? 1,
    limit: res.locals.pagination?.limit ?? 20,
    search: getOptionalParam(req.query.search as string | string[] | undefined),
    status: getOptionalParam(req.query.status as string | string[] | undefined) as
      | OrderStatus
      | undefined,
    userId: getOptionalParam(req.query.userId as string | string[] | undefined)
  });

  return sendSuccess(res, {
    message: 'Get all orders successfully',
    data
  });
});

export const getMyOrderByIdController = asyncHandler(async (req, res) => {
  const data = await getMyOrderById(getUserId(req), getParam(req.params.orderId, 'orderId'));

  return sendSuccess(res, {
    message: 'Get order successfully',
    data
  });
});

export const cancelMyOrderController = asyncHandler(async (req, res) => {
  const data = await cancelMyOrder(
    getUserId(req),
    getParam(req.params.orderId, 'orderId'),
    req.body?.note
  );

  return sendSuccess(res, {
    message: 'Cancel order successfully',
    data
  });
});

export const confirmOrderReceivedController = asyncHandler(async (req, res) => {
  const data = await confirmOrderReceived(getUserId(req), getParam(req.params.orderId, 'orderId'));

  return sendSuccess(res, {
    message: 'Confirm order received successfully',
    data
  });
});

export const createReturnRequestController = asyncHandler(async (req, res) => {
  const data = await createReturnRequest({
    userId: getUserId(req),
    orderId: getParam(req.params.orderId, 'orderId'),
    items: req.body.items,
    reason: req.body.reason,
    refundMethod: req.body.refundMethod
  });

  return sendSuccess(res, {
    message: 'Create return request successfully',
    data
  });
});

export const createCancelRefundRequestController = asyncHandler(async (req, res) => {
  const data = await createCancelRefundRequest({
    userId: getUserId(req),
    orderId: getParam(req.params.orderId, 'orderId'),
    bankCode: req.body.bankCode,
    bankName: req.body.bankName,
    accountNumber: req.body.accountNumber,
    accountHolder: req.body.accountHolder,
    note: req.body.note
  });

  return sendSuccess(res, {
    message: 'Create cancel refund request successfully',
    data
  });
});

export const updateReturnRequestController = asyncHandler(async (req, res) => {
  const data = await updateReturnRequest({
    orderId: getParam(req.params.orderId, 'orderId'),
    returnRequestId: getParam(req.params.returnRequestId, 'returnRequestId'),
    status: req.body.status,
    refundMethod: req.body.refundMethod,
    note: req.body.note,
    refundEvidenceImages: req.body.refundEvidenceImages
  });

  return sendSuccess(res, {
    message: 'Update return request successfully',
    data
  });
});

export const updateCancelRefundRequestController = asyncHandler(async (req, res) => {
  const data = await updateCancelRefundRequest({
    orderId: getParam(req.params.orderId, 'orderId'),
    processedBy: getUserId(req),
    status: req.body.status,
    adminNote: req.body.adminNote,
    refundEvidenceImages: req.body.refundEvidenceImages
  });

  return sendSuccess(res, {
    message: 'Update cancel refund request successfully',
    data
  });
});

export const retryMyVnpayPaymentController = asyncHandler(async (req, res) => {
  const data = await retryMyVnpayPayment({
    userId: getUserId(req),
    orderId: getParam(req.params.orderId, 'orderId'),
    clientIp: getClientIpAddress(req)
  });

  return sendSuccess(res, {
    message: 'Create payment URL successfully',
    data
  });
});

export const verifyVnpayReturnController = asyncHandler(async (req, res) => {
  const data = await handleVnpayReturn(req.body as Record<string, unknown>);

  return sendSuccess(res, {
    message: 'Verify VNPay return successfully',
    data
  });
});

export const verifyZalopayRedirectController = asyncHandler(async (req, res) => {
  const data = await handleZalopayRedirect(req.body as Record<string, unknown>);

  return sendSuccess(res, {
    message: 'Verify ZaloPay redirect successfully',
    data
  });
});

export const handleZalopayCallbackController = asyncHandler(async (req, res) => {
  const data = await handleZalopayCallback(req.body as Record<string, unknown>);
  return res.status(StatusCodes.OK).json(data);
});

export const updateOrderStatusController = asyncHandler(async (req, res) => {
  const data = await updateOrderStatus({
    orderId: getParam(req.params.orderId, 'orderId'),
    status: req.body.status,
    changedBy: getUserId(req),
    note: req.body.note
  });

  return sendSuccess(res, {
    message: 'Update order status successfully',
    data
  });
});

export const getOrderStatisticsController = asyncHandler(async (req, res) => {
  const daysRaw = Number(req.query.days);
  const normalizedDays = Number.isFinite(daysRaw) ? Math.min(Math.max(Math.trunc(daysRaw), 1), 90) : 7;
  const data = await getOrderStatistics({
    days: normalizedDays
  });

  return sendSuccess(res, {
    message: 'Get order statistics successfully',
    data
  });
});
