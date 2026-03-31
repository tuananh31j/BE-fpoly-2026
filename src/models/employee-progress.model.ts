import type { Types } from 'mongoose';
import { Schema, model } from 'mongoose';

import type { EmployeeProgressStatus } from '@/types/domain';

export interface EmployeeProgressDocument {
  userId: Types.ObjectId;
  courseId: Types.ObjectId;
  status: EmployeeProgressStatus;
  progressPercentage: number;
  enrolledAt: Date;
  completedAt?: Date;
  completedLessonIds: Types.ObjectId[];
  createdAt: Date;
  updatedAt: Date;
}

const employeeProgressSchema = new Schema<EmployeeProgressDocument>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    courseId: { type: Schema.Types.ObjectId, ref: 'Course', required: true },
    status: {
      type: String,
      enum: ['enrolled', 'in_progress', 'completed'],
      default: 'enrolled'
    },
    progressPercentage: { type: Number, default: 0, min: 0, max: 100 },
    enrolledAt: { type: Date, default: Date.now },
    completedAt: { type: Date },
    completedLessonIds: [{ type: Schema.Types.ObjectId, ref: 'Lesson' }]
  },
  {
    timestamps: true
  }
);

employeeProgressSchema.index({ userId: 1, courseId: 1 }, { unique: true });

export const EmployeeProgressModel = model<EmployeeProgressDocument>(
  'EmployeeProgress',
  employeeProgressSchema
);
