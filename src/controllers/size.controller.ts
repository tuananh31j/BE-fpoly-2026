import { StatusCodes } from 'http-status-codes';

import { createSize, deleteSize, getSizeById, listSizes, updateSize } from '@services/size.service';
import { asyncHandler } from '@utils/async-handler';
import { getParam } from '@utils/request';
import { sendSuccess } from '@utils/response';

export const listSizesController = asyncHandler(async (req, res) => {
  const data = await listSizes({
    page: res.locals.pagination?.page ?? 1,
    limit: res.locals.pagination?.limit ?? 20,
    search: req.query.search as string | undefined,
    isActive:
      req.query.isActive === undefined
        ? undefined
        : String(req.query.isActive).toLowerCase() === 'true'
  });

  return sendSuccess(res, {
    message: 'Get sizes successfully',
    data
  });
});

export const getSizeByIdController = asyncHandler(async (req, res) => {
  const data = await getSizeById(getParam(req.params.sizeId, 'sizeId'));

  return sendSuccess(res, {
    message: 'Get size successfully',
    data
  });
});

export const createSizeController = asyncHandler(async (req, res) => {
  const data = await createSize(req.body);

  return sendSuccess(res, {
    statusCode: StatusCodes.CREATED,
    message: 'Create size successfully',
    data
  });
});

export const updateSizeController = asyncHandler(async (req, res) => {
  const data = await updateSize(getParam(req.params.sizeId, 'sizeId'), req.body);

  return sendSuccess(res, {
    message: 'Update size successfully',
    data
  });
});

export const deleteSizeController = asyncHandler(async (req, res) => {
  const data = await deleteSize(getParam(req.params.sizeId, 'sizeId'));

  return sendSuccess(res, {
    message: 'Delete size successfully',
    data
  });
});
