import crypto from 'node:crypto';

import { StatusCodes } from 'http-status-codes';

import type { Role } from '@/types/domain';
import { env } from '@config/env';
import { ApiError } from '@utils/api-error';
import { signJwt, verifyJwt } from '@utils/jwt';

interface AccessTokenPayload {
  sub: string;
  email: string;
  role: Role;
  type: 'access';
  iat: number;
  exp: number;
}

interface RefreshTokenPayload {
  sub: string;
  jti: string;
  type: 'refresh';
  iat: number;
  exp: number;
}

interface PasswordResetTokenPayload {
  sub: string;
  email: string;
  jti: string;
  type: 'password_reset';
  iat: number;
  exp: number;
}

const consumedPasswordResetJtis = new Set<string>();

const parseDurationToSeconds = (value: string) => {
  const input = value.trim().toLowerCase();
  const directNumber = Number.parseInt(input, 10);

  if (Number.isInteger(directNumber) && String(directNumber) === input) {
    return Math.max(directNumber, 1);
  }

  const matched = input.match(/^(\d+)([smhd])$/);

  if (!matched) {
    return 900;
  }

  const amount = Number.parseInt(matched[1], 10);
  const unit = matched[2];

  switch (unit) {
    case 's':
      return amount;
    case 'm':
      return amount * 60;
    case 'h':
      return amount * 60 * 60;
    case 'd':
      return amount * 24 * 60 * 60;
    default:
      return 900;
  }
};

const accessTtlSeconds = parseDurationToSeconds(env.JWT_ACCESS_EXPIRES_IN);
const refreshTtlSeconds = parseDurationToSeconds(env.JWT_REFRESH_EXPIRES_IN);
const passwordResetTtlSeconds = parseDurationToSeconds(env.JWT_RESET_EXPIRES_IN);

export const createAccessToken = (payload: { userId: string; email: string; role: Role }) => {
  return signJwt(
    {
      sub: payload.userId,
      email: payload.email,
      role: payload.role,
      type: 'access' as const
    },
    env.JWT_ACCESS_SECRET,
    {
      expiresIn: accessTtlSeconds
    }
  );
};

const createRefreshToken = (userId: string) => {
  const jti = crypto.randomUUID();
  const token = signJwt(
    {
      sub: userId,
      jti,
      type: 'refresh' as const
    },
    env.JWT_REFRESH_SECRET,
    {
      expiresIn: refreshTtlSeconds
    }
  );

  return { token, jti };
};

const createPasswordResetToken = (payload: { userId: string; email: string }) => {
  const jti = crypto.randomUUID();
  const token = signJwt(
    {
      sub: payload.userId,
      email: payload.email,
      jti,
      type: 'password_reset' as const
    },
    env.JWT_RESET_SECRET,
    {
      expiresIn: passwordResetTtlSeconds
    }
  );

  return { token, jti };
};

export const storeRefreshSession = async (_userId: string, _jti: string) => {
  return;
};

export const revokeRefreshSession = async (_userId: string, _jti: string) => {
  return;
};

export const revokeAllRefreshSessionsForUser = async (_userId: string) => {
  return;
};

export const issueAuthTokens = async (payload: { userId: string; email: string; role: Role }) => {
  const accessToken = createAccessToken(payload);
  const refresh = createRefreshToken(payload.userId);

  return {
    accessToken,
    refreshToken: refresh.token
  };
};

export const issuePasswordResetToken = async (payload: { userId: string; email: string }) => {
  const reset = createPasswordResetToken(payload);

  return {
    token: reset.token
  };
};

export const verifyAccessToken = (token: string) => {
  const payload = verifyJwt<AccessTokenPayload>(token, env.JWT_ACCESS_SECRET);

  if (payload.type !== 'access') {
    throw new ApiError(StatusCodes.UNAUTHORIZED, 'Invalid access token type');
  }

  return payload;
};

export const verifyRefreshToken = (token: string) => {
  const payload = verifyJwt<RefreshTokenPayload>(token, env.JWT_REFRESH_SECRET);

  if (payload.type !== 'refresh') {
    throw new ApiError(StatusCodes.UNAUTHORIZED, 'Invalid refresh token type');
  }

  return payload;
};

export const rotateRefreshToken = async (refreshToken: string) => {
  const payload = verifyRefreshToken(refreshToken);
  const rotated = createRefreshToken(payload.sub);

  return {
    userId: payload.sub,
    refreshToken: rotated.token
  };
};

export const consumePasswordResetToken = async (token: string) => {
  const payload = verifyJwt<PasswordResetTokenPayload>(token, env.JWT_RESET_SECRET);

  if (payload.type !== 'password_reset') {
    throw new ApiError(StatusCodes.UNAUTHORIZED, 'Invalid reset token type');
  }

  if (consumedPasswordResetJtis.has(payload.jti)) {
    throw new ApiError(StatusCodes.UNAUTHORIZED, 'Reset token is invalid or expired');
  }

  consumedPasswordResetJtis.add(payload.jti);
  return payload;
};
