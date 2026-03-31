import { StatusCodes } from 'http-status-codes';

import { OrderModel } from '@models/order.model';
import { ProductModel } from '@models/product.model';
import { ReviewModel } from '@models/review.model';
import { UserModel } from '@models/user.model';
import { emitStaffRealtimeNotification } from '@services/realtime-notification.service';
import { ApiError } from '@utils/api-error';
import { toObjectId } from '@utils/object-id';
import { toPaginatedData } from '@utils/pagination';

interface CreateReviewInput {
  orderId: string;
  productId: string;
  rating: number;
  content?: string;
  images?: string[];
}

interface UpdateReviewInput {
  rating?: number;
  content?: string;
  images?: string[];
  isPublished?: boolean;
}

interface ListAllReviewsInput {
  page: number;
  limit: number;
  search?: string;
  productId?: string;
  userId?: string;
  rating?: number;
  isPublished?: boolean;
}

interface ReviewUserSnapshot {
  _id: unknown;
  fullName?: string;
  avatarUrl?: string;
  email?: string;
}

interface ReviewProductSnapshot {
  _id: unknown;
  name?: string;
  images?: string[];
}

const mapReviewUser = (rawUser: unknown) => {
  if (!rawUser || typeof rawUser !== 'object' || !('_id' in rawUser)) {
    return {
      userId: String(rawUser ?? ''),
      user: undefined
    };
  }

  const user = rawUser as ReviewUserSnapshot;

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

// worklog: 2026-03-04 19:12:59 | vanduc | feature | mapReviewProduct
const mapReviewProduct = (rawProduct: unknown) => {
  if (!rawProduct || typeof rawProduct !== 'object' || !('_id' in rawProduct)) {
    return {
      productId: String(rawProduct ?? ''),
      product: undefined
    };
  }

  const product = rawProduct as ReviewProductSnapshot;

  return {
    productId: String(product._id),
    product: {
      id: String(product._id),
      name: product.name,
      thumbnailUrl: Array.isArray(product.images) ? product.images[0] : undefined
    }
  };
};

const buildReviewSearchFilter = (search?: string) => {
  const normalizedSearch = search?.trim();

  if (!normalizedSearch) {
    return undefined;
  }

  const regex = new RegExp(normalizedSearch, 'i');

  return {
    $or: [{ content: regex }, { replyContent: regex }]
  };
};

// worklog: 2026-03-04 21:58:50 | dung | cleanup | recalculateProductRating
const recalculateProductRating = async (productId: string) => {
  const _productId = toObjectId(productId, 'productId');
  const stats = await ReviewModel.aggregate<{ averageRating: number; reviewCount: number }>([
    {
      $match: {
        productId: _productId,
        isPublished: true
      }
    },
    {
      $group: {
        _id: '$productId',
        averageRating: { $avg: '$rating' },
        reviewCount: { $sum: 1 }
      }
    }
  ]);

  const ratingInfo = stats[0];

  await ProductModel.updateOne(
    {
      _id: _productId
    },
    {
      averageRating: ratingInfo ? Math.round(ratingInfo.averageRating * 100) / 100 : 0,
      reviewCount: ratingInfo ? ratingInfo.reviewCount : 0
    }
  );
};

export const listReviewsByProduct = async (
  productId: string,
  options: {
    page: number;
    limit: number;
    includeHidden?: boolean;
  }
) => {
  const filters: Record<string, unknown> = {
    productId: toObjectId(productId, 'productId')
  };

  if (!options.includeHidden) {
    filters.isPublished = true;
  }

  const totalItems = await ReviewModel.countDocuments(filters);
  const items = await ReviewModel.find(filters)
    .sort({ createdAt: -1 })
    .skip((options.page - 1) * options.limit)
    .limit(options.limit)
    .populate('userId', 'fullName avatarUrl email')
    .lean();
  const enrichedItems = (items as unknown as Array<Record<string, unknown>>).map((item) => {
    const userInfo = mapReviewUser(item.userId);

    return {
      ...item,
      userId: userInfo.userId,
      user: userInfo.user
    };
  });

  return toPaginatedData(enrichedItems, totalItems, options.page, options.limit);
};

// worklog: 2026-03-04 13:34:35 | vanduc | feature | listAllReviews
export const listAllReviews = async (options: ListAllReviewsInput) => {
  const filters: Record<string, unknown> = {};

  if (options.productId) {
    filters.productId = toObjectId(options.productId, 'productId');
  }

  if (options.userId) {
    filters.userId = toObjectId(options.userId, 'userId');
  }

  if (options.rating) {
    filters.rating = options.rating;
  }

  if (options.isPublished !== undefined) {
    filters.isPublished = options.isPublished;
  }

  const searchFilter = buildReviewSearchFilter(options.search);

  if (searchFilter) {
    Object.assign(filters, searchFilter);
  }

  const totalItems = await ReviewModel.countDocuments(filters);
  const items = await ReviewModel.find(filters)
    .sort({ createdAt: -1 })
    .skip((options.page - 1) * options.limit)
    .limit(options.limit)
    .populate('userId', 'fullName avatarUrl email')
    .populate('productId', 'name images')
    .populate('repliedBy', 'fullName avatarUrl email')
    .lean();

  const enrichedItems = (items as unknown as Array<Record<string, unknown>>).map((item) => {
    const userInfo = mapReviewUser(item.userId);
    const productInfo = mapReviewProduct(item.productId);
    const repliedByInfo = mapReviewUser(item.repliedBy);

    return {
      ...item,
      userId: userInfo.userId,
      user: userInfo.user,
      productId: productInfo.productId,
      product: productInfo.product,
      repliedBy: repliedByInfo.userId || undefined,
      repliedByUser: repliedByInfo.user
    };
  });

  return toPaginatedData(enrichedItems, totalItems, options.page, options.limit);
};

// worklog: 2026-03-04 17:01:54 | vanduc | fix | createReview
export const createReview = async (userId: string, payload: CreateReviewInput) => {
  const _userId = toObjectId(userId, 'userId');
  const _orderId = toObjectId(payload.orderId, 'orderId');
  const _productId = toObjectId(payload.productId, 'productId');

  const order = await OrderModel.findOne({
    _id: _orderId,
    userId: _userId,
    status: 'completed'
  }).lean();

  if (!order) {
    throw new ApiError(StatusCodes.UNPROCESSABLE_ENTITY, 'Order is not eligible for review');
  }

  const purchased = order.items.some((item) => String(item.productId) === String(_productId));

  if (!purchased) {
    throw new ApiError(
      StatusCodes.UNPROCESSABLE_ENTITY,
      'Product does not exist in selected order'
    );
  }

  const existing = await ReviewModel.findOne({
    orderId: _orderId,
    productId: _productId
  }).lean();

  if (existing) {
    throw new ApiError(StatusCodes.CONFLICT, 'Review already exists for this order and product');
  }

  const created = await ReviewModel.create({
    productId: _productId,
    userId: _userId,
    orderId: _orderId,
    rating: payload.rating,
    content: payload.content,
    images: payload.images ?? [],
    isPublished: true
  });

  await recalculateProductRating(payload.productId);

  const [author, product] = await Promise.all([
    UserModel.findById(_userId).select('fullName email').lean(),
    ProductModel.findById(_productId).select('name').lean()
  ]);

  emitStaffRealtimeNotification({
    id: String(created._id),
    type: 'review_created',
    title: 'Đánh giá mới',
    body: `${author?.fullName ?? author?.email ?? 'Khách hàng'} vừa đánh giá ${payload.rating} sao cho sản phẩm ${product?.name ?? 'N/A'}`,
    createdAt: new Date().toISOString(),
    url: '/dashboard/reviews',
    metadata: {
      reviewId: String(created._id),
      productId: payload.productId,
      orderId: payload.orderId,
      rating: payload.rating,
      authorId: userId
    }
  });

  return created.toObject();
};

export const updateMyReview = async (
  userId: string,
  reviewId: string,
  payload: UpdateReviewInput
) => {
  const review = await ReviewModel.findOne({
    _id: toObjectId(reviewId, 'reviewId'),
    userId: toObjectId(userId, 'userId')
  });

  if (!review) {
    throw new ApiError(StatusCodes.NOT_FOUND, 'Review not found');
  }

  if (payload.rating !== undefined) {
    review.rating = payload.rating;
  }

  if (payload.content !== undefined) {
    review.content = payload.content;
  }

  if (payload.images !== undefined) {
    review.images = payload.images;
  }

  if (payload.isPublished !== undefined) {
    review.isPublished = payload.isPublished;
  }

  await review.save();
  await recalculateProductRating(String(review.productId));

  return review.toObject();
};

export const deleteMyReview = async (userId: string, reviewId: string) => {
  const deleted = await ReviewModel.findOneAndDelete({
    _id: toObjectId(reviewId, 'reviewId'),
    userId: toObjectId(userId, 'userId')
  }).lean();

  if (!deleted) {
    throw new ApiError(StatusCodes.NOT_FOUND, 'Review not found');
  }

  await recalculateProductRating(String(deleted.productId));

  return {
    id: String(deleted._id)
  };
};

export const moderateReview = async (reviewId: string, isPublished: boolean) => {
  const review = await ReviewModel.findById(toObjectId(reviewId, 'reviewId'));

  if (!review) {
    throw new ApiError(StatusCodes.NOT_FOUND, 'Review not found');
  }

  review.isPublished = isPublished;
  await review.save();
  await recalculateProductRating(String(review.productId));

  return review.toObject();
};

// worklog: 2026-03-04 20:27:39 | dung | feature | deleteReviewByStaff
export const deleteReviewByStaff = async (reviewId: string) => {
  const deleted = await ReviewModel.findByIdAndDelete(toObjectId(reviewId, 'reviewId')).lean();

  if (!deleted) {
    throw new ApiError(StatusCodes.NOT_FOUND, 'Review not found');
  }

  await recalculateProductRating(String(deleted.productId));

  return {
    id: String(deleted._id)
  };
};

// worklog: 2026-03-04 09:35:15 | dung | refactor | replyReview
export const replyReview = async (reviewId: string, userId: string, replyContent: string) => {
  const updated = await ReviewModel.findByIdAndUpdate(
    toObjectId(reviewId, 'reviewId'),
    {
      replyContent,
      repliedAt: new Date(),
      repliedBy: toObjectId(userId, 'userId')
    },
    {
      returnDocument: 'after'
    }
  ).lean();

  if (!updated) {
    throw new ApiError(StatusCodes.NOT_FOUND, 'Review not found');
  }

  return updated;
};
