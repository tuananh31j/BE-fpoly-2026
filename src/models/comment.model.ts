import type { Types } from 'mongoose';
import { Schema, model } from 'mongoose';

import type { CommentTargetModel } from '@/types/domain';

export interface CommentDocument {
  targetId: Types.ObjectId;
  targetModel: CommentTargetModel;
  userId: Types.ObjectId;
  content: string;
  parentId?: Types.ObjectId;
  isHidden: boolean;
  createdAt: Date;
}

const commentSchema = new Schema<CommentDocument>(
  {
    targetId: { type: Schema.Types.ObjectId, required: true },
    targetModel: { type: String, enum: ['product'], required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    content: { type: String, required: true },
    parentId: { type: Schema.Types.ObjectId, ref: 'Comment' },
    isHidden: { type: Boolean, default: false }
  },
  {
    timestamps: { createdAt: true, updatedAt: false }
  }
);

commentSchema.index({ targetModel: 1, targetId: 1, createdAt: -1 });

export const CommentModel = model<CommentDocument>('Comment', commentSchema);
