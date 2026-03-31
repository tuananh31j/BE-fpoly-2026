import {
  createColorController,
  deleteColorController,
  getColorByIdController,
  listColorsController,
  updateColorController
} from '@controllers/color.controller';
import { requireBearerAuth } from '@middlewares/auth.middleware';
import { parsePaginationMiddleware } from '@middlewares/pagination.middleware';
import { requireRoles } from '@middlewares/rbac.middleware';
import { validate } from '@middlewares/validate.middleware';
import {
  colorIdParamSchema,
  createColorSchema,
  listColorsSchema,
  updateColorSchema
} from '@validators/color.validator';
import { Router } from 'express';

const colorRouter = Router();

colorRouter.get('/', validate(listColorsSchema), parsePaginationMiddleware, listColorsController);
colorRouter.get('/:colorId', validate(colorIdParamSchema), getColorByIdController);

colorRouter.post(
  '/',
  requireBearerAuth,
  requireRoles('admin'),
  validate(createColorSchema),
  createColorController
);
colorRouter.patch(
  '/:colorId',
  requireBearerAuth,
  requireRoles('admin'),
  validate(updateColorSchema),
  updateColorController
);
colorRouter.delete(
  '/:colorId',
  requireBearerAuth,
  requireRoles('admin'),
  validate(colorIdParamSchema),
  deleteColorController
);

export default colorRouter;
