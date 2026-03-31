import { StatusCodes } from 'http-status-codes';

import type { CommentTargetModel, Role } from '@/types/domain';
import { CommentModel } from '@models/comment.model';
import { ProductModel } from '@models/product.model';
import { UserModel } from '@models/user.model';
import { emitStaffRealtimeNotification } from '@services/realtime-notification.service';
import { ApiError } from '@utils/api-error';
import { toObjectId } from '@utils/object-id';
import { toPaginatedData } from '@utils/pagination';

interface CreateCommentInput {
  targetId: string;
  targetModel: CommentTargetModel;
  content: string;
  parentId?: string;
}

interface ListAllCommentsInput {
  page: number;
  limit: number;
  search?: string;
  targetModel?: CommentTargetModel;
  targetId?: string;
  userId?: string;
  isHidden?: boolean;
}

interface CommentUserSnapshot {
  _id: unknown;
  fullName?: string;
  avatarUrl?: string;
  email?: string;
}

interface CommentTargetProductSnapshot {
  _id: unknown;
  name?: string;
  images?: string[];
}

const mapCommentUser = (rawUser: unknown) => {
  if (!rawUser || typeof rawUser !== 'object' || !('_id' in rawUser)) {
    return {
      userId: String(rawUser ?? ''),
      user: undefined
    };
  }

  const user = rawUser as CommentUserSnapshot;

  return {
    userId: String(user._id),
    user: {
      id: String(user._id),
      fullName: user.fullName,
      avatarUrl: user.avatarUrl,
      email: user.email
    }
  };
};

const buildCommentSearchFilter = (search?: string) => {
  const normalizedSearch = search?.trim();

  if (!normalizedSearch) {
    return undefined;
  }

  return {
    content: new RegExp(normalizedSearch, 'i')
  };
};

const ensureTargetExists = async (targetId: string) => {
  const product = await ProductModel.findById(toObjectId(targetId, 'targetId'))
    .select('name')
    .lean();

  if (!product) {
    throw new ApiError(StatusCodes.NOT_FOUND, 'Product not found');
  }

  return product;
};

export const createComment = async (userId: string, payload: CreateCommentInput) => {
  const product = await ensureTargetExists(payload.targetId);

  if (payload.parentId) {
    const parent = await CommentModel.findById(toObjectId(payload.parentId, 'parentId')).lean();

    if (!parent) {
      throw new ApiError(StatusCodes.NOT_FOUND, 'Parent comment not found');
    }

    if (
      String(parent.targetId) !== payload.targetId ||
      parent.targetModel !== payload.targetModel
    ) {
      throw new ApiError(
        StatusCodes.UNPROCESSABLE_ENTITY,
        'Parent comment target does not match current target'
      );
    }
  }

  const created = await CommentModel.create({
    targetId: toObjectId(payload.targetId, 'targetId'),
    targetModel: payload.targetModel,
    userId: toObjectId(userId, 'userId'),
    content: payload.content,
    parentId: payload.parentId ? toObjectId(payload.parentId, 'parentId') : undefined,
    isHidden: false
  });

  const author = await UserModel.findById(toObjectId(userId, 'userId'))
    .select('fullName email')
    .lean();

  emitStaffRealtimeNotification({
    id: String(created._id),
    type: 'comment_created',
    title: 'Bình luận mới',
    body: `${author?.fullName ?? author?.email ?? 'Khách hàng'} vừa bình luận về sản phẩm ${product.name}`,
    createdAt: new Date().toISOString(),
    url: '/dashboard/comments',
    metadata: {
      commentId: String(created._id),
      targetId: payload.targetId,
      targetModel: payload.targetModel,
      parentId: payload.parentId,
      authorId: userId
    }
  });

  return created.toObject();
};

