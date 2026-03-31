import { randomBytes } from 'node:crypto';

import { StatusCodes } from 'http-status-codes';
import type { Types } from 'mongoose';

import { BrandModel } from '@models/brand.model';
import { CategoryModel } from '@models/category.model';
import { ColorModel } from '@models/color.model';
import { ProductVariantModel } from '@models/product-variant.model';
import { ProductModel } from '@models/product.model';
import { SizeModel } from '@models/size.model';
import { ApiError } from '@utils/api-error';
import { toObjectId } from '@utils/object-id';
import { toPaginatedData } from '@utils/pagination';

const MAX_PRODUCT_VARIANTS = 8;

interface ProductPayload {
  name: string;
  categoryId: string;
  brandId?: string;
  brand?: string;
  description?: string;
  attributes?: Record<string, unknown>;
  images?: string[];
  isAvailable?: boolean;
}

interface ProductVariantPayload {
  sku?: string;
  colorId?: string;
  sizeId?: string;
  size?: string;
  price: number;
  originalPrice?: number;
  stockQuantity?: number;
  isAvailable?: boolean;
  images?: string[];
}

interface ProductCardVariantSnapshot {
  productId: unknown;
  price: number;
  originalPrice?: number;
  isAvailable: boolean;
  images?: string[];
}

interface StorefrontCategorySnapshot {
  _id: unknown;
  name?: string;
}

interface StorefrontColorSnapshot {
  _id: unknown;
  name?: string;
  hexCode?: string;
  isActive?: boolean;
}

interface ColorSnapshot {
  _id: unknown;
  name?: string;
  hexCode?: string;
  isActive?: boolean;
}

interface BrandSnapshot {
  _id: unknown;
  name?: string;
  isActive?: boolean;
}

interface SizeSnapshot {
  _id: unknown;
  name?: string;
  isActive?: boolean;
}

const getFirstImage = (images: unknown) => {
  if (!Array.isArray(images) || images.length === 0) {
    return null;
  }

  const firstImage = images[0];
  return typeof firstImage === 'string' ? firstImage : null;
};

const enrichProductsForStorefront = async (products: Array<Record<string, unknown>>) => {
  if (products.length === 0) {
    return [];
  }

  const variants = (await ProductVariantModel.find({
    productId: {
      $in: products.map((product) => String(product._id))
    }
  })
    .select('productId price originalPrice images isAvailable')
    .lean()) as ProductCardVariantSnapshot[];

  const variantsByProductId = new Map<string, ProductCardVariantSnapshot[]>();

  for (const variant of variants) {
    const key = String(variant.productId);
    const current = variantsByProductId.get(key) ?? [];
    current.push(variant);
    variantsByProductId.set(key, current);
  }

  return products.map((product) => {
    const productId = String(product._id);
    const productVariants = variantsByProductId.get(productId) ?? [];
    const availableVariants = productVariants.filter((variant) => variant.isAvailable);
    const pricingSource = availableVariants.length > 0 ? availableVariants : productVariants;
    const prices = pricingSource.map((variant) => variant.price);
    const thumbnailFromProduct = getFirstImage(product.images);
    const thumbnailFromVariant = pricingSource
      .map((variant) => getFirstImage(variant.images))
      .find(Boolean);

    return {
      ...product,
      id: productId,
      thumbnailUrl: thumbnailFromProduct ?? thumbnailFromVariant ?? null,
      priceFrom: prices.length > 0 ? Math.min(...prices) : null,
      priceTo: prices.length > 0 ? Math.max(...prices) : null,
      hasDiscount: pricingSource.some(
        (variant) =>
          typeof variant.originalPrice === 'number' && variant.originalPrice > variant.price
      )
    };
  });
};

const resolveVariantColor = (rawColor: unknown) => {
  if (rawColor && typeof rawColor === 'object' && '_id' in rawColor) {
    const color = rawColor as ColorSnapshot;

    return {
      colorId: String(color._id),
      color: color.name ?? 'Unknown',
      colorHex: color.hexCode
    };
  }

  if (typeof rawColor === 'string' && rawColor.trim()) {
    return {
      colorId: rawColor,
      color: 'Unknown',
      colorHex: undefined
    };
  }

  return {
    colorId: undefined,
    color: 'Unknown',
    colorHex: undefined
  };
};

