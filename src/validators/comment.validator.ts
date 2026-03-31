import { z } from 'zod';

export const listCommentsSchema = z.object({
  query: z.object({
    targetId: z.string().min(1),
    targetModel: z.literal('product'),
    page: z.string().optional(),
    limit: z.string().optional(),
    includeHidden: z.enum(['true', 'false']).optional()
  })
});

export const listAdminCommentsSchema = z.object({
  query: z.object({
    page: z.string().optional(),
    limit: z.string().optional(),
    search: z.string().optional(),
    targetModel: z.literal('product').optional(),
    targetId: z.string().optional(),
    userId: z.string().optional(),
    isHidden: z.enum(['true', 'false']).optional()
  })
});

export const createCommentSchema = z.object({
  body: z.object({
    targetId: z.string().min(1),
    targetModel: z.literal('product'),
    content: z.string().min(1).max(2000),
    parentId: z.string().optional()
  })
});

export const commentIdParamSchema = z.object({
  params: z.object({
    commentId: z.string().min(1)
  })
});

export const updateCommentVisibilitySchema = z.object({
  params: z.object({
    commentId: z.string().min(1)
  }),
  body: z.object({
    isHidden: z.boolean()
  })
});