export const listComments = async (options: {
  targetId: string;
  page: number;
  limit: number;
  includeHidden?: boolean;
}) => {
  const filters: Record<string, unknown> = {
    targetId: toObjectId(options.targetId, 'targetId'),
    targetModel: 'product'
  };

  if (!options.includeHidden) {
    filters.isHidden = false;
  }

  const totalItems = await CommentModel.countDocuments(filters);
  const items = await CommentModel.find(filters)
    .sort({ createdAt: -1 })
    .skip((options.page - 1) * options.limit)
    .limit(options.limit)
    .populate('userId', 'fullName avatarUrl email')
    .lean();
  const enrichedItems = (items as unknown as Array<Record<string, unknown>>).map((item) => {
    const userInfo = mapCommentUser(item.userId);

    return {
      ...item,
      userId: userInfo.userId,
      user: userInfo.user
    };
  });

  return toPaginatedData(enrichedItems, totalItems, options.page, options.limit);
};

export const listAllComments = async (options: ListAllCommentsInput) => {
  const filters: Record<string, unknown> = {
    targetModel: 'product'
  };

  if (options.targetModel) {
    filters.targetModel = options.targetModel;
  }

  if (options.targetId) {
    filters.targetId = toObjectId(options.targetId, 'targetId');
  }

  if (options.userId) {
    filters.userId = toObjectId(options.userId, 'userId');
  }

  if (options.isHidden !== undefined) {
    filters.isHidden = options.isHidden;
  }

  const searchFilter = buildCommentSearchFilter(options.search);

  if (searchFilter) {
    Object.assign(filters, searchFilter);
  }

  const totalItems = await CommentModel.countDocuments(filters);
  const items = await CommentModel.find(filters)
    .sort({ createdAt: -1 })
    .skip((options.page - 1) * options.limit)
    .limit(options.limit)
    .populate('userId', 'fullName avatarUrl email')
    .lean();

  const productTargetIds = new Set<string>();

  for (const item of items as unknown as Array<Record<string, unknown>>) {
    const targetId = String(item.targetId ?? '');

    if (!targetId) {
      continue;
    }

    productTargetIds.add(targetId);
  }

  const products =
    productTargetIds.size > 0
      ? await ProductModel.find(
        {
            _id: {
              $in: [...productTargetIds].map((targetId) => toObjectId(targetId, 'targetId'))
            }
          },
          {
            name: 1,
            images: 1
          }
        ).lean()
      : [];

  const productMap = new Map<string, CommentTargetProductSnapshot>(
    products.map((product) => [String(product._id), product as unknown as CommentTargetProductSnapshot])
  );

  const enrichedItems = (items as unknown as Array<Record<string, unknown>>).map((item) => {
    const userInfo = mapCommentUser(item.userId);
    const targetModel: CommentTargetModel = 'product';
    const targetId = String(item.targetId ?? '');
    const target = productMap.get(targetId);

    return {
      ...item,
      userId: userInfo.userId,
      user: userInfo.user,
      targetId,
      targetModel,
      parentId: item.parentId ? String(item.parentId) : undefined,
      target: {
        id: targetId,
        targetModel,
        name: target?.name,
        thumbnailUrl: Array.isArray(target?.images) ? target.images[0] : undefined
      }
    };
  });

  return toPaginatedData(enrichedItems, totalItems, options.page, options.limit);
};

export const updateCommentVisibility = async (commentId: string, isHidden: boolean) => {
  const updated = await CommentModel.findByIdAndUpdate(
    toObjectId(commentId, 'commentId'),
    {
      isHidden
    },
    {
      returnDocument: 'after'
    }
  ).lean();

  if (!updated) {
    throw new ApiError(StatusCodes.NOT_FOUND, 'Comment not found');
  }

  return updated;
};

export const deleteComment = async (
  commentId: string,
  requesterId: string,
  requesterRole: Role
) => {
  const comment = await CommentModel.findById(toObjectId(commentId, 'commentId')).lean();

  if (!comment) {
    throw new ApiError(StatusCodes.NOT_FOUND, 'Comment not found');
  }

  const isOwner = String(comment.userId) === requesterId;
  const canModerate = requesterRole === 'staff' || requesterRole === 'admin';

  if (!isOwner && !canModerate) {
    throw new ApiError(StatusCodes.FORBIDDEN, 'You are not allowed to delete this comment');
  }

  await CommentModel.deleteMany({
    $or: [
      {
        _id: comment._id
      },
      {
        parentId: comment._id
      }
    ]
  });

  return {
    id: String(comment._id)
  };
};
