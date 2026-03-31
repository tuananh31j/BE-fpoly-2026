import { Schema, model } from 'mongoose';

export interface CategoryDocument {
  name: string;
  description?: string;
  isActive: boolean;
}

const categorySchema = new Schema<CategoryDocument>(
  {
    name: {
      type: String,
      required: true,
      trim: true
    },
    description: {
      type: String
    },
    isActive: {
      type: Boolean,
      default: true
    }
  },
  {
    timestamps: true
  }
);

categorySchema.index({ name: 1 });

export const CategoryModel = model<CategoryDocument>('Category', categorySchema);
