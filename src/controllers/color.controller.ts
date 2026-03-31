import { StatusCodes } from 'http-status-codes';

import {
  createColor,
  deleteColor,
  getColorById,
  listColors,
  updateColor
} from '@services/color.service';
import { asyncHandler } from '@utils/async-handler';
import { getParam } from '@utils/request';
import { sendSuccess } from '@utils/response';

export const listColorsController = asyncHandler(async (req, res) => {
  const data = await listColors({
    page: res.locals.pagination?.page ?? 1,
    limit: res.locals.pagination?.limit ?? 20,
    search: req.query.search as string | undefined,
    isActive:
      req.query.isActive === undefined
        ? undefined
        : String(req.query.isActive).toLowerCase() === 'true'
  });

  return sendSuccess(res, {
    message: 'Get colors successfully',
    data
  });
});

export const getColorByIdController = asyncHandler(async (req, res) => {
  const data = await getColorById(getParam(req.params.colorId, 'colorId'));

  return sendSuccess(res, {
    message: 'Get color successfully',
    data
  });
});

export const createColorController = asyncHandler(async (req, res) => {
  const data = await createColor(req.body);

  return sendSuccess(res, {
    statusCode: StatusCodes.CREATED,
    message: 'Create color successfully',
    data
  });
});

export const updateColorController = asyncHandler(async (req, res) => {
  const data = await updateColor(getParam(req.params.colorId, 'colorId'), req.body);

  return sendSuccess(res, {
    message: 'Update color successfully',
    data
  });
});

export const deleteColorController = asyncHandler(async (req, res) => {
  const data = await deleteColor(getParam(req.params.colorId, 'colorId'));

  return sendSuccess(res, {
    message: 'Delete color successfully',
    data
  });
});
