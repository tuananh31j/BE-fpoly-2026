import { z } from 'zod';

export const upsertCartItemSchema = z.object({
  body: z.object({
    productId: z.string().min(1),
    variantId: z.string().min(1),
    quantity: z.number().int().min(1),
    selectedAttributes: z.record(z.string(), z.unknown()).optional()
  })
});

export const removeCartItemSchema = z.object({
  params: z.object({
    variantId: z.string().min(1)
  })
});
