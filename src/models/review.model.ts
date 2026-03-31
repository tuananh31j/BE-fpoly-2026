import type { Types } from 'mongoose';
import { Schema, model } from 'mongoose';

export interface ReviewDocument {
  productId: Types.ObjectId;
  userId: Types.ObjectId;
  orderId: Types.ObjectId;
  rating: number;
  content?: string;
  images: string[];
  isPublished: boolean;
  replyContent?: string;
  repliedAt?: Date;
  repliedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const reviewSchema = new Schema<ReviewDocument>(
  {
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    orderId: { type: Schema.Types.ObjectId, ref: 'Order', required: true },
    rating: { type: Number, required: true, min: 1, max: 5 },
    content: { type: String },
    images: [{ type: String }],
    isPublished: { type: Boolean, default: true },
    replyContent: { type: String },
    repliedAt: { type: Date },
    repliedBy: { type: Schema.Types.ObjectId, ref: 'User' }
  },
  { timestamps: true }
);

reviewSchema.index({ orderId: 1, productId: 1 }, { unique: true });
reviewSchema.index({ productId: 1, createdAt: -1 });

export const ReviewModel = model<ReviewDocument>('Review', reviewSchema);
