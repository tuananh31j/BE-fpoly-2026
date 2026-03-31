import {
  createBrandController,
  deleteBrandController,
  getBrandByIdController,
  listBrandsController,
  updateBrandController
} from '@controllers/brand.controller';
import { requireBearerAuth } from '@middlewares/auth.middleware';
import { parsePaginationMiddleware } from '@middlewares/pagination.middleware';
import { requireRoles } from '@middlewares/rbac.middleware';
import { validate } from '@middlewares/validate.middleware';
import {
  brandIdParamSchema,
  createBrandSchema,
  listBrandsSchema,
  updateBrandSchema
} from '@validators/brand.validator';
import { Router } from 'express';

const brandRouter = Router();

brandRouter.get('/', validate(listBrandsSchema), parsePaginationMiddleware, listBrandsController);
brandRouter.get('/:brandId', validate(brandIdParamSchema), getBrandByIdController);

brandRouter.post(
  '/',
  requireBearerAuth,
  requireRoles('admin'),
  validate(createBrandSchema),
  createBrandController
);
brandRouter.patch(
  '/:brandId',
  requireBearerAuth,
  requireRoles('admin'),
  validate(updateBrandSchema),
  updateBrandController
);
brandRouter.delete(
  '/:brandId',
  requireBearerAuth,
  requireRoles('admin'),
  validate(brandIdParamSchema),
  deleteBrandController
);

export default brandRouter;
