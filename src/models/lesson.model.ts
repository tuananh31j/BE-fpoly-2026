import type { Types } from 'mongoose';
import { Schema, model } from 'mongoose';

export interface LessonDocument {
  moduleId: Types.ObjectId;
  title: string;
  content?: string;
  duration?: number;
  isRequired: boolean;
  order: number;
}

const lessonSchema = new Schema<LessonDocument>(
  {
    moduleId: { type: Schema.Types.ObjectId, ref: 'Module', required: true },
    title: { type: String, required: true },
    content: { type: String },
    duration: { type: Number },
    isRequired: { type: Boolean, default: true },
    order: { type: Number, default: 0 }
  },
  {
    timestamps: false
  }
);

lessonSchema.index({ moduleId: 1, order: 1 });

export const LessonModel = model<LessonDocument>('Lesson', lessonSchema);
