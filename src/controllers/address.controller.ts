import { StatusCodes } from 'http-status-codes';

import {
  createMyAddress,
  deleteMyAddress,
  listMyAddresses,
  updateMyAddress
} from '@services/address.service';
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

export const listMyAddressesController = asyncHandler(async (req, res) => {
  const data = await listMyAddresses(getUserId(req));

  return sendSuccess(res, {
    message: 'Get addresses successfully',
    data
  });
});

export const createMyAddressController = asyncHandler(async (req, res) => {
  const data = await createMyAddress(getUserId(req), req.body);

  return sendSuccess(res, {
    statusCode: StatusCodes.CREATED,
    message: 'Create address successfully',
    data
  });
});

export const updateMyAddressController = asyncHandler(async (req, res) => {
  const data = await updateMyAddress(
    getUserId(req),
    getParam(req.params.addressId, 'addressId'),
    req.body
  );

  return sendSuccess(res, {
    message: 'Update address successfully',
    data
  });
});

export const deleteMyAddressController = asyncHandler(async (req, res) => {
  const data = await deleteMyAddress(getUserId(req), getParam(req.params.addressId, 'addressId'));

  return sendSuccess(res, {
    message: 'Delete address successfully',
    data
  });
});
