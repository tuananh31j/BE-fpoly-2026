import { StatusCodes } from 'http-status-codes';

import { ChatbotPresetModel, type ChatbotPresetDocument } from '@models/chatbot-preset.model';
import { ProductModel } from '@models/product.model';
import { ProductVariantModel } from '@models/product-variant.model';
import { ApiError } from '@utils/api-error';
import { Types } from 'mongoose';

export type ChatbotIntent = 'preset';

export interface AskChatbotInput {
  presetId: string;
  context?: {
    path?: string;
  };
}

export interface ChatbotAction {
  label: string;
  url: string;
}

export interface ChatbotPresetOption {
  id: string;
  question: string;
}

export interface ChatbotSuggestedProduct {
  id: string;
  name: string;
  brand: string;
  imageUrl: string | null;
  priceFrom: number | null;
  soldCount: number;
  averageRating: number;
  url: string;
}

export interface AskChatbotResult {
  intent: ChatbotIntent;
  answer: string;
  actions: ChatbotAction[];
  followUpQuestions: ChatbotPresetOption[];
  suggestedProducts: ChatbotSuggestedProduct[];
}

export interface AdminChatbotPresetProduct {
  id: string;
  name: string;
  brand: string;
  imageUrl: string | null;
  isAvailable: boolean;
}

export interface AdminChatbotPresetItem {
  id: string;
  question: string;
  answer?: string;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  products: AdminChatbotPresetProduct[];
}

export interface UpsertChatbotPresetInput {
  question?: string;
  answer?: string;
  productIds?: string[];
  isActive?: boolean;
  sortOrder?: number;
}

interface ProductSnapshot {
  _id: unknown;
  name?: string;
  brand?: string;
  images?: string[];
  isAvailable?: boolean;
  soldCount?: number;
  averageRating?: number;
}

const toObjectId = (value: string) => new Types.ObjectId(value);

const normalizeProductIds = (productIds: string[]) => {
  const normalized = Array.from(
    new Set(productIds.map((item) => item.trim()).filter(Boolean))
  );

  if (normalized.length === 0) {
    throw new ApiError(StatusCodes.BAD_REQUEST, 'At least one chatbot product is required');
  }

  if (!normalized.every((item) => Types.ObjectId.isValid(item))) {
    throw new ApiError(StatusCodes.BAD_REQUEST, 'Invalid productIds');
  }

  return normalized;
};

const ensureProductsExist = async (productIds: string[]) => {
  const count = await ProductModel.countDocuments({
    _id: {
      $in: productIds.map((item) => toObjectId(item))
    }
  });

  if (count !== productIds.length) {
    throw new ApiError(StatusCodes.BAD_REQUEST, 'Some selected products do not exist');
  }
};

const buildChatbotPresetOptions = async (excludePresetId?: string) => {
  const filter: Record<string, unknown> = {
    isActive: true
  };

  if (excludePresetId && Types.ObjectId.isValid(excludePresetId)) {
    filter._id = {
      $ne: toObjectId(excludePresetId)
    };
  }

  const presets = (await ChatbotPresetModel.find(filter)
    .sort({ sortOrder: 1, updatedAt: -1 })
    .select('question')
    .lean()) as Array<{ _id: unknown; question?: string }>;

  return presets.map((preset) => ({
    id: String(preset._id ?? ''),
    question: preset.question?.trim() || 'Câu hỏi mẫu'
  }));
};

const getProductSnapshotsByIds = async (productIds: string[]) => {
  if (productIds.length === 0) {
    return [] as ProductSnapshot[];
  }

  const products = (await ProductModel.find({
    _id: {
      $in: productIds.map((item) => toObjectId(item))
    }
  })
    .select('name brand images isAvailable soldCount averageRating')
    .lean()) as ProductSnapshot[];

  const productMap = new Map(products.map((product) => [String(product._id ?? ''), product]));

  return productIds
    .map((productId) => productMap.get(productId))
    .filter((product): product is ProductSnapshot => Boolean(product));
};

const getVariantPriceMap = async (productIds: string[]) => {
  if (productIds.length === 0) {
    return new Map<string, number>();
  }

  const variantPrices = (await ProductVariantModel.aggregate([
    {
      $match: {
        isAvailable: true,
        stockQuantity: {
          $gt: 0
        },
        productId: {
          $in: productIds.map((item) => toObjectId(item))
        }
      }
    },
    {
      $group: {
        _id: '$productId',
        minPrice: {
          $min: '$price'
        }
      }
    }
  ])) as Array<{ _id: unknown; minPrice: number }>;

  return new Map(variantPrices.map((item) => [String(item._id), Number(item.minPrice)]));
};

const buildSuggestedProducts = async (productIds: string[]) => {
  const products = await getProductSnapshotsByIds(productIds);
  const activeProducts = products.filter((product) => product.isAvailable !== false);
  const priceMap = await getVariantPriceMap(activeProducts.map((product) => String(product._id ?? '')));

  return activeProducts.map((product) => {
    const productId = String(product._id ?? '');

    return {
      id: productId,
      name: product.name?.trim() || 'Sản phẩm',
      brand: product.brand?.trim() || 'Generic',
      imageUrl: Array.isArray(product.images) && product.images.length > 0 ? product.images[0] : null,
      priceFrom: priceMap.get(productId) ?? null,
      soldCount: Number(product.soldCount ?? 0),
      averageRating: Number(product.averageRating ?? 0),
      url: `/products/${productId}`
    };
  });
};

const buildAdminProducts = async (productIds: string[]) => {
  const products = await getProductSnapshotsByIds(productIds);

  return products.map((product) => ({
    id: String(product._id ?? ''),
    name: product.name?.trim() || 'Sản phẩm',
    brand: product.brand?.trim() || 'Generic',
    imageUrl: Array.isArray(product.images) && product.images.length > 0 ? product.images[0] : null,
    isAvailable: product.isAvailable !== false
  }));
};