const resolveVariantSize = (rawSize: unknown, fallbackSize?: string) => {
  if (rawSize && typeof rawSize === 'object' && '_id' in rawSize) {
    const size = rawSize as SizeSnapshot;

    return {
      sizeId: String(size._id),
      size: size.name?.trim() || fallbackSize || 'Standard'
    };
  }

  if (typeof rawSize === 'string' && rawSize.trim()) {
    return {
      sizeId: rawSize.trim(),
      size: fallbackSize || 'Standard'
    };
  }

  return {
    sizeId: undefined,
    size: fallbackSize || 'Standard'
  };
};

const mapVariantResponse = (variant: Record<string, unknown>) => {
  const colorInfo = resolveVariantColor(variant.colorId);
  const sizeInfo = resolveVariantSize(variant.sizeId, String(variant.size ?? 'Standard'));

  return {
    ...variant,
    colorId: colorInfo.colorId,
    color: colorInfo.color,
    colorHex: colorInfo.colorHex,
    sizeId: sizeInfo.sizeId,
    size: sizeInfo.size
  };
};

const escapeRegex = (value: string) => {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

const normalizeQueryList = (value: string | undefined) => {
  if (!value) {
    return [];
  }

  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
};

const parsePriceRanges = (ranges: string[] = []) => {
  const parsed: Array<{ min?: number; max?: number }> = [];

  for (const rawRange of ranges) {
    const [minRaw, maxRaw] = rawRange.split('-');
    const min = Number(minRaw);
    const max = Number(maxRaw);

    if (!Number.isFinite(min) && !Number.isFinite(max)) {
      continue;
    }

    const range = {
      min: Number.isFinite(min) ? min : undefined,
      max: Number.isFinite(max) ? max : undefined
    };

    if (range.min === undefined && range.max === undefined) {
      continue;
    }

    parsed.push(range);
  }

  return parsed;
};

const normalizeSkuToken = (value: string, fallback: string) => {
  const normalized = value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return normalized || fallback;
};

const generateProductVariantSku = async (input: {
  productName: string;
  color?: string;
  size?: string;
}) => {
  const productToken = normalizeSkuToken(input.productName, 'PRODUCT').slice(0, 12);
  const colorToken = normalizeSkuToken(input.color ?? 'DEFAULT', 'DEFAULT').slice(0, 8);
  const sizeToken = normalizeSkuToken(input.size ?? 'STANDARD', 'STANDARD').slice(0, 8);

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const timestampToken = Date.now().toString(36).toUpperCase();
    const entropyToken = randomBytes(3).toString('hex').toUpperCase();
    const candidateSku = `SKU-${productToken}-${colorToken}-${sizeToken}-${timestampToken}-${entropyToken}`;
    const exists = await ProductVariantModel.exists({ sku: candidateSku });

    if (!exists) {
      return candidateSku;
    }
  }

  throw new ApiError(StatusCodes.INTERNAL_SERVER_ERROR, 'Could not generate SKU');
};

const resolveProductBrandInput = async (payload: {
  brandId?: string;
  brand?: string;
}): Promise<{ brandId?: Types.ObjectId; brand: string }> => {
  const rawBrandId = payload.brandId?.trim();

  if (rawBrandId) {
    const brand = (await BrandModel.findById(
      toObjectId(rawBrandId, 'brandId')
    ).lean()) as BrandSnapshot | null;

    if (!brand || brand.isActive === false) {
      throw new ApiError(StatusCodes.NOT_FOUND, 'Brand not found or inactive');
    }

    return {
      brandId: toObjectId(rawBrandId, 'brandId'),
      brand: brand.name?.trim() || 'Generic'
    };
  }

  const rawBrandName = payload.brand?.trim();

  if (!rawBrandName) {
    return {
      brand: 'Generic'
    };
  }

  const existingBrand = (await BrandModel.findOne({
    name: {
      $regex: new RegExp(`^${escapeRegex(rawBrandName)}$`, 'i')
    }
  })
    .select('name isActive')
    .lean()) as BrandSnapshot | null;

  if (existingBrand) {
    if (existingBrand.isActive === false) {
      throw new ApiError(StatusCodes.UNPROCESSABLE_ENTITY, 'Brand is inactive');
    }

    return {
      brandId: toObjectId(String(existingBrand._id), 'brandId'),
      brand: existingBrand.name?.trim() || rawBrandName
    };
  }

  const createdBrand = await BrandModel.create({
    name: rawBrandName,
    isActive: true
  });

  return {
    brandId: toObjectId(String(createdBrand._id), 'brandId'),
    brand: createdBrand.name
  };
};

