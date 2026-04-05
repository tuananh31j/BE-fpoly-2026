import { env } from '@config/env';
import { logger } from '@config/logger';
import { getMailerTransporter, isMailerConfigured } from '@config/mailer';

interface SendMailInput {
  to: string;
  subject: string;
  html: string;
  text?: string;
  from?: string;
  replyTo?: string;
}

const EMAIL_ADDRESS_REGEX = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;

const sanitizeHeaderValue = (value?: string) => {
  return value?.replace(/[\r\n]+/g, ' ').trim();
};

const extractEmailAddress = (value?: string) => {
  const normalized = sanitizeHeaderValue(value);

  if (!normalized) {
    return undefined;
  }

  const angleMatch = normalized.match(/<([^>]+)>/);
  const candidate = (angleMatch ? angleMatch[1] : normalized).trim();

  return EMAIL_ADDRESS_REGEX.test(candidate) ? candidate : undefined;
};

export const sendMail = async (input: SendMailInput) => {
  if (!isMailerConfigured()) {
    logger.warn('Mailer is not configured. Email was not sent.');
    return false;
  }

  const transporter = getMailerTransporter();

  if (!transporter) {
    logger.warn('Mailer transporter unavailable. Email was not sent.');
    return false;
  }

  const configuredFrom = sanitizeHeaderValue(input.from ?? env.SMTP_FROM);
  const fallbackSenderAddress = extractEmailAddress(env.SMTP_USER);
  const senderAddress = extractEmailAddress(configuredFrom) ?? fallbackSenderAddress;
  const senderHeader = extractEmailAddress(configuredFrom) ? configuredFrom : senderAddress;
  const recipientAddress = extractEmailAddress(input.to);
  const replyToAddress = extractEmailAddress(input.replyTo);

  if (!senderAddress || !senderHeader) {
    logger.warn('Mailer sender is invalid. Email was not sent.');
    return false;
  }

  if (!recipientAddress) {
    logger.warn(`Mailer recipient is invalid (${input.to}). Email was not sent.`);
    return false;
  }

  try {
    await transporter.sendMail({
      from: senderHeader,
      to: recipientAddress,
      envelope: {
        from: senderAddress,
        to: recipientAddress
      },
      subject: sanitizeHeaderValue(input.subject) ?? '',
      html: input.html,
      text: input.text,
      replyTo: replyToAddress
    });
  } catch (error) {
    logger.error(`Failed to send email to ${recipientAddress}: ${(error as Error).message}`);
    return false;
  }

  return true;
};
