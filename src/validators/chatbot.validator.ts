import { z } from 'zod';

const objectIdSchema = z.string().trim().regex(/^[a-f\d]{24}$/i, 'Invalid ObjectId');

const chatbotContextSchema = z
  .object({
    path: z.string().trim().min(1).max(300).optional()
  })
  .optional();

export const askChatbotSchema = z.object({
  body: z.object({
    presetId: objectIdSchema,
    context: chatbotContextSchema
  })
});

export const createChatbotPresetSchema = z.object({
  body: z.object({
    question: z.string().trim().min(2).max(200),
    answer: z.string().trim().max(2000).optional(),
    productIds: z.array(objectIdSchema).min(1),
    isActive: z.boolean().optional(),
    sortOrder: z.coerce.number().int().min(0).optional()
  })
});

export const updateChatbotPresetSchema = z.object({
  body: z
    .object({
      question: z.string().trim().min(2).max(200).optional(),
      answer: z.string().trim().max(2000).optional(),
      productIds: z.array(objectIdSchema).min(1).optional(),
      isActive: z.boolean().optional(),
      sortOrder: z.coerce.number().int().min(0).optional()
    })
    .refine((value) => Object.keys(value).length > 0, {
      message: 'At least one field is required'
    })
});

export const chatbotPresetParamSchema = z.object({
  params: z.object({
    presetId: objectIdSchema
  })
});
