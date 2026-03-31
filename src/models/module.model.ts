import type { Types } from 'mongoose';
import { Schema, model } from 'mongoose';

export interface ModuleDocument {
  courseId: Types.ObjectId;
  title: string;
  order: number;
}

const moduleSchema = new Schema<ModuleDocument>(
  {
    courseId: { type: Schema.Types.ObjectId, ref: 'Course', required: true },
    title: { type: String, required: true },
    order: { type: Number, default: 0 }
  },
  {
    timestamps: false
  }
);

moduleSchema.index({ courseId: 1, order: 1 });

export const ModuleModel = model<ModuleDocument>('Module', moduleSchema);
