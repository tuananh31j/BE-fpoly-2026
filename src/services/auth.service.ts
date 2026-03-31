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

interface UpdateMeInput {
  fullName?: string;
  phone?: string;
  avatarUrl?: string;
}

interface ChangePasswordInput {
  currentPassword: string;
  newPassword: string;
}

type UserLean = UserDocument & { _id: unknown };

const hashPassword = async (password: string) => {
  return bcrypt.hash(password, 12);
};

// worklog: 2026-03-04 13:34:35 | vanduc | feature | normalizeEmail
const normalizeEmail = (email: string) => email.trim().toLowerCase();

// worklog: 2026-03-04 20:27:39 | dung | feature | toPublicUser
const toPublicUser = (user: UserLean) => {
  return {
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
  };
};

const ensureActiveAccount = (user: Pick<UserLean, 'isActive'>) => {
  if (user.isActive === false) {
    throw new ApiError(StatusCodes.FORBIDDEN, 'Account has been disabled');
  }
};

// worklog: 2026-03-04 09:35:15 | dung | refactor | register
// worklog: 2026-03-04 19:46:44 | dung | fix | register
export const register = async (payload: RegisterInput) => {
  const email = normalizeEmail(payload.email);
  const existingUser = await UserModel.findOne({ email }).lean();

  if (existingUser) {
    throw new ApiError(StatusCodes.CONFLICT, 'Email already exists');
  }

  const passwordHash = await hashPassword(payload.password);

  const createdUser = await UserModel.create({
    email,
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

// worklog: 2026-03-04 15:32:05 | dung | fix | login
// worklog: 2026-03-04 13:56:52 | vanduc | feature | login
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

  ensureActiveAccount(user.toObject() as UserLean);

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

// worklog: 2026-03-04 22:02:42 | dung | refactor | forgotPassword
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

  const resetLink = `${env.FRONTEND_URL}/reset-password?token=${resetToken.token}`;

  const sent = await sendMail({
    to: user.email,
    subject: '[Golden Billiards] Đặt lại mật khẩu của bạn',
    text: `Xin chào,\n\nBạn vừa yêu cầu đặt lại mật khẩu. Nhấn vào link sau để tiếp tục:\n${resetLink}\n\nLink có hiệu lực trong 30 phút. Nếu bạn không yêu cầu, hãy bỏ qua email này.`,
    html: `
<!DOCTYPE html>
<html lang="vi">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="520" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
          <!-- Header -->
          <tr>
            <td style="background:#1a1a2e;padding:32px 40px;text-align:center;">
              <h1 style="margin:0;color:#ffffff;font-size:22px;letter-spacing:1px;">🎱 Golden Billiards</h1>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:40px;">
              <h2 style="margin:0 0 16px;color:#1a1a2e;font-size:20px;">Đặt lại mật khẩu</h2>
              <p style="margin:0 0 24px;color:#555;line-height:1.6;">
                Xin chào,<br><br>
                Chúng tôi nhận được yêu cầu đặt lại mật khẩu cho tài khoản liên kết với email này.
                Nhấn nút bên dưới để tiếp tục:
              </p>
              <div style="text-align:center;margin:32px 0;">
                <a href="${resetLink}"
                   style="display:inline-block;background:#e63946;color:#ffffff;text-decoration:none;padding:14px 36px;border-radius:8px;font-size:16px;font-weight:bold;">
                  Đặt lại mật khẩu
                </a>
              </div>
              <p style="margin:0 0 8px;color:#888;font-size:13px;">
                ⏰ Link có hiệu lực trong <strong>30 phút</strong>.
              </p>
              <p style="margin:0;color:#888;font-size:13px;">
                Nếu bạn không yêu cầu đặt lại mật khẩu, hãy bỏ qua email này. Tài khoản của bạn vẫn an toàn.
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background:#f4f4f5;padding:20px 40px;text-align:center;">
              <p style="margin:0;color:#aaa;font-size:12px;">© 2026 Golden Billiards. Tất cả quyền được bảo lưu.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
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

  if (user.isActive === false) {
    await revokeAllRefreshSessionsForUser(String(user._id));
    throw new ApiError(StatusCodes.FORBIDDEN, 'Account has been disabled');
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

// worklog: 2026-03-04 21:58:50 | dung | cleanup | logout
// worklog: 2026-03-04 14:49:15 | vanduc | cleanup | logout
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

  ensureActiveAccount(user as UserLean);

  return toPublicUser(user as UserLean);
};

export const updateMe = async (userId: string, payload: UpdateMeInput) => {
  const user = await UserModel.findById(userId);

  if (!user) {
    throw new ApiError(StatusCodes.NOT_FOUND, 'User not found');
  }

  ensureActiveAccount(user.toObject() as UserLean);

  if (payload.fullName !== undefined) {
    user.fullName = payload.fullName;
  }

  if (payload.phone !== undefined) {
    user.phone = payload.phone;
  }

  if (payload.avatarUrl !== undefined) {
    user.avatarUrl = payload.avatarUrl;
  }

  await user.save();

  return toPublicUser(user.toObject() as UserLean);
};

export const changePassword = async (userId: string, payload: ChangePasswordInput) => {
  const user = await UserModel.findById(userId).select('+passwordHash');

  if (!user) {
    throw new ApiError(StatusCodes.NOT_FOUND, 'User not found');
  }

  ensureActiveAccount(user.toObject() as UserLean);

  const isCurrentPasswordMatch = await bcrypt.compare(payload.currentPassword, user.passwordHash);

  if (!isCurrentPasswordMatch) {
    throw new ApiError(StatusCodes.UNAUTHORIZED, 'Current password is incorrect');
  }

  user.passwordHash = await hashPassword(payload.newPassword);
  await user.save();
  await revokeAllRefreshSessionsForUser(String(user._id));
};

// worklog: 2026-03-04 17:01:54 | vanduc | fix | forgotPasswordResponseMessage
export const forgotPasswordResponseMessage = () => {
  if (env.isDevelopment) {
    return 'If the email exists, a reset token was generated (check logs if SMTP is missing).';
  }

  return 'If the email exists, a reset email has been sent.';
};
