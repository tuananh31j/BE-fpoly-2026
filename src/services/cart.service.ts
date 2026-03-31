import { StatusCodes } from 'http-status-codes';

import { CartModel } from '@models/cart.model';
import { ProductVariantModel } from '@models/product-variant.model';
import { ProductModel } from '@models/product.model';
import { ApiError } from '@utils/api-error';
import { toObjectId } from '@utils/object-id';

interface UpsertCartItemInput {
  productId: string;
  variantId: string;
  quantity: number;
  selectedAttributes?: Record<string, unknown>;
}

const ensureCart = async (userId: string) => {
  return CartModel.findOneAndUpdate(
    {
      userId: toObjectId(userId, 'userId')
    },
    {
      $setOnInsert: {
        items: []
      }
    },
    {
      upsert: true,
      returnDocument: 'after'
    }
  );
};

const enrichCart = async (
  items: Array<{ productId: unknown; variantId: unknown; quantity: number }>
) => {
  const productIds = items.map((item) => item.productId);
  const variantIds = items.map((item) => item.variantId);

  const [products, variants] = await Promise.all([
    ProductModel.find({ _id: { $in: productIds } }).lean(),
    ProductVariantModel.find({ _id: { $in: variantIds } }).lean()
  ]);

  const productMap = new Map(products.map((item) => [String(item._id), item]));
  const variantMap = new Map(variants.map((item) => [String(item._id), item]));

  return items.map((item) => {
    const product = productMap.get(String(item.productId));
    const variant = variantMap.get(String(item.variantId));

    return {
      ...item,
      product,
      variant
    };
  });
};

export const getMyCart = async (userId: string) => {
  const cart = await ensureCart(userId);

  if (!cart) {
    throw new ApiError(StatusCodes.INTERNAL_SERVER_ERROR, 'Cannot initialize cart');
  }

  const items = await enrichCart(
    cart.items.map((item) => ({
      productId: item.productId,
      variantId: item.variantId,
      quantity: item.quantity,
      selectedAttributes: item.selectedAttributes
    }))
  );

  return {
    id: String(cart._id),
    userId: String(cart.userId),
    items,
    updatedAt: cart.updatedAt
  };
};

export const upsertMyCartItem = async (userId: string, payload: UpsertCartItemInput) => {
  const _productId = toObjectId(payload.productId, 'productId');
  const _variantId = toObjectId(payload.variantId, 'variantId');

  const [product, variant, cart] = await Promise.all([
    ProductModel.findById(_productId).lean(),
    ProductVariantModel.findById(_variantId),
    ensureCart(userId)
  ]);

  if (!product) {
    throw new ApiError(StatusCodes.NOT_FOUND, 'Product not found');
  }

  if (!variant) {
    throw new ApiError(StatusCodes.NOT_FOUND, 'Variant not found');
  }

  if (String(variant.productId) !== String(_productId)) {
    throw new ApiError(StatusCodes.UNPROCESSABLE_ENTITY, 'Variant does not belong to product');
  }

  if (!variant.isAvailable || payload.quantity > variant.stockQuantity) {
    throw new ApiError(StatusCodes.UNPROCESSABLE_ENTITY, 'Variant is unavailable or out of stock');
  }

  if (!cart) {
    throw new ApiError(StatusCodes.INTERNAL_SERVER_ERROR, 'Cannot initialize cart');
  }

  const existingIndex = cart.items.findIndex(
    (item) => String(item.variantId) === String(_variantId)
  );

  if (existingIndex >= 0) {
    cart.items[existingIndex].productId = _productId;
    cart.items[existingIndex].variantId = _variantId;
    cart.items[existingIndex].quantity = payload.quantity;
    cart.items[existingIndex].selectedAttributes = payload.selectedAttributes;
  } else {
    cart.items.push({
      productId: _productId,
      variantId: _variantId,
      quantity: payload.quantity,
      selectedAttributes: payload.selectedAttributes
    });
  }

  await cart.save();

  return getMyCart(userId);
};

export const removeMyCartItem = async (userId: string, variantId: string) => {
  const _variantId = toObjectId(variantId, 'variantId');
  const cart = await ensureCart(userId);

  if (!cart) {
    throw new ApiError(StatusCodes.INTERNAL_SERVER_ERROR, 'Cannot initialize cart');
  }

  const nextItems = cart.items.filter((item) => String(item.variantId) !== String(_variantId));
  cart.items = nextItems;
  await cart.save();

  return getMyCart(userId);
};

export const clearMyCart = async (userId: string) => {
  const cart = await ensureCart(userId);

  if (!cart) {
    throw new ApiError(StatusCodes.INTERNAL_SERVER_ERROR, 'Cannot initialize cart');
  }

  cart.items = [];
  await cart.save();

  return getMyCart(userId);
};
