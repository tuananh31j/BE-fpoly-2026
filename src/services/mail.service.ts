import { env } from '@config/env';
import { logger } from '@config/logger';
import { getMailerTransporter, isMailerConfigured } from '@config/mailer';

interface SendMailInput {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export const sendMail = async (input: SendMailInput) => {
  if (!isMailerConfigured()) {
    logger.warn('Mailer is not configured. Email was not sent.');
    return false;
  }

  const transporter = getMailerTransporter();

  if (!transporter || !env.SMTP_FROM) {
    logger.warn('Mailer transporter unavailable. Email was not sent.');
    return false;
  }

  await transporter.sendMail({
    from: env.SMTP_FROM,
    to: input.to,
    subject: input.subject,
    html: input.html,
    text: input.text
  });

  return true;
};
