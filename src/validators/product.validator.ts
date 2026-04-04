import { z } from 'zod';

const featuredLimitSchema = z.string().regex(/^\d+$/).optional();

export const listProductsSchema = z.object({
  query: z.object({
    page: z.string().optional(),
    limit: z.string().optional(),
    categoryId: z.string().optional(),
    brandId: z.string().optional(),
    brand: z.string().optional(),
    colorIds: z.string().optional(),
    sizeIds: z.string().optional(),
    priceRanges: z.string().optional(),
    search: z.string().optional(),
    isAvailable: z.enum(['true', 'false']).optional()
  })
});

export const featuredProductsSchema = z.object({
  query: z.object({
    limit: featuredLimitSchema
  })
});

export const productIdParamSchema = z.object({
  params: z.object({
    productId: z.string().min(1)
  })
});

export const createProductSchema = z.object({
  body: z
    .object({
      name: z.string().min(1).max(255),
      categoryId: z.string().min(1),
      brandId: z.string().min(1).optional(),
      brand: z.string().min(1).max(120).optional(),
      description: z.string().optional(),
      attributes: z.record(z.string(), z.unknown()).optional(),
      images: z.array(z.string()).optional(),
      isAvailable: z.boolean().optional()
    })
    .refine((value) => Boolean(value.brandId || value.brand), {
      message: 'brandId or brand is required',
      path: ['brandId']
    })
});

export const updateProductSchema = z.object({
  params: z.object({
    productId: z.string().min(1)
  }),
  body: z
    .object({
      name: z.string().min(1).max(255).optional(),
      categoryId: z.string().min(1).optional(),
      brandId: z.string().min(1).optional(),
      brand: z.string().min(1).max(120).optional(),
      description: z.string().optional(),
      attributes: z.record(z.string(), z.unknown()).optional(),
      images: z.array(z.string()).optional(),
      isAvailable: z.boolean().optional()
    })
    .refine((value) => Object.keys(value).length > 0, {
      message: 'At least one field is required'
    })
});

export const listProductVariantsSchema = z.object({
  params: z.object({
    productId: z.string().min(1)
  }),
  query: z.object({
    page: z.string().optional(),
    limit: z.string().optional()
  })
});

export const variantIdParamSchema = z.object({
  params: z.object({
    productId: z.string().min(1),
    variantId: z.string().min(1)
  })
});

export const createVariantSchema = z.object({
  params: z.object({
    productId: z.string().min(1)
  }),
  body: z.object({
    sku: z.string().min(1).max(100).optional(),
    colorId: z.string().min(1).optional(),
    sizeId: z.string().min(1).optional(),
    size: z.string().min(1).max(50).optional(),
    price: z.number().nonnegative(),
    originalPrice: z.number().nonnegative().optional(),
    stockQuantity: z.number().int().nonnegative().optional(),
    isAvailable: z.boolean().optional(),
    images: z.array(z.string()).optional()
  })
});

export const updateVariantSchema = z.object({
  params: z.object({
    productId: z.string().min(1),
    variantId: z.string().min(1)
  }),
  body: z
    .object({
      sku: z.string().min(1).max(100).optional(),
      colorId: z.string().min(1).nullable().optional(),
      sizeId: z.string().min(1).nullable().optional(),
      size: z.string().min(1).max(50).optional(),
      price: z.number().nonnegative().optional(),
      originalPrice: z.number().nonnegative().optional(),
      stockQuantity: z.number().int().nonnegative().optional(),
      isAvailable: z.boolean().optional(),
      images: z.array(z.string()).optional()
    })
    .refine((value) => Object.keys(value).length > 0, {
      message: 'At least one field is required'
    })
});
