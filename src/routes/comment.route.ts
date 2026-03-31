import {
  createCommentController,
  deleteCommentController,
  listAllCommentsController,
  listCommentsController,
  updateCommentVisibilityController
} from '@controllers/comment.controller';
import { requireBearerAuth } from '@middlewares/auth.middleware';
import { parsePaginationMiddleware } from '@middlewares/pagination.middleware';
import { requireRoles } from '@middlewares/rbac.middleware';
import { validate } from '@middlewares/validate.middleware';
import {
  commentIdParamSchema,
  createCommentSchema,
  listAdminCommentsSchema,
  listCommentsSchema,
  updateCommentVisibilitySchema
} from '@validators/comment.validator';
import { Router } from 'express';

const commentRouter = Router();

commentRouter.get(
  '/admin/all',
  requireBearerAuth,
  requireRoles('staff', 'admin'),
  validate(listAdminCommentsSchema),
  parsePaginationMiddleware,
  listAllCommentsController
);
commentRouter.get(
  '/',
  validate(listCommentsSchema),
  parsePaginationMiddleware,
  listCommentsController
);
commentRouter.post('/', requireBearerAuth, validate(createCommentSchema), createCommentController);
commentRouter.patch(
  '/:commentId/visibility',
  requireBearerAuth,
  requireRoles('staff', 'admin'),
  validate(updateCommentVisibilitySchema),
  updateCommentVisibilityController
);
commentRouter.delete(
  '/:commentId',
  requireBearerAuth,
  validate(commentIdParamSchema),
  deleteCommentController
);

export default commentRouter;
