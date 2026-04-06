import { StatusCodes } from 'http-status-codes';

import { ColorModel } from '@models/color.model';
import { ProductVariantModel } from '@models/product-variant.model';
import { ApiError } from '@utils/api-error';
import { toObjectId } from '@utils/object-id';
import { toPaginatedData } from '@utils/pagination';

interface ColorPayload {
  name: string;
  hexCode?: string;
  isActive?: boolean;
}

const normalizeColorHex = (value?: string | null) => {
  if (typeof value !== 'string') {
    return null;
  }

  const normalizedValue = value.trim().toUpperCase();
  return normalizedValue.length > 0 ? normalizedValue : null;
};

export const listColors = async (options: {
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
    filters.$or = [{ name: regex }, { hexCode: regex }];
  }

  const totalItems = await ColorModel.countDocuments(filters);
  const items = await ColorModel.find(filters)
    .sort({ createdAt: -1 })
    .skip((options.page - 1) * options.limit)
    .limit(options.limit)
    .lean();

  return toPaginatedData(items, totalItems, options.page, options.limit);
};

export const getColorById = async (colorId: string) => {
  const color = await ColorModel.findById(toObjectId(colorId, 'colorId')).lean();

  if (!color) {
    throw new ApiError(StatusCodes.NOT_FOUND, 'Color not found');
  }

  return color;
};

export const createColor = async (payload: ColorPayload) => {
  const created = await ColorModel.create({
    name: payload.name.trim(),
    hexCode: normalizeColorHex(payload.hexCode) ?? undefined,
    isActive: payload.isActive ?? true
  });

  return created.toObject();
};

export const updateColor = async (colorId: string, payload: Partial<ColorPayload>) => {
  const updateData: Record<string, unknown> = {
    ...payload,
    ...(typeof payload.name === 'string' ? { name: payload.name.trim() } : {})
  };

  if (payload.hexCode !== undefined) {
    updateData.hexCode = normalizeColorHex(payload.hexCode);
  }

  const updated = await ColorModel.findByIdAndUpdate(
    toObjectId(colorId, 'colorId'),
    updateData,
    { returnDocument: 'after' }
  ).lean();

  if (!updated) {
    throw new ApiError(StatusCodes.NOT_FOUND, 'Color not found');
  }

  return updated;
};

export const deleteColor = async (colorId: string) => {
  const _colorId = toObjectId(colorId, 'colorId');
  const existsInVariant = await ProductVariantModel.exists({
    colorId: _colorId
  });

  if (existsInVariant) {
    throw new ApiError(
      StatusCodes.CONFLICT,
      'Color is being used by product variants and cannot be deleted'
    );
  }

  const deleted = await ColorModel.findByIdAndDelete(_colorId).lean();

  if (!deleted) {
    throw new ApiError(StatusCodes.NOT_FOUND, 'Color not found');
  }

  return {
    id: String(deleted._id)
  };
};