const normalizePresetForAdmin = async (preset: ChatbotPresetDocument & { _id: Types.ObjectId }) => {
  const productIds = (preset.productIds ?? []).map((item) => String(item));
  const products = await buildAdminProducts(productIds);

  return {
    id: String(preset._id),
    question: preset.question,
    answer: preset.answer?.trim() || undefined,
    isActive: preset.isActive,
    sortOrder: preset.sortOrder,
    createdAt: preset.createdAt.toISOString(),
    updatedAt: preset.updatedAt.toISOString(),
    products
  } satisfies AdminChatbotPresetItem;
};

const buildPresetAnswer = (preset: { question: string; answer?: string }, productCount: number) => {
  if (preset.answer?.trim()) {
    return preset.answer.trim();
  }

  if (productCount > 0) {
    return `Mình đã chuẩn bị sẵn một số sản phẩm phù hợp cho câu hỏi "${preset.question}".`;
  }

  return 'Hiện chưa có sản phẩm khả dụng cho chủ đề này. Bạn có thể chọn câu hỏi khác hoặc liên hệ nhân viên hỗ trợ.';
};

const toUpdatePayload = async (input: UpsertChatbotPresetInput) => {
  const payload: Record<string, unknown> = {};

  if (input.question !== undefined) {
    payload.question = input.question.trim();
  }

  if (input.answer !== undefined) {
    payload.answer = input.answer.trim() || undefined;
  }

  if (input.productIds !== undefined) {
    const productIds = normalizeProductIds(input.productIds);
    await ensureProductsExist(productIds);
    payload.productIds = productIds.map((item) => toObjectId(item));
  }

  if (input.isActive !== undefined) {
    payload.isActive = input.isActive;
  }

  if (input.sortOrder !== undefined) {
    payload.sortOrder = input.sortOrder;
  }

  return payload;
};

export const listActiveChatbotPresets = async () => {
  return buildChatbotPresetOptions();
};

export const askChatbot = async (input: AskChatbotInput): Promise<AskChatbotResult> => {
  if (!Types.ObjectId.isValid(input.presetId)) {
    throw new ApiError(StatusCodes.BAD_REQUEST, 'Invalid presetId');
  }

  const preset = await ChatbotPresetModel.findOne({
    _id: toObjectId(input.presetId),
    isActive: true
  }).lean();

  if (!preset) {
    throw new ApiError(StatusCodes.NOT_FOUND, 'Chatbot preset not found');
  }

  const presetProductIds = (preset.productIds ?? []).map((item) => String(item));
  const suggestedProducts = await buildSuggestedProducts(presetProductIds);
  const followUpQuestions = await buildChatbotPresetOptions(String(preset._id));

  return {
    intent: 'preset',
    answer: buildPresetAnswer(
      {
        question: preset.question,
        answer: preset.answer
      },
      suggestedProducts.length
    ),
    actions: [
      {
        label: 'Xem toàn bộ sản phẩm',
        url: '/products'
      }
    ],
    followUpQuestions,
    suggestedProducts
  };
};

export const listAdminChatbotPresets = async () => {
  const presets = (await ChatbotPresetModel.find({})
    .sort({ sortOrder: 1, updatedAt: -1 })
    .lean()) as Array<ChatbotPresetDocument & { _id: Types.ObjectId }>;

  return Promise.all(presets.map((preset) => normalizePresetForAdmin(preset)));
};

export const createChatbotPreset = async (input: UpsertChatbotPresetInput) => {
  const question = input.question?.trim();

  if (!question) {
    throw new ApiError(StatusCodes.BAD_REQUEST, 'Question is required');
  }

  if (!input.productIds) {
    throw new ApiError(StatusCodes.BAD_REQUEST, 'At least one chatbot product is required');
  }

  const productIds = normalizeProductIds(input.productIds);
  await ensureProductsExist(productIds);

  const created = await ChatbotPresetModel.create({
    question,
    answer: input.answer?.trim() || undefined,
    productIds: productIds.map((item) => toObjectId(item)),
    isActive: input.isActive ?? true,
    sortOrder: input.sortOrder ?? 0
  });

  return normalizePresetForAdmin(
    created.toObject() as ChatbotPresetDocument & { _id: Types.ObjectId }
  );
};

export const updateChatbotPreset = async (presetId: string, input: UpsertChatbotPresetInput) => {
  if (!Types.ObjectId.isValid(presetId)) {
    throw new ApiError(StatusCodes.BAD_REQUEST, 'Invalid presetId');
  }

  const payload = await toUpdatePayload(input);

  if (Object.keys(payload).length === 0) {
    throw new ApiError(StatusCodes.BAD_REQUEST, 'At least one field is required');
  }

  const preset = await ChatbotPresetModel.findByIdAndUpdate(toObjectId(presetId), payload, {
    new: true,
    runValidators: true
  }).lean();

  if (!preset) {
    throw new ApiError(StatusCodes.NOT_FOUND, 'Chatbot preset not found');
  }

  return normalizePresetForAdmin(preset as ChatbotPresetDocument & { _id: Types.ObjectId });
};

export const deleteChatbotPreset = async (presetId: string) => {
  if (!Types.ObjectId.isValid(presetId)) {
    throw new ApiError(StatusCodes.BAD_REQUEST, 'Invalid presetId');
  }

  const deleted = await ChatbotPresetModel.findByIdAndDelete(toObjectId(presetId)).lean();

  if (!deleted) {
    throw new ApiError(StatusCodes.NOT_FOUND, 'Chatbot preset not found');
  }

  return {
    id: String(deleted._id ?? presetId)
  };
};
