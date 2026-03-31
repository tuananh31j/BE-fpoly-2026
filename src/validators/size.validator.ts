import { z } from 'zod';

export const listSizesSchema = z.object({
  query: z.object({
    page: z.string().optional(),
    limit: z.string().optional(),
    search: z.string().optional(),
    isActive: z.enum(['true', 'false']).optional()
  })
});

export const sizeIdParamSchema = z.object({
  params: z.object({
    sizeId: z.string().min(1)
  })
});

export const createSizeSchema = z.object({
  body: z.object({
    name: z.string().min(1).max(80),
    isActive: z.boolean().optional()
  })
});

export const updateSizeSchema = z.object({
  params: z.object({
    sizeId: z.string().min(1)
  }),
  body: z
    .object({
      name: z.string().min(1).max(80).optional(),
      isActive: z.boolean().optional()
    })
    .refine((value) => Object.keys(value).length > 0, {
      message: 'At least one field is required'
    })
});
