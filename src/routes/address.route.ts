import {
  createMyAddressController,
  deleteMyAddressController,
  listMyAddressesController,
  updateMyAddressController
} from '@controllers/address.controller';
import { requireBearerAuth } from '@middlewares/auth.middleware';
import { validate } from '@middlewares/validate.middleware';
import {
  addressIdParamSchema,
  createAddressSchema,
  updateAddressSchema
} from '@validators/address.validator';
import { Router } from 'express';

const addressRouter = Router();

addressRouter.use(requireBearerAuth);
addressRouter.get('/', listMyAddressesController);
addressRouter.post('/', validate(createAddressSchema), createMyAddressController);
addressRouter.patch('/:addressId', validate(updateAddressSchema), updateMyAddressController);
addressRouter.delete('/:addressId', validate(addressIdParamSchema), deleteMyAddressController);

export default addressRouter;
