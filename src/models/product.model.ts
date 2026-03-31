import { Schema, model, type Types } from 'mongoose';

export interface ProductDocument {
  name: string;
  categoryId: Types.ObjectId;
  brandId?: Types.ObjectId;
  brand: string;
  description?: string;
  attributes?: Record<string, unknown>;
  images: string[];
  isAvailable: boolean;
  averageRating: number;
  reviewCount: number;
  soldCount: number;
  createdAt: Date;
  updatedAt: Date;
}

const productSchema = new Schema<ProductDocument>(
  {
    name: { type: String, required: true, trim: true },
    categoryId: { type: Schema.Types.ObjectId, ref: 'Category', required: true },
    brandId: { type: Schema.Types.ObjectId, ref: 'Brand' },
    brand: { type: String, required: true, trim: true, default: 'Generic' },
    description: { type: String },
    attributes: { type: Schema.Types.Mixed },
    images: [{ type: String }],
    isAvailable: { type: Boolean, default: true },
    averageRating: { type: Number, default: 0, min: 0, max: 5 },
    reviewCount: { type: Number, default: 0, min: 0 },
    soldCount: { type: Number, default: 0, min: 0 }
  },
  {
    timestamps: true
  }
);

productSchema.index({ categoryId: 1, isAvailable: 1 });
productSchema.index({ brandId: 1, isAvailable: 1 });
productSchema.index({ brand: 1, isAvailable: 1 });

export const ProductModel = model<ProductDocument>('Product', productSchema);
