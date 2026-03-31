import {
  createReviewController,
  deleteReviewByStaffController,
  deleteMyReviewController,
  listAllReviewsController,
  listReviewsByProductController,
  moderateReviewController,
  replyReviewController,
  updateMyReviewController
} from '@controllers/review.controller';
import { requireBearerAuth } from '@middlewares/auth.middleware';
import { parsePaginationMiddleware } from '@middlewares/pagination.middleware';
import { requireRoles } from '@middlewares/rbac.middleware';
import { validate } from '@middlewares/validate.middleware';
import {
  createReviewSchema,
  listAdminReviewsSchema,
  listReviewsSchema,
  moderateReviewSchema,
  replyReviewSchema,
  reviewIdParamSchema,
  updateReviewSchema
} from '@validators/review.validator';
import { Router } from 'express';

const reviewRouter = Router();

reviewRouter.get(
  '/admin/all',
  requireBearerAuth,
  requireRoles('staff', 'admin'),
  validate(listAdminReviewsSchema),
  parsePaginationMiddleware,
  listAllReviewsController
);
reviewRouter.get(
  '/product/:productId',
  validate(listReviewsSchema),
  parsePaginationMiddleware,
  listReviewsByProductController
);
reviewRouter.post('/', requireBearerAuth, validate(createReviewSchema), createReviewController);
reviewRouter.patch(
  '/:reviewId',
  requireBearerAuth,
  validate(updateReviewSchema),
  updateMyReviewController
);
reviewRouter.delete(
  '/:reviewId',
  requireBearerAuth,
  validate(reviewIdParamSchema),
  deleteMyReviewController
);
reviewRouter.patch(
  '/:reviewId/moderate',
  requireBearerAuth,
  requireRoles('staff', 'admin'),
  validate(moderateReviewSchema),
  moderateReviewController
);
reviewRouter.patch(
  '/:reviewId/reply',
  requireBearerAuth,
  requireRoles('staff', 'admin'),
  validate(replyReviewSchema),
  replyReviewController
);
reviewRouter.delete(
  '/:reviewId/admin',
  requireBearerAuth,
  requireRoles('staff', 'admin'),
  validate(reviewIdParamSchema),
  deleteReviewByStaffController
);

export default reviewRouter;
