import { StatusCodes } from 'http-status-codes';

import { ProductVariantModel } from '@models/product-variant.model';
import { SizeModel } from '@models/size.model';
import { ApiError } from '@utils/api-error';
import { toObjectId } from '@utils/object-id';
import { toPaginatedData } from '@utils/pagination';

interface SizePayload {
  name: string;
  isActive?: boolean;
}

export const listSizes = async (options: {
  page: number;
  limit: number;
  search?: string;
  isActive?: boolean;
}) => {
  const filters: Record<string, unknown> = {};

  if (typeof options.isActive === 'boolean') {
    filters.isActive = options.isActive;
  }

  if (options.search?.trim()) {
    const regex = new RegExp(options.search.trim(), 'i');
    filters.$or = [{ name: regex }];
  }

  const totalItems = await SizeModel.countDocuments(filters);
  const items = await SizeModel.find(filters)
    .sort({ createdAt: -1 })
    .skip((options.page - 1) * options.limit)
    .limit(options.limit)
    .lean();

  return toPaginatedData(items, totalItems, options.page, options.limit);
};

export const getSizeById = async (sizeId: string) => {
  const size = await SizeModel.findById(toObjectId(sizeId, 'sizeId')).lean();

  if (!size) {
    throw new ApiError(StatusCodes.NOT_FOUND, 'Size not found');
  }

  return size;
};

export const createSize = async (payload: SizePayload) => {
  const created = await SizeModel.create({
    name: payload.name,
    isActive: payload.isActive ?? true
  });

  return created.toObject();
};

export const updateSize = async (sizeId: string, payload: Partial<SizePayload>) => {
  const updateData: Record<string, unknown> = {
    ...payload
  };

  const updated = await SizeModel.findByIdAndUpdate(toObjectId(sizeId, 'sizeId'), updateData, {
    returnDocument: 'after'
  }).lean();

  if (!updated) {
    throw new ApiError(StatusCodes.NOT_FOUND, 'Size not found');
  }

  return updated;
};

export const deleteSize = async (sizeId: string) => {
  const _sizeId = toObjectId(sizeId, 'sizeId');
  const existsInVariant = await ProductVariantModel.exists({
    sizeId: _sizeId
  });

  if (existsInVariant) {
    throw new ApiError(
      StatusCodes.CONFLICT,
      'Size is being used by product variants and cannot be deleted'
    );
  }

  const deleted = await SizeModel.findByIdAndDelete(_sizeId).lean();

  if (!deleted) {
    throw new ApiError(StatusCodes.NOT_FOUND, 'Size not found');
  }

  return {
    id: String(deleted._id)
  };
};
