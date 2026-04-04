import { Schema, model, type Types } from 'mongoose';

import type {
  CancelRefundRequestStatus,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  RefundMethod,
  ReturnRequestStatus,
  ZalopayChannel
} from '@/types/domain';

export interface OrderItemSnapshot {
  productId: Types.ObjectId;
  productName: string;
  variantId: Types.ObjectId;
  variantSku: string;
  variantColor: string;
  productImage?: string;
  quantity: number;
  price: number;
  total: number;
}

export interface OrderStatusHistory {
  status: OrderStatus;
  changedBy: Types.ObjectId;
  note?: string;
  changedAt: Date;
}

export interface OrderReturnItem {
  productId: Types.ObjectId;
  productName: string;
  variantId: Types.ObjectId;
  variantSku: string;
  quantity: number;
  price: number;
  total: number;
}

export interface OrderReturnRequest {
  _id: Types.ObjectId;
  requestedBy: Types.ObjectId;
  status: ReturnRequestStatus;
  refundMethod: RefundMethod;
  refundAmount: number;
  reason?: string;
  note?: string;
  refundEvidenceImages?: string[];
  items: OrderReturnItem[];
  createdAt: Date;
  updatedAt: Date;
}

export interface OrderCancelRefundRequest {
  requestedBy: Types.ObjectId;
  status: CancelRefundRequestStatus;
  refundAmount: number;
  bankCode: string;
  bankName: string;
  accountNumber: string;
  accountHolder: string;
  note?: string;
  adminNote?: string;
  refundEvidenceImages?: string[];
  requestedAt: Date;
  updatedAt: Date;
  processedAt?: Date;
  processedBy?: Types.ObjectId;
}

export interface OrderDocument {
  orderCode: string;
  userId: Types.ObjectId;
  shippingRecipientName: string;
  shippingPhone: string;
  shippingAddress: string;
  subtotal: number;
  shippingFee: number;
  discountAmount: number;
  totalAmount: number;
  paymentMethod: PaymentMethod;
  zalopayChannel?: ZalopayChannel;
  paymentStatus: PaymentStatus;
  paymentTxnRef?: string;
  paymentTransactionNo?: string;
  paymentGatewayResponseCode?: string;
  paidAt?: Date;
  refundedAt?: Date;
  deliveredAt?: Date;
  completedAt?: Date;
  voucherId?: Types.ObjectId;
  status: OrderStatus;
  items: OrderItemSnapshot[];
  statusHistory: OrderStatusHistory[];
  returnRequests?: OrderReturnRequest[];
  cancelRefundRequest?: OrderCancelRefundRequest;
  createdAt: Date;
  updatedAt: Date;
}

const orderItemSchema = new Schema<OrderItemSnapshot>(
  {
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    productName: { type: String, required: true },
    variantId: { type: Schema.Types.ObjectId, ref: 'ProductVariant', required: true },
    variantSku: { type: String, required: true },
    variantColor: { type: String, required: true },
    productImage: { type: String },
    quantity: { type: Number, required: true, min: 1 },
    price: { type: Number, required: true, min: 0 },
    total: { type: Number, required: true, min: 0 }
  },
  { _id: false }
);

const statusHistorySchema = new Schema<OrderStatusHistory>(
  {
    status: {
      type: String,
      enum: [
        'awaiting_payment',
        'pending',
        'confirmed',
        'shipping',
        'delivered',
        'completed',
        'cancelled',
        'returned'
      ],
      required: true
    },
    changedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    note: { type: String },
    changedAt: { type: Date, default: Date.now }
  },
  { _id: false }
);

const returnItemSchema = new Schema<OrderReturnItem>(
  {
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    productName: { type: String, required: true },
    variantId: { type: Schema.Types.ObjectId, ref: 'ProductVariant', required: true },
    variantSku: { type: String, required: true },
    quantity: { type: Number, required: true, min: 1 },
    price: { type: Number, required: true, min: 0 },
    total: { type: Number, required: true, min: 0 }
  },
  { _id: false }
);

const returnRequestSchema = new Schema<OrderReturnRequest>(
  {
    requestedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected', 'refunded'],
      default: 'pending'
    },
    refundMethod: {
      type: String,
      enum: ['bank_transfer', 'wallet'],
      default: 'bank_transfer'
    },
    refundAmount: { type: Number, required: true, min: 0 },
    reason: { type: String },
    note: { type: String },
    refundEvidenceImages: [{ type: String }],
    items: { type: [returnItemSchema], default: [] }
  },
  { timestamps: true }
);

const cancelRefundRequestSchema = new Schema<OrderCancelRefundRequest>(
  {
    requestedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    status: {
      type: String,
      enum: ['pending', 'rejected', 'refunded'],
      default: 'pending'
    },
    refundAmount: { type: Number, required: true, min: 0 },
    bankCode: { type: String, required: true, trim: true, uppercase: true },
    bankName: { type: String, required: true, trim: true },
    accountNumber: { type: String, required: true, trim: true },
    accountHolder: { type: String, required: true, trim: true },
    note: { type: String, trim: true },
    adminNote: { type: String, trim: true },
    refundEvidenceImages: [{ type: String }],
    requestedAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
    processedAt: { type: Date },
    processedBy: { type: Schema.Types.ObjectId, ref: 'User' }
  },
  { _id: false }
);

const orderSchema = new Schema<OrderDocument>(
  {
    orderCode: { type: String, required: true, unique: true, trim: true, uppercase: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    shippingRecipientName: { type: String, required: true },
    shippingPhone: { type: String, required: true },
    shippingAddress: { type: String, required: true },
    subtotal: { type: Number, required: true, min: 0 },
    shippingFee: { type: Number, default: 0, min: 0 },
    discountAmount: { type: Number, default: 0, min: 0 },
    totalAmount: { type: Number, required: true, min: 0 },
    paymentMethod: {
      type: String,
      enum: ['cod', 'banking', 'momo', 'vnpay', 'zalopay'],
      default: 'cod'
    },
    zalopayChannel: {
      type: String,
      enum: ['gateway', 'wallet', 'bank_card', 'atm']
    },
    paymentStatus: {
      type: String,
      enum: ['pending', 'paid', 'failed', 'refunded'],
      default: 'pending'
    },
    paymentTxnRef: { type: String, trim: true, uppercase: true },
    paymentTransactionNo: { type: String, trim: true },
    paymentGatewayResponseCode: { type: String, trim: true },
    paidAt: { type: Date },
    refundedAt: { type: Date },
    voucherId: { type: Schema.Types.ObjectId, ref: 'Voucher' },
    status: {
      type: String,
      enum: [
        'awaiting_payment',
        'pending',
        'confirmed',
        'shipping',
        'delivered',
        'completed',
        'cancelled',
        'returned'
      ],
      default: 'pending'
    },
    deliveredAt: { type: Date },
    completedAt: { type: Date },
    items: { type: [orderItemSchema], default: [] },
    statusHistory: { type: [statusHistorySchema], default: [] },
    returnRequests: { type: [returnRequestSchema], default: [] },
    cancelRefundRequest: { type: cancelRefundRequestSchema }
  },
  { timestamps: true }
);

orderSchema.index({ paymentTxnRef: 1 }, { unique: true, sparse: true });
orderSchema.index({ userId: 1, createdAt: -1 });
orderSchema.index({ status: 1, createdAt: -1 });

export const OrderModel = model<OrderDocument>('Order', orderSchema);
