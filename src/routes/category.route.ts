import {
  createCategoryController,
  deleteCategoryController,
  getCategoryByIdController,
  listCategoriesController,
  updateCategoryController
} from '@controllers/category.controller';
import { requireBearerAuth } from '@middlewares/auth.middleware';
import { parsePaginationMiddleware } from '@middlewares/pagination.middleware';
import { requireRoles } from '@middlewares/rbac.middleware';
import { validate } from '@middlewares/validate.middleware';
import {
  categoryIdParamSchema,
  createCategorySchema,
  listCategoriesSchema,
  updateCategorySchema
} from '@validators/category.validator';
import { Router } from 'express';

const categoryRouter = Router();

categoryRouter.get(
  '/',
  validate(listCategoriesSchema),
  parsePaginationMiddleware,
  listCategoriesController
);
categoryRouter.get('/:categoryId', validate(categoryIdParamSchema), getCategoryByIdController);

categoryRouter.post(
  '/',
  requireBearerAuth,
  requireRoles('admin'),
  validate(createCategorySchema),
  createCategoryController
);
categoryRouter.patch(
  '/:categoryId',
  requireBearerAuth,
  requireRoles('admin'),
  validate(updateCategorySchema),
  updateCategoryController
);
categoryRouter.delete(
  '/:categoryId',
  requireBearerAuth,
  requireRoles('admin'),
  validate(categoryIdParamSchema),
  deleteCategoryController
);

export default categoryRouter;