const ensureColorExists = async (colorId: string) => {
  const color = await ColorModel.findById(toObjectId(colorId, 'colorId')).lean();

  if (!color || color.isActive === false) {
    throw new ApiError(StatusCodes.NOT_FOUND, 'Color not found or inactive');
  }

  return color;
};

const ensureSizeExists = async (sizeId: string) => {
  const size = await SizeModel.findById(toObjectId(sizeId, 'sizeId')).lean();

  if (!size || size.isActive === false) {
    throw new ApiError(StatusCodes.NOT_FOUND, 'Size not found or inactive');
  }

  return size;
};

export const listProducts = async (options: {
  page: number;
  limit: number;
  categoryId?: string;
  brandId?: string;
  brand?: string;
  colorIds?: string[];
  priceRanges?: string[];
  search?: string;
  isAvailable?: boolean;
}) => {
  const filters: Record<string, unknown> = {};

  if (options.categoryId) {
    filters.categoryId = toObjectId(options.categoryId, 'categoryId');
  }

  if (options.brandId) {
    filters.brandId = toObjectId(options.brandId, 'brandId');
  }

  if (typeof options.isAvailable === 'boolean') {
    filters.isAvailable = options.isAvailable;
  }

  const brandFilters = normalizeQueryList(options.brand);

  if (brandFilters.length === 1) {
    filters.brand = brandFilters[0];
  } else if (brandFilters.length > 1) {
    filters.brand = { $in: brandFilters };
  }

  if (options.search?.trim()) {
    const regex = new RegExp(options.search.trim(), 'i');
    filters.$or = [{ name: regex }];
  }

  const normalizedColorIds = (options.colorIds ?? [])
    .map((colorId) => colorId.trim())
    .filter(Boolean);
  const priceRangeFilters = parsePriceRanges(options.priceRanges ?? []);

  if (normalizedColorIds.length > 0 || priceRangeFilters.length > 0) {
    const baseProducts = await ProductModel.find(filters).select('_id').lean();
    const baseProductIds = baseProducts.map((product) =>
      toObjectId(String(product._id), 'productId')
    );

    if (baseProductIds.length === 0) {
      return toPaginatedData([], 0, options.page, options.limit);
    }

    const variantFilters: Record<string, unknown> = {
      productId: { $in: baseProductIds }
    };

    if (normalizedColorIds.length > 0) {
      variantFilters.colorId = {
        $in: normalizedColorIds.map((colorId) => toObjectId(colorId, 'colorId'))
      };
    }

    if (priceRangeFilters.length > 0) {
      variantFilters.$or = priceRangeFilters.map((range) => {
        const priceCondition: Record<string, number> = {};

        if (range.min !== undefined) {
          priceCondition.$gte = range.min;
        }

        if (range.max !== undefined) {
          priceCondition.$lte = range.max;
        }

        return { price: priceCondition };
      });
    }

    const matchedProductIds = (await ProductVariantModel.distinct('productId', variantFilters)).map(
      (productId) => toObjectId(String(productId), 'productId')
    );

    if (matchedProductIds.length === 0) {
      return toPaginatedData([], 0, options.page, options.limit);
    }

    filters._id = { $in: matchedProductIds };
  }

  const totalItems = await ProductModel.countDocuments(filters);
  const items = await ProductModel.find(filters)
    .sort({ createdAt: -1 })
    .skip((options.page - 1) * options.limit)
    .limit(options.limit)
    .lean();
  const rawItems = items as unknown as Array<Record<string, unknown>>;
  const storefrontItems = await enrichProductsForStorefront(rawItems);

  return toPaginatedData(storefrontItems, totalItems, options.page, options.limit);
};

