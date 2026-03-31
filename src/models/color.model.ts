import { Schema, model } from 'mongoose';

export interface ColorDocument {
  name: string;
  hexCode?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const colorSchema = new Schema<ColorDocument>(
  {
    name: { type: String, required: true, trim: true },
    hexCode: { type: String, trim: true, uppercase: true },
    isActive: { type: Boolean, default: true }
  },
  {
    timestamps: true
  }
);

colorSchema.index({ name: 1 });
colorSchema.index({ isActive: 1 });

export const ColorModel = model<ColorDocument>('Color', colorSchema);
