import nodemailer from 'nodemailer';

import { env } from '@config/env';
import { logger } from '@config/logger';

const normalizedSmtpUser = env.SMTP_USER?.trim();
const normalizedSmtpPass = env.SMTP_PASS?.replace(/\s+/g, '');
const normalizedSmtpService = env.SMTP_SERVICE?.trim().toLowerCase();
const smtpHostFromEnv = env.SMTP_HOST?.trim();

const shouldUseGmailDefaults =
  normalizedSmtpService === 'gmail' ||
  (!normalizedSmtpService && Boolean(normalizedSmtpUser?.toLowerCase().endsWith('@gmail.com')));

const smtpService = shouldUseGmailDefaults ? 'gmail' : normalizedSmtpService;
const smtpHost = smtpHostFromEnv || (shouldUseGmailDefaults ? 'smtp.gmail.com' : undefined);
const smtpPort = env.SMTP_PORT ?? (shouldUseGmailDefaults ? 465 : undefined);
const smtpSecure = env.SMTP_SECURE ? env.SMTP_SECURE === 'true' : smtpPort === 465;

const mailerConfigured = Boolean(
  normalizedSmtpUser && normalizedSmtpPass && ((smtpService && smtpService.length > 0) || smtpHost)
);

const mailTransporter = mailerConfigured
  ? nodemailer.createTransport({
      ...(smtpService ? { service: smtpService } : { host: smtpHost, port: smtpPort }),
      secure: smtpSecure,
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 15000,
      auth: {
        user: normalizedSmtpUser,
        pass: normalizedSmtpPass
      }
    })
  : null;

export const verifyMailer = async () => {
  if (!mailTransporter) {
    logger.warn('Nodemailer is not configured. Missing SMTP credentials or SMTP host/service.');
    return;
  }

  try {
    await mailTransporter.verify();
    logger.info(
      `Nodemailer connected (${smtpService ? `service=${smtpService}` : `host=${smtpHost}:${String(
        smtpPort ?? ''
      )}`}, secure=${String(smtpSecure)})`
    );
  } catch (error) {
    logger.error(`Nodemailer verification failed: ${(error as Error).message}`);
  }
};

export const getMailerTransporter = () => mailTransporter;

export const isMailerConfigured = () => mailerConfigured;
