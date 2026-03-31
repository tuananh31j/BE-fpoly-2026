import { StatusCodes } from 'http-status-codes';

import {
  createComment,
  deleteComment,
  listAllComments,
  listComments,
  updateCommentVisibility
} from '@services/comment.service';
import { ApiError } from '@utils/api-error';
import { asyncHandler } from '@utils/async-handler';
import { getOptionalParam, getParam } from '@utils/request';
import { sendSuccess } from '@utils/response';
import type { Request } from 'express';

const getAuth = (req: Request) => {
  const userId = req.user?.id;
  const role = req.user?.role;

  if (!userId || !role) {
    throw new ApiError(StatusCodes.UNAUTHORIZED, 'Unauthorized');
  }

  return {
    userId,
    role
  };
};

export const listCommentsController = asyncHandler(async (req, res) => {
  const data = await listComments({
    targetId: req.query.targetId as string,
    page: res.locals.pagination?.page ?? 1,
    limit: res.locals.pagination?.limit ?? 20,
    includeHidden:
      req.query.includeHidden !== undefined &&
      String(req.query.includeHidden).toLowerCase() === 'true'
  });

  return sendSuccess(res, {
    message: 'Get comments successfully',
    data
  });
});

export const listAllCommentsController = asyncHandler(async (req, res) => {
  const rawIsHidden = getOptionalParam(req.query.isHidden as string | string[] | undefined);

  const data = await listAllComments({
    page: res.locals.pagination?.page ?? 1,
    limit: res.locals.pagination?.limit ?? 20,
    search: getOptionalParam(req.query.search as string | string[] | undefined),
    targetModel: getOptionalParam(req.query.targetModel as string | string[] | undefined) as
      | 'product'
      | undefined,
    targetId: getOptionalParam(req.query.targetId as string | string[] | undefined),
    userId: getOptionalParam(req.query.userId as string | string[] | undefined),
    isHidden: rawIsHidden === undefined ? undefined : rawIsHidden === 'true'
  });

  return sendSuccess(res, {
    message: 'Get all comments successfully',
    data
  });
});

export const createCommentController = asyncHandler(async (req, res) => {
  const { userId } = getAuth(req);
  const data = await createComment(userId, req.body);

  return sendSuccess(res, {
    statusCode: StatusCodes.CREATED,
    message: 'Create comment successfully',
    data
  });
});

export const updateCommentVisibilityController = asyncHandler(async (req, res) => {
  const data = await updateCommentVisibility(
    getParam(req.params.commentId, 'commentId'),
    req.body.isHidden
  );

  return sendSuccess(res, {
    message: 'Update comment visibility successfully',
    data
  });
});

export const deleteCommentController = asyncHandler(async (req, res) => {
  const { userId, role } = getAuth(req);
  const data = await deleteComment(getParam(req.params.commentId, 'commentId'), userId, role);

  return sendSuccess(res, {
    message: 'Delete comment successfully',
    data
  });
});
