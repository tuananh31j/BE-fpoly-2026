import { Schema, model } from 'mongoose';

export interface SizeDocument {
  name: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const sizeSchema = new Schema<SizeDocument>(
  {
    name: { type: String, required: true, trim: true },
    isActive: { type: Boolean, default: true }
  },
  {
    timestamps: true
  }
);

sizeSchema.index({ name: 1 });
sizeSchema.index({ isActive: 1 });

export const SizeModel = model<SizeDocument>('Size', sizeSchema);
