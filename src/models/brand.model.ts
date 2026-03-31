import { Schema, model } from 'mongoose';

export interface BrandDocument {
  name: string;
  description?: string;
  logoUrl?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const brandSchema = new Schema<BrandDocument>(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String },
    logoUrl: { type: String },
    isActive: { type: Boolean, default: true }
  },
  {
    timestamps: true
  }
);

brandSchema.index({ name: 1 });
brandSchema.index({ isActive: 1 });

export const BrandModel = model<BrandDocument>('Brand', brandSchema);
