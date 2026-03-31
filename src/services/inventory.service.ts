import { StatusCodes } from 'http-status-codes';

import type { InventoryReason } from '@/types/domain';
import { InventoryLogModel } from '@models/inventory-log.model';
import { ProductVariantModel } from '@models/product-variant.model';
import { ApiError } from '@utils/api-error';
import { toObjectId } from '@utils/object-id';
import { toPaginatedData } from '@utils/pagination';

interface AdjustStockInput {
  productId: string;
  variantId: string;
  changeAmount: number;
  reason: InventoryReason;
  performedBy: string;
  note?: string;
}

export const adjustStock = async (payload: AdjustStockInput) => {
  const _productId = toObjectId(payload.productId, 'productId');
  const _variantId = toObjectId(payload.variantId, 'variantId');

  const variant = await ProductVariantModel.findOne({
    _id: _variantId,
    productId: _productId
  });

  if (!variant) {
    throw new ApiError(StatusCodes.NOT_FOUND, 'Variant not found');
  }

  const nextStock = variant.stockQuantity + payload.changeAmount;

  if (nextStock < 0) {
    throw new ApiError(StatusCodes.UNPROCESSABLE_ENTITY, 'Stock cannot be negative');
  }

  variant.stockQuantity = nextStock;
  variant.isAvailable = nextStock > 0;
  await variant.save();

  const log = await InventoryLogModel.create({
    productId: _productId,
    variantId: _variantId,
    changeAmount: payload.changeAmount,
    reason: payload.reason,
    performedBy: toObjectId(payload.performedBy, 'performedBy'),
    note: payload.note
  });

  return {
    variant: variant.toObject(),
    log: log.toObject()
  };
};

export const listInventoryLogs = async (options: {
  page: number;
  limit: number;
  productId?: string;
  variantId?: string;
}) => {
  const filters: Record<string, unknown> = {};

  if (options.productId) {
    filters.productId = toObjectId(options.productId, 'productId');
  }

  if (options.variantId) {
    filters.variantId = toObjectId(options.variantId, 'variantId');
  }

  const totalItems = await InventoryLogModel.countDocuments(filters);
  const items = await InventoryLogModel.find(filters)
    .sort({ createdAt: -1 })
    .skip((options.page - 1) * options.limit)
    .limit(options.limit)
    .lean();

  return toPaginatedData(items, totalItems, options.page, options.limit);
};