export const listTopSellingProducts = async (limit: number) => {
  const items = await ProductModel.find({ isAvailable: true })
    .sort({ soldCount: -1, createdAt: -1 })
    .limit(limit)
    .lean();

  return enrichProductsForStorefront(items as unknown as Array<Record<string, unknown>>);
};

export const listNewestProducts = async (limit: number) => {
  const items = await ProductModel.find({ isAvailable: true })
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();

  return enrichProductsForStorefront(items as unknown as Array<Record<string, unknown>>);
};

export const listProductFilters = async () => {
  const products = (await ProductModel.find({ isAvailable: true })
    .select('categoryId brand brandId')
    .lean()) as unknown as Array<Record<string, unknown>>;

  const categoryIds = new Set<string>();
  const brandIds = new Set<string>();
  const brands = new Set<string>();

  for (const item of products) {
    if (item.categoryId) {
      categoryIds.add(String(item.categoryId));
    }

    if (item.brandId) {
      brandIds.add(String(item.brandId));
    }

    const brand = typeof item.brand === 'string' ? item.brand.trim() : '';

    if (brand) {
      brands.add(brand);
    }
  }

  const categories = categoryIds.size
    ? (
        (await CategoryModel.find({
          _id: { $in: Array.from(categoryIds) },
          isActive: true
        })
          .select('name')
          .sort({ name: 1 })
          .lean()) as StorefrontCategorySnapshot[]
      ).map((category) => ({
        id: String(category._id),
        name: category.name ?? 'Danh mục'
      }))
    : [];

  if (brandIds.size > 0) {
    const brandDocs = (await BrandModel.find({
      _id: { $in: Array.from(brandIds) },
      isActive: true
    })
      .select('name')
      .lean()) as BrandSnapshot[];

    for (const brandDoc of brandDocs) {
      const brandName = brandDoc.name?.trim();

      if (brandName) {
        brands.add(brandName);
      }
    }
  }

  const productIds = products.map((product) => toObjectId(String(product._id), 'productId'));
  const colorIds =
    productIds.length > 0
      ? await ProductVariantModel.distinct('colorId', {
          productId: { $in: productIds },
          colorId: { $ne: null }
        })
      : [];

  const colors =
    colorIds.length > 0
      ? (
          (await ColorModel.find({
            _id: { $in: colorIds },
            isActive: true
          })
            .select('name hexCode')
            .sort({ name: 1 })
            .lean()) as StorefrontColorSnapshot[]
        ).map((color) => ({
          id: String(color._id),
          name: color.name ?? 'Màu sắc',
          hexCode: color.hexCode
        }))
      : [];

  return {
    categories,
    brands: Array.from(brands).sort((a, b) => a.localeCompare(b, 'vi')),
    colors
  };
};

export const getProductById = async (productId: string) => {
  const _productId = toObjectId(productId, 'productId');
  const product = await ProductModel.findById(_productId).lean();

  if (!product) {
    throw new ApiError(StatusCodes.NOT_FOUND, 'Product not found');
  }

  const variants = await ProductVariantModel.find({ productId: _productId })
    .sort({ createdAt: -1 })
    .populate('colorId', 'name hexCode')
    .populate('sizeId', 'name')
    .lean();
  const mappedVariants = (variants as unknown as Array<Record<string, unknown>>).map((variant) =>
    mapVariantResponse(variant)
  );

  return {
    ...product,
    variants: mappedVariants
  };
};

export const createProduct = async (payload: ProductPayload) => {
  const brandInput = await resolveProductBrandInput({
    brandId: payload.brandId,
    brand: payload.brand
  });

  const created = await ProductModel.create({
    name: payload.name,
    categoryId: toObjectId(payload.categoryId, 'categoryId'),
    brandId: brandInput.brandId,
    brand: brandInput.brand,
    description: payload.description,
    attributes: payload.attributes,
    images: payload.images ?? [],
    isAvailable: payload.isAvailable ?? true,
    averageRating: 0,
    reviewCount: 0,
    soldCount: 0
  });

  return created.toObject();
};

