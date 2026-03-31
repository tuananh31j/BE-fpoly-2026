import {
  clearMyCartController,
  getMyCartController,
  removeMyCartItemController,
  upsertMyCartItemController
} from '@controllers/cart.controller';
import { requireBearerAuth } from '@middlewares/auth.middleware';
import { validate } from '@middlewares/validate.middleware';
import { removeCartItemSchema, upsertCartItemSchema } from '@validators/cart.validator';
import { Router } from 'express';

const cartRouter = Router();

cartRouter.use(requireBearerAuth);
cartRouter.get('/', getMyCartController);
cartRouter.put('/items', validate(upsertCartItemSchema), upsertMyCartItemController);
cartRouter.delete('/items/:variantId', validate(removeCartItemSchema), removeMyCartItemController);
cartRouter.delete('/items', clearMyCartController);

export default cartRouter;
