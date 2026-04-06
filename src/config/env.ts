import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config({ quiet: true });

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_NAME: z.string().default('golden-billiards-be'),
  PORT: z.coerce.number().default(8080),
  API_PREFIX: z.string().default('/api/v1'),
  LOG_LEVEL: z.string().default('info'),
  CORS_ORIGIN: z.string().default('*'),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(15 * 60 * 1000),
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().default(200),

  PAGINATION_DEFAULT_PAGE: z.coerce.number().default(1),
  PAGINATION_DEFAULT_LIMIT: z.coerce.number().default(20),
  PAGINATION_MAX_LIMIT: z.coerce.number().default(100),

  MONGODB_URI: z.string().default('mongodb://127.0.0.1:27017/poly2026'),
  MONGODB_REQUIRE_REPLICA_SET: z.string().default('false'),

  JWT_ACCESS_SECRET: z.string().default('dev-access-secret-change-me'),
  JWT_REFRESH_SECRET: z.string().default('dev-refresh-secret-change-me'),
  JWT_RESET_SECRET: z.string().default('dev-reset-secret-change-me'),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),
  JWT_RESET_EXPIRES_IN: z.string().default('30m'),

  CLOUDINARY_CLOUD_NAME: z.string().optional(),
  CLOUDINARY_API_KEY: z.string().optional(),
  CLOUDINARY_API_SECRET: z.string().optional(),

  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().optional(),
  SMTP_SERVICE: z.string().optional(),
  SMTP_SECURE: z.string().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().optional(),
  WEB_PUSH_SUBJECT: z.string().optional(),
  WEB_PUSH_PUBLIC_KEY: z.string().optional(),
  WEB_PUSH_PRIVATE_KEY: z.string().optional(),

  FRONTEND_URL: z.string().default('http://localhost:3000'),

  VNP_API: z.string().optional(),
  VNP_HASHSECRET: z.string().optional(),
  VNP_RETURNURL: z.string().optional(),
  VNP_TMNCODE: z.string().optional(),
  VNP_URL: z.string().optional(),

  ZALOPAY_APP_ID: z.string().optional(),
  ZALOPAY_KEY1: z.string().optional(),
  ZALOPAY_KEY2: z.string().optional(),
  ZALOPAY_BANK_CODE: z.string().optional(),
  ZALOPAY_CREATE_ENDPOINT: z.string().optional(),
  ZALOPAY_QUERY_ENDPOINT: z.string().optional(),
  ZALOPAY_CALLBACK_URL: z.string().optional(),
  ZALOPAY_REDIRECT_URL: z.string().optional()
});

const parsedEnv = envSchema.parse(process.env);

const LOOPBACK_HOST_ALIASES: Record<string, string[]> = {
  localhost: ['127.0.0.1', '[::1]'],
  '127.0.0.1': ['localhost', '[::1]'],
  '[::1]': ['localhost', '127.0.0.1']
};

const expandLoopbackOrigin = (origin: string) => {
  try {
    const url = new URL(origin);
    const aliases = LOOPBACK_HOST_ALIASES[url.hostname] ?? [];

    return aliases.map((hostname) => {
      const nextUrl = new URL(origin);
      nextUrl.hostname = hostname;
      return nextUrl.toString().replace(/\/$/, '');
    });
  } catch {
    return [];
  }
};

const parseOrigins = (value: string) => {
  if (value.trim() === '*') {
    return '*';
  }

  const origins = value
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  const normalizedOrigins = new Set<string>();

  origins.forEach((origin) => {
    normalizedOrigins.add(origin.replace(/\/$/, ''));

    expandLoopbackOrigin(origin).forEach((aliasOrigin) => {
      normalizedOrigins.add(aliasOrigin);
    });
  });

  return Array.from(normalizedOrigins);
};

export const env = {
  ...parsedEnv,
  corsOriginList: parseOrigins(parsedEnv.CORS_ORIGIN),
  mongoRequireReplicaSet: parsedEnv.MONGODB_REQUIRE_REPLICA_SET === 'true',
  isProduction: parsedEnv.NODE_ENV === 'production',
  isDevelopment: parsedEnv.NODE_ENV === 'development',
  isTest: parsedEnv.NODE_ENV === 'test'
};
