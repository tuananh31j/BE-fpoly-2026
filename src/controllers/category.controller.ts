import { StatusCodes } from 'http-status-codes';

import {
  createCategory,
  deleteCategory,
  getCategoryById,
  listCategories,
  updateCategory
} from '@services/category.service';
import { asyncHandler } from '@utils/async-handler';
import { getParam } from '@utils/request';
import { sendSuccess } from '@utils/response';

export const listCategoriesController = asyncHandler(async (req, res) => {
  const data = await listCategories({
    page: res.locals.pagination?.page ?? 1,
    limit: res.locals.pagination?.limit ?? 20,
    search: req.query.search as string | undefined,
    isActive:
      req.query.isActive === undefined
        ? undefined
        : String(req.query.isActive).toLowerCase() === 'true'
  });

  return sendSuccess(res, {
    message: 'Get categories successfully',
    data
  });
});

export const getCategoryByIdController = asyncHandler(async (req, res) => {
  const data = await getCategoryById(getParam(req.params.categoryId, 'categoryId'));

  return sendSuccess(res, {
    message: 'Get category successfully',
    data
  });
});

export const createCategoryController = asyncHandler(async (req, res) => {
  const data = await createCategory(req.body);

  return sendSuccess(res, {
    statusCode: StatusCodes.CREATED,
    message: 'Create category successfully',
    data
  });
});

export const updateCategoryController = asyncHandler(async (req, res) => {
  const data = await updateCategory(getParam(req.params.categoryId, 'categoryId'), req.body);

  return sendSuccess(res, {
    message: 'Update category successfully',
    data
  });
});

export const deleteCategoryController = asyncHandler(async (req, res) => {
  const data = await deleteCategory(getParam(req.params.categoryId, 'categoryId'));

  return sendSuccess(res, {
    message: 'Delete category successfully',
    data
  });
});
