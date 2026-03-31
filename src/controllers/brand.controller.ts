import { StatusCodes } from 'http-status-codes';

import {
  createBrand,
  deleteBrand,
  getBrandById,
  listBrands,
  updateBrand
} from '@services/brand.service';
import { asyncHandler } from '@utils/async-handler';
import { getParam } from '@utils/request';
import { sendSuccess } from '@utils/response';

export const listBrandsController = asyncHandler(async (req, res) => {
  const data = await listBrands({
    page: res.locals.pagination?.page ?? 1,
    limit: res.locals.pagination?.limit ?? 20,
    search: req.query.search as string | undefined,
    isActive:
      req.query.isActive === undefined
        ? undefined
        : String(req.query.isActive).toLowerCase() === 'true'
  });

  return sendSuccess(res, {
    message: 'Get brands successfully',
    data
  });
});

export const getBrandByIdController = asyncHandler(async (req, res) => {
  const data = await getBrandById(getParam(req.params.brandId, 'brandId'));

  return sendSuccess(res, {
    message: 'Get brand successfully',
    data
  });
});

export const createBrandController = asyncHandler(async (req, res) => {
  const data = await createBrand(req.body);

  return sendSuccess(res, {
    statusCode: StatusCodes.CREATED,
    message: 'Create brand successfully',
    data
  });
});

export const updateBrandController = asyncHandler(async (req, res) => {
  const data = await updateBrand(getParam(req.params.brandId, 'brandId'), req.body);

  return sendSuccess(res, {
    message: 'Update brand successfully',
    data
  });
});

export const deleteBrandController = asyncHandler(async (req, res) => {
  const data = await deleteBrand(getParam(req.params.brandId, 'brandId'));

  return sendSuccess(res, {
    message: 'Delete brand successfully',
    data
  });
});
