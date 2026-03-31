import { Schema, model, type Types } from 'mongoose';

export interface ProductVariantDocument {
  productId: Types.ObjectId;
  colorId?: Types.ObjectId;
  sizeId?: Types.ObjectId;
  sku: string;
  size: string;
  price: number;
  originalPrice?: number;
  stockQuantity: number;
  isAvailable: boolean;
  images: string[];
  createdAt: Date;
  updatedAt: Date;
}

const productVariantSchema = new Schema<ProductVariantDocument>(
  {
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    colorId: { type: Schema.Types.ObjectId, ref: 'Color' },
    sizeId: { type: Schema.Types.ObjectId, ref: 'Size' },
    sku: { type: String, required: true, unique: true, trim: true, uppercase: true },
    size: { type: String, required: true, trim: true, default: 'Standard' },
    price: { type: Number, required: true, min: 0 },
    originalPrice: { type: Number, min: 0 },
    stockQuantity: { type: Number, default: 0, min: 0 },
    isAvailable: { type: Boolean, default: true },
    images: [{ type: String }]
  },
  {
    timestamps: true
  }
);

productVariantSchema.index({ productId: 1, colorId: 1, size: 1 }, { unique: true });
productVariantSchema.index({ productId: 1, isAvailable: 1 });
productVariantSchema.index({ sizeId: 1 });

export const ProductVariantModel = model<ProductVariantDocument>(
  'ProductVariant',
  productVariantSchema
);
