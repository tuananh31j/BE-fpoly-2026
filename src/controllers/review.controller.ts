import { StatusCodes } from 'http-status-codes';

import {
  createReview,
  deleteReviewByStaff,
  deleteMyReview,
  listAllReviews,
  listReviewsByProduct,
  moderateReview,
  replyReview,
  updateMyReview
} from '@services/review.service';
import { ApiError } from '@utils/api-error';
import { asyncHandler } from '@utils/async-handler';
import { getOptionalParam, getParam } from '@utils/request';
import { sendSuccess } from '@utils/response';
import type { Request } from 'express';

const getUserId = (req: Request) => {
  const userId = req.user?.id;

  if (!userId) {
    throw new ApiError(StatusCodes.UNAUTHORIZED, 'Unauthorized');
  }

  return userId;
};

export const listReviewsByProductController = asyncHandler(async (req, res) => {
  const data = await listReviewsByProduct(getParam(req.params.productId, 'productId'), {
    page: res.locals.pagination?.page ?? 1,
    limit: res.locals.pagination?.limit ?? 20,
    includeHidden:
      req.query.includeHidden !== undefined &&
      String(req.query.includeHidden).toLowerCase() === 'true'
  });

  return sendSuccess(res, {
    message: 'Get reviews successfully',
    data
  });
});

export const listAllReviewsController = asyncHandler(async (req, res) => {
  const rawRating = getOptionalParam(req.query.rating as string | string[] | undefined);
  const rawIsPublished = getOptionalParam(req.query.isPublished as string | string[] | undefined);

  const data = await listAllReviews({
    page: res.locals.pagination?.page ?? 1,
    limit: res.locals.pagination?.limit ?? 20,
    search: getOptionalParam(req.query.search as string | string[] | undefined),
    productId: getOptionalParam(req.query.productId as string | string[] | undefined),
    userId: getOptionalParam(req.query.userId as string | string[] | undefined),
    rating: rawRating ? Number(rawRating) : undefined,
    isPublished: rawIsPublished === undefined ? undefined : rawIsPublished === 'true'
  });

  return sendSuccess(res, {
    message: 'Get all reviews successfully',
    data
  });
});

export const createReviewController = asyncHandler(async (req, res) => {
  const data = await createReview(getUserId(req), req.body);

  return sendSuccess(res, {
    statusCode: StatusCodes.CREATED,
    message: 'Create review successfully',
    data
  });
});

export const updateMyReviewController = asyncHandler(async (req, res) => {
  const data = await updateMyReview(
    getUserId(req),
    getParam(req.params.reviewId, 'reviewId'),
    req.body
  );

  return sendSuccess(res, {
    message: 'Update review successfully',
    data
  });
});

export const deleteMyReviewController = asyncHandler(async (req, res) => {
  const data = await deleteMyReview(getUserId(req), getParam(req.params.reviewId, 'reviewId'));

  return sendSuccess(res, {
    message: 'Delete review successfully',
    data
  });
});

export const moderateReviewController = asyncHandler(async (req, res) => {
  const data = await moderateReview(getParam(req.params.reviewId, 'reviewId'), req.body.isPublished);

  return sendSuccess(res, {
    message: 'Moderate review successfully',
    data
  });
});

export const deleteReviewByStaffController = asyncHandler(async (req, res) => {
  const data = await deleteReviewByStaff(getParam(req.params.reviewId, 'reviewId'));

  return sendSuccess(res, {
    message: 'Delete review successfully',
    data
  });
});

export const replyReviewController = asyncHandler(async (req, res) => {
  const data = await replyReview(
    getParam(req.params.reviewId, 'reviewId'),
    getUserId(req),
    req.body.replyContent
  );

  return sendSuccess(res, {
    message: 'Reply review successfully',
    data
  });
});
