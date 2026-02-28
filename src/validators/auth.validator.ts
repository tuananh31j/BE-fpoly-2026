import { z } from 'zod';

const passwordSchema = z.string().min(8).max(64);

export const registerSchema = z.object({
  body: z.object({
    email: z.string().email(),
    password: passwordSchema,
    username: z.string().min(3).max(50).optional(),
    fullName: z.string().min(1).max(120).optional(),
    phone: z.string().min(8).max(20).optional()
  })
});

export const loginSchema = z.object({
  body: z.object({
    email: z.string().email(),
    password: z.string().min(1)
  })
});

export const forgotPasswordSchema = z.object({
  body: z.object({
    email: z.string().email()
  })
});

export const resetPasswordSchema = z.object({
  body: z.object({
    token: z.string().min(1),
    newPassword: passwordSchema
  })
});

export const refreshSchema = z.object({
  body: z.object({
    refreshToken: z.string().min(1)
  })
});

export const logoutSchema = z.object({
  body: z
    .object({
      refreshToken: z.string().min(1).optional()
    })
    .optional()
});
