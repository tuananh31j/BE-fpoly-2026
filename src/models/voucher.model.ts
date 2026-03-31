import { Schema, model } from 'mongoose';

import type { VoucherDiscountType } from '@/types/domain';

export interface VoucherDocument {
  code: string;
  description?: string;
  discountType: VoucherDiscountType;
  discountValue: number;
  minOrderValue: number;
  maxDiscountAmount?: number;
  startDate: Date;
  expirationDate: Date;
  usageLimit: number;
  maxUsagePerUser: number;
  usedCount: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const voucherSchema = new Schema<VoucherDocument>(
  {
    code: { type: String, required: true, unique: true, trim: true, uppercase: true },
    description: { type: String },
    discountType: { type: String, enum: ['percentage', 'fixed_amount'], required: true },
    discountValue: { type: Number, required: true, min: 0 },
    minOrderValue: { type: Number, default: 0, min: 0 },
    maxDiscountAmount: { type: Number, min: 0 },
    startDate: { type: Date, required: true },
    expirationDate: { type: Date, required: true },
    usageLimit: { type: Number, required: true, min: 0 },
    maxUsagePerUser: { type: Number, required: true, min: 1 },
    usedCount: { type: Number, default: 0, min: 0 },
    isActive: { type: Boolean, default: true }
  },
  { timestamps: true }
);

export const VoucherModel = model<VoucherDocument>('Voucher', voucherSchema);
