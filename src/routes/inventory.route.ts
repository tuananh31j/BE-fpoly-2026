import {
  adjustStockController,
  listInventoryLogsController
} from '@controllers/inventory.controller';
import { requireBearerAuth } from '@middlewares/auth.middleware';
import { parsePaginationMiddleware } from '@middlewares/pagination.middleware';
import { requireRoles } from '@middlewares/rbac.middleware';
import { validate } from '@middlewares/validate.middleware';
import { adjustStockSchema, listInventoryLogsSchema } from '@validators/inventory.validator';
import { Router } from 'express';

const inventoryRouter = Router();

inventoryRouter.use(requireBearerAuth, requireRoles('staff', 'admin'));
inventoryRouter.get(
  '/logs',
  validate(listInventoryLogsSchema),
  parsePaginationMiddleware,
  listInventoryLogsController
);
inventoryRouter.post('/adjustments', validate(adjustStockSchema), adjustStockController);

export default inventoryRouter;
