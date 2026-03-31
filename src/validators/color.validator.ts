import { z } from 'zod';

export const listColorsSchema = z.object({
  query: z.object({
    page: z.string().optional(),
    limit: z.string().optional(),
    search: z.string().optional(),
    isActive: z.enum(['true', 'false']).optional()
  })
});

export const colorIdParamSchema = z.object({
  params: z.object({
    colorId: z.string().min(1)
  })
});

export const createColorSchema = z.object({
  body: z.object({
    name: z.string().min(1).max(80),
    hexCode: z.string().regex(/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/).optional(),
    isActive: z.boolean().optional()
  })
});

export const updateColorSchema = z.object({
  params: z.object({
    colorId: z.string().min(1)
  }),
  body: z
    .object({
      name: z.string().min(1).max(80).optional(),
      hexCode: z
        .string()
        .regex(/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/)
        .nullable()
        .optional(),
      isActive: z.boolean().optional()
    })
    .refine((value) => Object.keys(value).length > 0, {
      message: 'At least one field is required'
    })
});