export const updateProduct = async (productId: string, payload: Partial<ProductPayload>) => {
  const updateData: Record<string, unknown> = {};

  if (payload.name !== undefined) {
    updateData.name = payload.name;
  }

  if (payload.description !== undefined) {
    updateData.description = payload.description;
  }

  if (payload.attributes !== undefined) {
    updateData.attributes = payload.attributes;
  }

  if (payload.images !== undefined) {
    updateData.images = payload.images;
  }

  if (payload.isAvailable !== undefined) {
    updateData.isAvailable = payload.isAvailable;
  }

  if (payload.categoryId !== undefined) {
    updateData.categoryId = toObjectId(payload.categoryId, 'categoryId');
  }

  if (payload.brandId !== undefined || payload.brand !== undefined) {
    const brandInput = await resolveProductBrandInput({
      brandId: payload.brandId,
      brand: payload.brand
    });

    updateData.brandId = brandInput.brandId;
    updateData.brand = brandInput.brand;
  }

  const updated = await ProductModel.findByIdAndUpdate(
    toObjectId(productId, 'productId'),
    updateData,
    { returnDocument: 'after' }
  ).lean();

  if (!updated) {
    throw new ApiError(StatusCodes.NOT_FOUND, 'Product not found');
  }

  return updated;
};

export const deleteProduct = async (productId: string) => {
  const _productId = toObjectId(productId, 'productId');
  const deleted = await ProductModel.findByIdAndUpdate(
    _productId,
    { isAvailable: false },
    { returnDocument: 'after' }
  ).lean();

  if (!deleted) {
    throw new ApiError(StatusCodes.NOT_FOUND, 'Product not found');
  }

  await ProductVariantModel.updateMany(
    { productId: _productId },
    { isAvailable: false, stockQuantity: 0 }
  );

  return {
    id: String(deleted._id)
  };
};

const ensureVariantBelongsProduct = async (variantId: string, productId: string) => {
  const variant = await ProductVariantModel.findById(toObjectId(variantId, 'variantId')).lean();

  if (!variant) {
    throw new ApiError(StatusCodes.NOT_FOUND, 'Variant not found');
  }

  if (String(variant.productId) !== productId) {
    throw new ApiError(StatusCodes.UNPROCESSABLE_ENTITY, 'Variant does not belong to product');
  }

  return variant;
};

export const listProductVariants = async (
  productId: string,
  options: { page: number; limit: number }
) => {
  const _productId = toObjectId(productId, 'productId');
  const totalItems = await ProductVariantModel.countDocuments({ productId: _productId });
  const items = await ProductVariantModel.find({ productId: _productId })
    .sort({ createdAt: -1 })
    .skip((options.page - 1) * options.limit)
    .limit(options.limit)
    .populate('colorId', 'name hexCode')
    .populate('sizeId', 'name')
    .lean();
  const mappedItems = (items as unknown as Array<Record<string, unknown>>).map((item) =>
    mapVariantResponse(item)
  );

  return toPaginatedData(mappedItems, totalItems, options.page, options.limit);
};

