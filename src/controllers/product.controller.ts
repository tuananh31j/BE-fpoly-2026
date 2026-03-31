import { StatusCodes } from 'http-status-codes';

import {
  createProduct,
  createProductVariant,
  deleteProduct,
  deleteProductVariant,
  getProductById,
  listProductFilters,
  listNewestProducts,
  listProductVariants,
  listProducts,
  listTopSellingProducts,
  updateProduct,
  updateProductVariant
} from '@services/product.service';
import { asyncHandler } from '@utils/async-handler';
import { getParam } from '@utils/request';
import { sendSuccess } from '@utils/response';

// worklog: 2026-03-04 11:11:06 | vanduc | refactor | parseFeaturedLimit
const parseFeaturedLimit = (rawLimit: unknown) => {
  const parsedLimit = Number.parseInt(String(rawLimit ?? '10'), 10);

  if (!Number.isFinite(parsedLimit) || parsedLimit <= 0) {
    return 10;
  }

  return Math.min(parsedLimit, 20);
};

export const listProductsController = asyncHandler(async (req, res) => {
  const parseQueryList = (value: unknown) => {
    if (Array.isArray(value)) {
      return value
        .flatMap((entry) => String(entry).split(','))
        .map((entry) => entry.trim())
        .filter(Boolean);
    }

    if (typeof value === 'string') {
      return value
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean);
    }

    return [];
  };

  const data = await listProducts({
    page: res.locals.pagination?.page ?? 1,
    limit: res.locals.pagination?.limit ?? 20,
    categoryId: req.query.categoryId as string | undefined,
    brandId: req.query.brandId as string | undefined,
    brand: req.query.brand as string | undefined,
    colorIds: parseQueryList(req.query.colorIds),
    priceRanges: parseQueryList(req.query.priceRanges),
    search: req.query.search as string | undefined,
    isAvailable:
      req.query.isAvailable === undefined
        ? undefined
        : String(req.query.isAvailable).toLowerCase() === 'true'
  });

  return sendSuccess(res, {
    message: 'Get products successfully',
    data
  });
});

export const listTopSellingProductsController = asyncHandler(async (req, res) => {
  const data = await listTopSellingProducts(parseFeaturedLimit(req.query.limit));

  return sendSuccess(res, {
    message: 'Get top selling products successfully',
    data
  });
});

export const listNewestProductsController = asyncHandler(async (req, res) => {
  const data = await listNewestProducts(parseFeaturedLimit(req.query.limit));

  return sendSuccess(res, {
    message: 'Get newest products successfully',
    data
  });
});

export const listProductFiltersController = asyncHandler(async (_req, res) => {
  const data = await listProductFilters();

  return sendSuccess(res, {
    message: 'Get product filters successfully',
    data
  });
});

export const getProductByIdController = asyncHandler(async (req, res) => {
  const data = await getProductById(getParam(req.params.productId, 'productId'));

  return sendSuccess(res, {
    message: 'Get product successfully',
    data
  });
});

export const createProductController = asyncHandler(async (req, res) => {
  const data = await createProduct(req.body);

  return sendSuccess(res, {
    statusCode: StatusCodes.CREATED,
    message: 'Create product successfully',
    data
  });
});

export const updateProductController = asyncHandler(async (req, res) => {
  const data = await updateProduct(getParam(req.params.productId, 'productId'), req.body);

  return sendSuccess(res, {
    message: 'Update product successfully',
    data
  });
});

export const deleteProductController = asyncHandler(async (req, res) => {
  const data = await deleteProduct(getParam(req.params.productId, 'productId'));

  return sendSuccess(res, {
    message: 'Delete product successfully',
    data
  });
});

export const listProductVariantsController = asyncHandler(async (req, res) => {
  const data = await listProductVariants(getParam(req.params.productId, 'productId'), {
    page: res.locals.pagination?.page ?? 1,
    limit: res.locals.pagination?.limit ?? 20
  });

  return sendSuccess(res, {
    message: 'Get product variants successfully',
    data
  });
});

export const createProductVariantController = asyncHandler(async (req, res) => {
  const data = await createProductVariant(getParam(req.params.productId, 'productId'), req.body);

  return sendSuccess(res, {
    statusCode: StatusCodes.CREATED,
    message: 'Create product variant successfully',
    data
  });
});

export const updateProductVariantController = asyncHandler(async (req, res) => {
  const data = await updateProductVariant(
    getParam(req.params.productId, 'productId'),
    getParam(req.params.variantId, 'variantId'),
    req.body
  );

  return sendSuccess(res, {
    message: 'Update product variant successfully',
    data
  });
});

export const deleteProductVariantController = asyncHandler(async (req, res) => {
  const data = await deleteProductVariant(
    getParam(req.params.productId, 'productId'),
    getParam(req.params.variantId, 'variantId')
  );

  return sendSuccess(res, {
    message: 'Delete product variant successfully',
    data
  });
});
