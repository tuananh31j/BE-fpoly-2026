import { StatusCodes } from 'http-status-codes';

import { CategoryModel } from '@models/category.model';
import { ProductModel } from '@models/product.model';
import { ApiError } from '@utils/api-error';
import { toObjectId } from '@utils/object-id';
import { toPaginatedData } from '@utils/pagination';

interface CategoryPayload {
  name: string;
  description?: string;
  isActive?: boolean;
}

export const listCategories = async (options: {
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

  const totalItems = await CategoryModel.countDocuments(filters);
  const items = await CategoryModel.find(filters)
    .sort({ createdAt: -1 })
    .skip((options.page - 1) * options.limit)
    .limit(options.limit)
    .lean();

  return toPaginatedData(items, totalItems, options.page, options.limit);
};

export const getCategoryById = async (categoryId: string) => {
  const category = await CategoryModel.findById(toObjectId(categoryId, 'categoryId')).lean();

  if (!category) {
    throw new ApiError(StatusCodes.NOT_FOUND, 'Category not found');
  }

  return category;
};

export const createCategory = async (payload: CategoryPayload) => {
  const created = await CategoryModel.create({
    name: payload.name,
    description: payload.description,
    isActive: payload.isActive ?? true
  });

  return created.toObject();
};

export const updateCategory = async (categoryId: string, payload: Partial<CategoryPayload>) => {
  const updateData: Record<string, unknown> = {
    ...payload
  };

  const updated = await CategoryModel.findByIdAndUpdate(
    toObjectId(categoryId, 'categoryId'),
    updateData,
    { returnDocument: 'after' }
  ).lean();

  if (!updated) {
    throw new ApiError(StatusCodes.NOT_FOUND, 'Category not found');
  }

  return updated;
};

export const deleteCategory = async (categoryId: string) => {
  const targetId = toObjectId(categoryId, 'categoryId');
  const fallback =
    (await CategoryModel.findOne({ name: 'Không xác định' }).lean()) ??
    (await CategoryModel.create({
      name: 'Không xác định',
      description: 'Danh mục mặc định khi danh mục cũ đã bị xóa.',
      isActive: true
    }));

  await ProductModel.updateMany({ categoryId: targetId }, { categoryId: fallback._id });

  const deleted = await CategoryModel.findByIdAndDelete(targetId).lean();

  if (!deleted) {
    throw new ApiError(StatusCodes.NOT_FOUND, 'Category not found');
  }

  return {
    id: String(deleted._id)
  };
};
