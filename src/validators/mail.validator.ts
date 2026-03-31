import { z } from 'zod';

export const sendTestMailSchema = z.object({
  body: z
    .object({
      to: z.string().email().optional()
    })
    .default({})
});
