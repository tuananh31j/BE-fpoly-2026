import bcrypt from 'bcryptjs';
import { StatusCodes } from 'http-status-codes';

import type { Role } from '@/types/domain';
import { UserModel, type UserDocument } from '@models/user.model';
import { ApiError } from '@utils/api-error';
import { toObjectId } from '@utils/object-id';
import { toPaginatedData } from '@utils/pagination';

type UserWithId = UserDocument & { _id: unknown };

interface CreateUserInput {
  email: string;
  password: string;
  fullName?: string;
  phone?: string;
  role?: Role;
}

interface UpdateUserInput {
  fullName?: string;
  phone?: string;
  role?: Role;
  isActive?: boolean;
  avatarUrl?: string;
  staffStartDate?: Date;
  password?: string;
}

const toPublicUser = (user: UserWithId) => ({
  id: String(user._id),
  email: user.email,
  isActive: user.isActive !== false,
  fullName: user.fullName,
  phone: user.phone,
  role: user.role,
  avatarUrl: user.avatarUrl,
  staffStartDate: user.staffStartDate,
  createdAt: user.createdAt,
  updatedAt: user.updatedAt
});

const normalizeEmail = (email: string) => email.trim().toLowerCase();

const ensureNoConflict = async (email: string, excludedUserId?: string) => {
  const query: Record<string, unknown> = { email };

  if (excludedUserId) {
    query._id = {
      $ne: toObjectId(excludedUserId, 'userId')
    };
  }

  const existing = await UserModel.findOne(query).lean();

  if (!existing) {
    return;
  }

  throw new ApiError(StatusCodes.CONFLICT, 'Email already exists');
};

export const listUsers = async (options: {
  page: number;
  limit: number;
  role?: Role;
  search?: string;
  isActive?: boolean;
}) => {
  const filters: Record<string, unknown> = {};

  if (options.role) {
    filters.role = options.role;
  }

  if (options.search?.trim()) {
    const regex = new RegExp(options.search.trim(), 'i');
    filters.$or = [{ email: regex }, { fullName: regex }];
  }

  if (options.isActive !== undefined) {
    filters.isActive = options.isActive ? { $ne: false } : false;
  }

  const totalItems = await UserModel.countDocuments(filters);
  const items = await UserModel.find(filters)
    .sort({ createdAt: -1 })
    .skip((options.page - 1) * options.limit)
    .limit(options.limit)
    .lean();

  return toPaginatedData(
    items.map((item) => toPublicUser(item as UserWithId)),
    totalItems,
    options.page,
    options.limit
  );
};

export const getUserById = async (userId: string) => {
  const user = await UserModel.findById(toObjectId(userId, 'userId')).lean();

  if (!user) {
    throw new ApiError(StatusCodes.NOT_FOUND, 'User not found');
  }

  return toPublicUser(user as UserWithId);
};

export const createUser = async (payload: CreateUserInput) => {
  if (payload.role === 'admin') {
    throw new ApiError(StatusCodes.FORBIDDEN, 'Admin role cannot be created via API');
  }

  const email = normalizeEmail(payload.email);
  await ensureNoConflict(email);

  const passwordHash = await bcrypt.hash(payload.password, 12);
  const createdUser = await UserModel.create({
    email,
    passwordHash,
    fullName: payload.fullName,
    phone: payload.phone,
    role: payload.role ?? 'customer'
  });

  return toPublicUser(createdUser.toObject() as UserWithId);
};

export const updateUser = async (userId: string, payload: UpdateUserInput) => {
  const _userId = toObjectId(userId, 'userId');
  const user = await UserModel.findById(_userId).select('+passwordHash');

  if (!user) {
    throw new ApiError(StatusCodes.NOT_FOUND, 'User not found');
  }

  if (payload.fullName !== undefined) {
    user.fullName = payload.fullName;
  }

  if (payload.phone !== undefined) {
    user.phone = payload.phone;
  }

  if (payload.role !== undefined) {
    if (payload.role === 'admin') {
      throw new ApiError(StatusCodes.FORBIDDEN, 'Admin role cannot be assigned via API');
    }

    user.role = payload.role;
  }

  if (payload.isActive !== undefined) {
    if (user.role === 'admin' && payload.isActive === false) {
      throw new ApiError(StatusCodes.FORBIDDEN, 'Admin account cannot be deactivated');
    }

    user.isActive = payload.isActive;
  }

  if (payload.avatarUrl !== undefined) {
    user.avatarUrl = payload.avatarUrl;
  }

  if (payload.staffStartDate !== undefined) {
    user.staffStartDate = payload.staffStartDate;
  }

  if (payload.password !== undefined) {
    user.passwordHash = await bcrypt.hash(payload.password, 12);
  }

  await user.save();

  return toPublicUser(user.toObject() as UserWithId);
};

export const deleteUser = async (userId: string) => {
  const deleted = await UserModel.findByIdAndDelete(toObjectId(userId, 'userId')).lean();

  if (!deleted) {
    throw new ApiError(StatusCodes.NOT_FOUND, 'User not found');
  }

  return {
    id: String(deleted._id)
  };
};
