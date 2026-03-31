import {
  createSizeController,
  deleteSizeController,
  getSizeByIdController,
  listSizesController,
  updateSizeController
} from '@controllers/size.controller';
import { requireBearerAuth } from '@middlewares/auth.middleware';
import { parsePaginationMiddleware } from '@middlewares/pagination.middleware';
import { requireRoles } from '@middlewares/rbac.middleware';
import { validate } from '@middlewares/validate.middleware';
import {
  createSizeSchema,
  listSizesSchema,
  sizeIdParamSchema,
  updateSizeSchema
} from '@validators/size.validator';
import { Router } from 'express';

const sizeRouter = Router();

sizeRouter.get('/', validate(listSizesSchema), parsePaginationMiddleware, listSizesController);
sizeRouter.get('/:sizeId', validate(sizeIdParamSchema), getSizeByIdController);

sizeRouter.post(
  '/',
  requireBearerAuth,
  requireRoles('admin'),
  validate(createSizeSchema),
  createSizeController
);
sizeRouter.patch(
  '/:sizeId',
  requireBearerAuth,
  requireRoles('admin'),
  validate(updateSizeSchema),
  updateSizeController
);
sizeRouter.delete(
  '/:sizeId',
  requireBearerAuth,
  requireRoles('admin'),
  validate(sizeIdParamSchema),
  deleteSizeController
);

export default sizeRouter;
