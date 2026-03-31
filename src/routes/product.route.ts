import {
  createProductController,
  createProductVariantController,
  deleteProductController,
  deleteProductVariantController,
  getProductByIdController,
  listProductFiltersController,
  listNewestProductsController,
  listProductsController,
  listProductVariantsController,
  listTopSellingProductsController,
  updateProductController,
  updateProductVariantController
} from '@controllers/product.controller';
import { requireBearerAuth } from '@middlewares/auth.middleware';
import { parsePaginationMiddleware } from '@middlewares/pagination.middleware';
import { requireRoles } from '@middlewares/rbac.middleware';
import { validate } from '@middlewares/validate.middleware';
import {
  createProductSchema,
  createVariantSchema,
  featuredProductsSchema,
  listProductsSchema,
  listProductVariantsSchema,
  productIdParamSchema,
  updateProductSchema,
  updateVariantSchema,
  variantIdParamSchema
} from '@validators/product.validator';
import { Router } from 'express';

const productRouter = Router();

productRouter.get(
  '/',
  validate(listProductsSchema),
  parsePaginationMiddleware,
  listProductsController
);
productRouter.get('/top-selling', validate(featuredProductsSchema), listTopSellingProductsController);
productRouter.get('/newest', validate(featuredProductsSchema), listNewestProductsController);
productRouter.get('/filters', listProductFiltersController);
productRouter.get('/:productId', validate(productIdParamSchema), getProductByIdController);
productRouter.get(
  '/:productId/variants',
  validate(listProductVariantsSchema),
  parsePaginationMiddleware,
  listProductVariantsController
);

productRouter.post(
  '/',
  requireBearerAuth,
  requireRoles('admin'),
  validate(createProductSchema),
  createProductController
);
productRouter.patch(
  '/:productId',
  requireBearerAuth,
  requireRoles('admin'),
  validate(updateProductSchema),
  updateProductController
);
productRouter.delete(
  '/:productId',
  requireBearerAuth,
  requireRoles('admin'),
  validate(productIdParamSchema),
  deleteProductController
);

productRouter.post(
  '/:productId/variants',
  requireBearerAuth,
  requireRoles('admin'),
  validate(createVariantSchema),
  createProductVariantController
);
productRouter.patch(
  '/:productId/variants/:variantId',
  requireBearerAuth,
  requireRoles('admin'),
  validate(updateVariantSchema),
  updateProductVariantController
);
productRouter.delete(
  '/:productId/variants/:variantId',
  requireBearerAuth,
  requireRoles('admin'),
  validate(variantIdParamSchema),
  deleteProductVariantController
);

export default productRouter;
