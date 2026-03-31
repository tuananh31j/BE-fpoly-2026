import type { Response } from 'express';

import { localizeMessage } from '@utils/message-localize';

export const sendSuccess = <T>(
  res: Response,
  options: { statusCode?: number; message: string; data?: T }
) => {
  const { statusCode = 200, message, data } = options;

  return res.status(statusCode).json({
    success: true,
    message: localizeMessage(message),
    data
  });
};