export const createProductVariant = async (productId: string, payload: ProductVariantPayload) => {
  const _productId = toObjectId(productId, 'productId');
  const product = await ProductModel.findById(_productId).lean();

  if (!product) {
    throw new ApiError(StatusCodes.NOT_FOUND, 'Product not found');
  }

  const currentVariantCount = await ProductVariantModel.countDocuments({ productId: _productId });

  if (currentVariantCount >= MAX_PRODUCT_VARIANTS) {
    throw new ApiError(
      StatusCodes.BAD_REQUEST,
      `Product cannot have more than ${MAX_PRODUCT_VARIANTS} variants`
    );
  }

  const normalizedColorId = payload.colorId?.trim();
  const normalizedSizeId = payload.sizeId?.trim();
  let normalizedSize = payload.size?.trim();
  let normalizedColorName: string | undefined;

  if (normalizedColorId) {
    const color = await ensureColorExists(normalizedColorId);
    normalizedColorName = color.name?.trim();
  }

  if (normalizedSizeId) {
    const size = await ensureSizeExists(normalizedSizeId);

    if (!normalizedSize) {
      normalizedSize = size.name?.trim();
    }
  }

  const normalizedSkuInput = payload.sku?.trim().toUpperCase();
  const sku =
    normalizedSkuInput ||
    (await generateProductVariantSku({
      productName: product.name,
      color: normalizedColorName,
      size: normalizedSize || 'Standard'
    }));

  const stockQuantity = payload.stockQuantity ?? 0;
  const created = await ProductVariantModel.create({
    productId: _productId,
    ...(normalizedColorId
      ? {
          colorId: toObjectId(normalizedColorId, 'colorId')
        }
      : {}),
    ...(normalizedSizeId
      ? {
          sizeId: toObjectId(normalizedSizeId, 'sizeId')
        }
      : {}),
    sku,
    size: normalizedSize || 'Standard',
    price: payload.price,
    originalPrice: payload.originalPrice,
    stockQuantity,
    isAvailable: payload.isAvailable ?? stockQuantity > 0,
    images: payload.images ?? []
  });

  const createdVariant = await ProductVariantModel.findById(created._id)
    .populate('colorId', 'name hexCode')
    .populate('sizeId', 'name')
    .lean();

  return mapVariantResponse(createdVariant as unknown as Record<string, unknown>);
};

export const updateProductVariant = async (
  productId: string,
  variantId: string,
  payload: Partial<ProductVariantPayload & { colorId?: string | null; sizeId?: string | null }>
) => {
  await ensureVariantBelongsProduct(variantId, productId);

  const updateData: Record<string, unknown> = {};

  if (payload.sku !== undefined) {
    updateData.sku = payload.sku;
  }

  if (payload.price !== undefined) {
    updateData.price = payload.price;
  }

  if (payload.originalPrice !== undefined) {
    updateData.originalPrice = payload.originalPrice;
  }

  if (payload.stockQuantity !== undefined) {
    updateData.stockQuantity = payload.stockQuantity;
  }

  if (payload.isAvailable !== undefined) {
    updateData.isAvailable = payload.isAvailable;
  }

  if (payload.images !== undefined) {
    updateData.images = payload.images;
  }

  if (payload.colorId !== undefined) {
    const normalizedColorId =
      typeof payload.colorId === 'string' ? payload.colorId.trim() : payload.colorId;

    if (typeof normalizedColorId === 'string' && normalizedColorId) {
      await ensureColorExists(normalizedColorId);
      updateData.colorId = toObjectId(normalizedColorId, 'colorId');
    } else {
      updateData.colorId = null;
    }
  }

  if (payload.sizeId !== undefined) {
    const normalizedSizeId =
      typeof payload.sizeId === 'string' ? payload.sizeId.trim() : payload.sizeId;

    if (typeof normalizedSizeId === 'string' && normalizedSizeId) {
      const size = await ensureSizeExists(normalizedSizeId);
      updateData.sizeId = toObjectId(normalizedSizeId, 'sizeId');

      if (payload.size === undefined) {
        updateData.size = size.name?.trim() || 'Standard';
      }
    } else {
      updateData.sizeId = null;
    }
  }

  if (payload.size !== undefined) {
    updateData.size = payload.size.trim() || 'Standard';
  }

  if (payload.stockQuantity !== undefined && payload.isAvailable === undefined) {
    updateData.isAvailable = payload.stockQuantity > 0;
  }

  const updated = await ProductVariantModel.findByIdAndUpdate(
    toObjectId(variantId, 'variantId'),
    updateData,
    { returnDocument: 'after' }
  )
    .populate('colorId', 'name hexCode')
    .populate('sizeId', 'name')
    .lean();

  if (!updated) {
    throw new ApiError(StatusCodes.NOT_FOUND, 'Variant not found');
  }

  return mapVariantResponse(updated as unknown as Record<string, unknown>);
};

export const deleteProductVariant = async (productId: string, variantId: string) => {
  await ensureVariantBelongsProduct(variantId, productId);

  const deleted = await ProductVariantModel.findByIdAndDelete(
    toObjectId(variantId, 'variantId')
  ).lean();

  if (!deleted) {
    throw new ApiError(StatusCodes.NOT_FOUND, 'Variant not found');
  }

  return {
    id: String(deleted._id)
  };
};
