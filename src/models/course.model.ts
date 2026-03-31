import type { Types } from 'mongoose';
import { Schema, model } from 'mongoose';

export interface CourseDocument {
  title: string;
  description?: string;
  thumbnail?: string;
  instructorId: Types.ObjectId;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const courseSchema = new Schema<CourseDocument>(
  {
    title: { type: String, required: true },
    description: { type: String },
    thumbnail: { type: String },
    instructorId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    isActive: { type: Boolean, default: true }
  },
  {
    timestamps: { createdAt: true, updatedAt: true }
  }
);

courseSchema.index({ instructorId: 1, createdAt: -1 });

export const CourseModel = model<CourseDocument>('Course', courseSchema);
