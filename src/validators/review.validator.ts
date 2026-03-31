import { z } from 'zod';

export const listReviewsSchema = z.object({
  params: z.object({
    productId: z.string().min(1)
  }),
  query: z.object({
    page: z.string().optional(),
    limit: z.string().optional(),
    includeHidden: z.enum(['true', 'false']).optional()
  })
});

export const listAdminReviewsSchema = z.object({
  query: z.object({
    page: z.string().optional(),
    limit: z.string().optional(),
    search: z.string().optional(),
    productId: z.string().optional(),
    userId: z.string().optional(),
    rating: z.enum(['1', '2', '3', '4', '5']).optional(),
    isPublished: z.enum(['true', 'false']).optional()
  })
});

export const createReviewSchema = z.object({
  body: z.object({
    orderId: z.string().min(1),
    productId: z.string().min(1),
    rating: z.number().int().min(1).max(5),
    content: z.string().max(2000).optional(),
    images: z.array(z.string()).optional()
  })
});

export const reviewIdParamSchema = z.object({
  params: z.object({
    reviewId: z.string().min(1)
  })
});

export const moderateReviewSchema = z.object({
  params: z.object({
    reviewId: z.string().min(1)
  }),
  body: z.object({
    isPublished: z.boolean()
  })
});

export const updateReviewSchema = z.object({
  params: z.object({
    reviewId: z.string().min(1)
  }),
  body: z
    .object({
      rating: z.number().int().min(1).max(5).optional(),
      content: z.string().max(2000).optional(),
      images: z.array(z.string()).optional(),
      isPublished: z.boolean().optional()
    })
    .refine((value) => Object.keys(value).length > 0, {
      message: 'At least one field is required'
    })
});

export const replyReviewSchema = z.object({
  params: z.object({
    reviewId: z.string().min(1)
  }),
  body: z.object({
    replyContent: z.string().min(1).max(2000)
  })
});
