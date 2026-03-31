import {
  createUserController,
  deleteUserController,
  getUserByIdController,
  listUsersController,
  updateUserController
} from '@controllers/user.controller';
import { requireBearerAuth } from '@middlewares/auth.middleware';
import { parsePaginationMiddleware } from '@middlewares/pagination.middleware';
import { requireRoles } from '@middlewares/rbac.middleware';
import { validate } from '@middlewares/validate.middleware';
import {
  createUserSchema,
  listUsersSchema,
  updateUserSchema,
  userIdParamSchema
} from '@validators/user.validator';
import { Router } from 'express';

const userRouter = Router();

userRouter.use(requireBearerAuth, requireRoles('admin'));
userRouter.get('/', validate(listUsersSchema), parsePaginationMiddleware, listUsersController);
userRouter.post('/', validate(createUserSchema), createUserController);
userRouter.get('/:userId', validate(userIdParamSchema), getUserByIdController);
userRouter.patch('/:userId', validate(updateUserSchema), updateUserController);
userRouter.delete('/:userId', validate(userIdParamSchema), deleteUserController);

export default userRouter;
