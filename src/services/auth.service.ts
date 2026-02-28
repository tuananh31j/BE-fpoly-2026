import bcrypt from 'bcryptjs';
import { StatusCodes } from 'http-status-codes';

import type { Role } from '@/types/domain';
import { env } from '@config/env';
import { logger } from '@config/logger';
import { UserModel, type UserDocument } from '@models/user.model';
import { sendMail } from '@services/mail.service';
import {
  consumePasswordResetToken,
  createAccessToken,
  issueAuthTokens,
  issuePasswordResetToken,
  revokeAllRefreshSessionsForUser,
  revokeRefreshSession,
  rotateRefreshToken,
  verifyRefreshToken
} from '@services/token.service';
import { ApiError } from '@utils/api-error';

interface RegisterInput {
  email: string;
  password: string;
  username?: string;
  fullName?: string;
  phone?: string;
}

interface LoginInput {
  email: string;
  password: string;
}

interface ForgotPasswordInput {
  email: string;
}

interface ResetPasswordInput {
  token: string;
  newPassword: string;
}

interface RefreshInput {
  refreshToken: string;
}

interface LogoutInput {
  userId: string;
  refreshToken?: string;
}

type UserLean = UserDocument & { _id: unknown };

const hashPassword = async (password: string) => {
  return bcrypt.hash(password, 12);
};

const normalizeEmail = (email: string) => email.trim().toLowerCase();

const normalizeUsername = (username?: string) => username?.trim().toLowerCase();

const toPublicUser = (user: UserLean) => {
  return {
    id: String(user._id),
    email: user.email,
    username: user.username,
    fullName: user.fullName,
    phone: user.phone,
    role: user.role,
    avatarUrl: user.avatarUrl,
    loyaltyPoints: user.loyaltyPoints,
    membershipTier: user.membershipTier,
    staffDepartment: user.staffDepartment,
    staffStartDate: user.staffStartDate,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt
  };
};

export const register = async (payload: RegisterInput) => {
  const email = normalizeEmail(payload.email);
  const username = normalizeUsername(payload.username);

  const conflictConditions: Array<Record<string, string>> = [{ email }];

  if (username) {
    conflictConditions.push({ username });
  }

  const existingUser = await UserModel.findOne({ $or: conflictConditions }).lean();

  if (existingUser) {
    if (existingUser.email === email) {
      throw new ApiError(StatusCodes.CONFLICT, 'Email already exists');
    }

    throw new ApiError(StatusCodes.CONFLICT, 'Username already exists');
  }

  const passwordHash = await hashPassword(payload.password);

  const createdUser = await UserModel.create({
    email,
    username,
    passwordHash,
    fullName: payload.fullName,
    phone: payload.phone,
    role: 'customer'
  });

  const user = createdUser.toObject() as UserLean;
  const tokens = await issueAuthTokens({
    userId: String(user._id),
    email: user.email,
    role: user.role as Role
  });

  return {
    user: toPublicUser(user),
    tokens
  };
};

export const login = async (payload: LoginInput) => {
  const email = normalizeEmail(payload.email);

  const user = await UserModel.findOne({ email }).select('+passwordHash');

  if (!user) {
    throw new ApiError(StatusCodes.UNAUTHORIZED, 'Invalid email or password');
  }

  const isPasswordMatch = await bcrypt.compare(payload.password, user.passwordHash);

  if (!isPasswordMatch) {
    throw new ApiError(StatusCodes.UNAUTHORIZED, 'Invalid email or password');
  }

  const userObject = user.toObject() as UserLean;
  const tokens = await issueAuthTokens({
    userId: String(userObject._id),
    email: userObject.email,
    role: userObject.role as Role
  });

  return {
    user: toPublicUser(userObject),
    tokens
  };
};

export const forgotPassword = async (payload: ForgotPasswordInput) => {
  const email = normalizeEmail(payload.email);
  const user = await UserModel.findOne({ email }).lean();

  if (!user) {
    return;
  }

  const resetToken = await issuePasswordResetToken({
    userId: String(user._id),
    email: user.email
  });

  const sent = await sendMail({
    to: user.email,
    subject: 'Reset your password',
    text: `Use this token to reset password: ${resetToken.token}`,
    html: `<p>Use this token to reset password:</p><pre>${resetToken.token}</pre>`
  });

  if (!sent) {
    logger.warn(`Mailer unavailable. Password reset token for ${user.email}: ${resetToken.token}`);
  }
};

export const resetPassword = async (payload: ResetPasswordInput) => {
  const tokenPayload = await consumePasswordResetToken(payload.token);
  const user = await UserModel.findById(tokenPayload.sub);

  if (!user) {
    throw new ApiError(StatusCodes.NOT_FOUND, 'User not found');
  }

  user.passwordHash = await hashPassword(payload.newPassword);
  await user.save();

  await revokeAllRefreshSessionsForUser(String(user._id));
};

export const refreshAuthTokens = async (payload: RefreshInput) => {
  const rotated = await rotateRefreshToken(payload.refreshToken);
  const user = await UserModel.findById(rotated.userId).lean();

  if (!user) {
    throw new ApiError(StatusCodes.UNAUTHORIZED, 'Invalid refresh token');
  }

  const accessToken = createAccessToken({
    userId: String(user._id),
    email: user.email,
    role: user.role
  });

  return {
    accessToken,
    refreshToken: rotated.refreshToken
  };
};

export const logout = async (payload: LogoutInput) => {
  if (!payload.refreshToken) {
    return;
  }

  const refreshPayload = verifyRefreshToken(payload.refreshToken);

  if (refreshPayload.sub !== payload.userId) {
    throw new ApiError(StatusCodes.UNAUTHORIZED, 'Refresh token does not belong to user');
  }

  await revokeRefreshSession(refreshPayload.sub, refreshPayload.jti);
};

export const getMe = async (userId: string) => {
  const user = await UserModel.findById(userId).lean();

  if (!user) {
    throw new ApiError(StatusCodes.NOT_FOUND, 'User not found');
  }

  return toPublicUser(user as UserLean);
};

export const forgotPasswordResponseMessage = () => {
  if (env.isDevelopment) {
    return 'If the email exists, a reset token was generated (check logs if SMTP is missing).';
  }

  return 'If the email exists, a reset email has been sent.';
};
