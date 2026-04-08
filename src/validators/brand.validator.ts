import { z } from 'zod';

export const listBrandsSchema = z.object({
  query: z.object({
    page: z.string().optional(),
    limit: z.string().optional(),
    search: z.string().optional(),
    isActive: z.enum(['true', 'false']).optional()
  })
});

export const brandIdParamSchema = z.object({
  params: z.object({
    brandId: z.string().min(1)
  })
});

export const createBrandSchema = z.object({
  body: z.object({
    name: z.string().min(1).max(120),
    description: z.string().max(500).optional(),
    isActive: z.boolean().optional()
  })
});

export const updateBrandSchema = z.object({
  params: z.object({
    brandId: z.string().min(1)
  }),
  body: z
    .object({
      name: z.string().min(1).max(120).optional(),
      description: z.string().max(500).nullable().optional(),
      isActive: z.boolean().optional()
    })
    .refine((value) => Object.keys(value).length > 0, {
      message: 'At least one field is required'
    })
});
