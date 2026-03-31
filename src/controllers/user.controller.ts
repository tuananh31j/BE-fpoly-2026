import { StatusCodes } from 'http-status-codes';

import { createUser, deleteUser, getUserById, listUsers, updateUser } from '@services/user.service';
import { asyncHandler } from '@utils/async-handler';
import { getParam } from '@utils/request';
import { sendSuccess } from '@utils/response';

export const listUsersController = asyncHandler(async (req, res) => {
  const data = await listUsers({
    page: res.locals.pagination?.page ?? 1,
    limit: res.locals.pagination?.limit ?? 20,
    role: req.query.role as 'customer' | 'staff' | 'admin' | undefined,
    search: req.query.search as string | undefined,
    isActive:
      typeof req.query.isActive === 'string'
        ? req.query.isActive === 'true'
        : undefined
  });

  return sendSuccess(res, {
    message: 'Get users successfully',
    data
  });
});

export const getUserByIdController = asyncHandler(async (req, res) => {
  const data = await getUserById(getParam(req.params.userId, 'userId'));

  return sendSuccess(res, {
    message: 'Get user successfully',
    data
  });
});

export const createUserController = asyncHandler(async (req, res) => {
  const data = await createUser(req.body);

  return sendSuccess(res, {
    statusCode: StatusCodes.CREATED,
    message: 'Create user successfully',
    data
  });
});

export const updateUserController = asyncHandler(async (req, res) => {
  const data = await updateUser(getParam(req.params.userId, 'userId'), req.body);

  return sendSuccess(res, {
    message: 'Update user successfully',
    data
  });
});

export const deleteUserController = asyncHandler(async (req, res) => {
  const data = await deleteUser(getParam(req.params.userId, 'userId'));

  return sendSuccess(res, {
    message: 'Delete user successfully',
    data
  });
});
