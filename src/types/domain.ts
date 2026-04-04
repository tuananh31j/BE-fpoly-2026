export type Role = 'customer' | 'staff' | 'admin';

export type VoucherDiscountType = 'percentage' | 'fixed_amount';

export type OrderStatus =
  | 'awaiting_payment'
  | 'pending'
  | 'confirmed'
  | 'shipping'
  | 'delivered'
  | 'completed'
  | 'cancelled'
  | 'returned';

export type PaymentMethod = 'cod' | 'banking' | 'momo' | 'vnpay' | 'zalopay';
export type ZalopayChannel = 'gateway' | 'wallet' | 'bank_card' | 'atm';

export type PaymentStatus = 'pending' | 'paid' | 'failed' | 'refunded';

export type ReturnRequestStatus = 'pending' | 'approved' | 'rejected' | 'refunded';

export type CancelRefundRequestStatus = 'pending' | 'rejected' | 'refunded';

export type RefundMethod = 'bank_transfer' | 'wallet';

export type InventoryReason = 'import' | 'sale' | 'return' | 'adjustment' | 'damage';

export type CommentTargetModel = 'product';

export type EmployeeProgressStatus = 'enrolled' | 'in_progress' | 'completed';
