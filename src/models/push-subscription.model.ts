import { Schema, model, type Types } from 'mongoose';

import type { Role } from '@/types/domain';

interface PushSubscriptionKeys {
  p256dh: string;
  auth: string;
}

export interface PushSubscriptionDocument {
  userId: Types.ObjectId;
  role: Role;
  endpoint: string;
  expirationTime?: number | null;
  keys: PushSubscriptionKeys;
  userAgent?: string;
  createdAt: Date;
  updatedAt: Date;
}

const pushSubscriptionSchema = new Schema<PushSubscriptionDocument>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    role: {
      type: String,
      enum: ['customer', 'staff', 'admin'],
      required: true
    },
    endpoint: { type: String, required: true, unique: true, trim: true },
    expirationTime: { type: Number, default: null },
    keys: {
      p256dh: { type: String, required: true },
      auth: { type: String, required: true }
    },
    userAgent: { type: String, trim: true }
  },
  {
    timestamps: true
  }
);

pushSubscriptionSchema.index({ userId: 1, role: 1 });
pushSubscriptionSchema.index({ role: 1 });

export const PushSubscriptionModel = model<PushSubscriptionDocument>(
  'PushSubscription',
  pushSubscriptionSchema
);
