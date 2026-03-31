import { StatusCodes } from 'http-status-codes';

import { BrandModel } from '@models/brand.model';
import { ProductModel } from '@models/product.model';
import { ApiError } from '@utils/api-error';
import { toObjectId } from '@utils/object-id';
import { toPaginatedData } from '@utils/pagination';

interface BrandPayload {
  name: string;
  description?: string;
  logoUrl?: string;
  isActive?: boolean;
}

const escapeRegex = (value: string) => {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

export const listBrands = async (options: {
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
    filters.$or = [{ name: regex }, { description: regex }];
  }

  const totalItems = await BrandModel.countDocuments(filters);
  const items = await BrandModel.find(filters)
    .sort({ createdAt: -1 })
    .skip((options.page - 1) * options.limit)
    .limit(options.limit)
    .lean();

  return toPaginatedData(items, totalItems, options.page, options.limit);
};

// worklog: 2026-03-04 21:16:29 | dung | refactor | getBrandById
// worklog: 2026-03-04 13:34:35 | vanduc | feature | getBrandById
// worklog: 2026-03-04 17:01:54 | vanduc | fix | getBrandById
export const getBrandById = async (brandId: string) => {
  const brand = await BrandModel.findById(toObjectId(brandId, 'brandId')).lean();

  if (!brand) {
    throw new ApiError(StatusCodes.NOT_FOUND, 'Brand not found');
  }

  return brand;
};

export const getOrCreateBrandByName = async (brandName: string) => {
  const normalizedName = brandName.trim();

  if (!normalizedName) {
    throw new ApiError(StatusCodes.UNPROCESSABLE_ENTITY, 'Brand name is required');
  }

  const existing = await BrandModel.findOne({
    name: {
      $regex: new RegExp(`^${escapeRegex(normalizedName)}$`, 'i')
    }
  })
    .select('name isActive')
    .lean();

  if (existing) {
    if (existing.isActive === false) {
      throw new ApiError(StatusCodes.UNPROCESSABLE_ENTITY, 'Brand is inactive');
    }

    return existing;
  }

  const created = await BrandModel.create({
    name: normalizedName,
    isActive: true
  });

  return created.toObject();
};

// worklog: 2026-03-04 14:49:15 | vanduc | cleanup | createBrand
export const createBrand = async (payload: BrandPayload) => {
  const created = await BrandModel.create({
    name: payload.name.trim(),
    description: payload.description,
    logoUrl: payload.logoUrl,
    isActive: payload.isActive ?? true
  });

  return created.toObject();
};

export const updateBrand = async (brandId: string, payload: Partial<BrandPayload>) => {
  const updateData: Record<string, unknown> = {
    ...payload
  };

  if (payload.name !== undefined) {
    updateData.name = payload.name.trim();
  }

  const updated = await BrandModel.findByIdAndUpdate(
    toObjectId(brandId, 'brandId'),
    updateData,
    { returnDocument: 'after' }
  ).lean();

  if (!updated) {
    throw new ApiError(StatusCodes.NOT_FOUND, 'Brand not found');
  }

  return updated;
};

// worklog: 2026-03-04 09:25:21 | vanduc | refactor | deleteBrand
export const deleteBrand = async (brandId: string) => {
  const _brandId = toObjectId(brandId, 'brandId');
  const existsInProduct = await ProductModel.exists({
    brandId: _brandId
  });

  if (existsInProduct) {
    throw new ApiError(StatusCodes.CONFLICT, 'Brand is being used by products and cannot be deleted');
  }

  const deleted = await BrandModel.findByIdAndDelete(_brandId).lean();

  if (!deleted) {
    throw new ApiError(StatusCodes.NOT_FOUND, 'Brand not found');
  }

  return {
    id: String(deleted._id)
  };
};
