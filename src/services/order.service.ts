import crypto from 'node:crypto';

import { StatusCodes } from 'http-status-codes';

import type {
  CancelRefundRequestStatus,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  RefundMethod,
  ReturnRequestStatus,
  VoucherDiscountType,
  ZalopayChannel
} from '@/types/domain';
import { env } from '@config/env';
import { logger } from '@config/logger';
import { AddressModel } from '@models/address.model';
import { CartModel } from '@models/cart.model';
import { CommentModel } from '@models/comment.model';
import { OrderModel, type OrderDocument } from '@models/order.model';
import { ProductVariantModel } from '@models/product-variant.model';
import { ProductModel } from '@models/product.model';
import { ReviewModel } from '@models/review.model';
import { UserModel } from '@models/user.model';
import { sendMail } from '@services/mail.service';
import { emitStaffRealtimeNotification } from '@services/realtime-notification.service';
import {
  createZalopayPaymentUrl,
  queryZalopayOrderStatus,
  type ZalopayRedirectPayload,
  verifyZalopayCallback,
  verifyZalopayRedirect
} from '@services/zalopay.service';
import { VoucherModel } from '@models/voucher.model';
import { createVnpayPaymentUrl, verifyVnpayReturnParams } from '@services/vnpay.service';
import { applyVoucherForSubtotal } from '@services/voucher.service';
import { ApiError } from '@utils/api-error';
import { addMoney, roundMoney, subtractMoney } from '@utils/money';
import { toObjectId } from '@utils/object-id';
import { assertOrderTransitionAllowed } from '@utils/order-transition';
import { toPaginatedData } from '@utils/pagination';

interface CreateOrderInput {
  addressId?: string;
  shippingRecipientName?: string;
  shippingPhone?: string;
  shippingAddress?: string;
  shippingFee?: number;
  voucherCode?: string;
  paymentMethod?: PaymentMethod;
  zalopayChannel?: ZalopayChannel;
  selectedVariantIds?: string[];
  clientIp?: string;
}

interface UpdateOrderStatusInput {
  orderId: string;
  status: OrderStatus;
  changedBy: string;
  note?: string;
}

interface RetryVnpayPaymentInput {
  userId: string;
  orderId: string;
  clientIp?: string;
}

interface ReturnRequestItemInput {
  variantId: string;
  quantity: number;
}

interface CreateReturnRequestInput {
  userId: string;
  orderId: string;
  items: ReturnRequestItemInput[];
  reason?: string;
  refundMethod?: RefundMethod;
}

interface UpdateReturnRequestInput {
  orderId: string;
  returnRequestId: string;
  status: ReturnRequestStatus;
  refundMethod?: RefundMethod;
  note?: string;
  refundEvidenceImages?: string[];
}

interface CreateCancelRefundRequestInput {
  userId: string;
  orderId: string;
  bankCode: string;
  bankName: string;
  accountNumber: string;
  accountHolder: string;
  note?: string;
}

interface UpdateCancelRefundRequestInput {
  orderId: string;
  processedBy: string;
  status: CancelRefundRequestStatus;
  adminNote?: string;
  refundEvidenceImages?: string[];
}

interface ListOrderStatisticsOptions {
  days: number;
}

interface DailyRevenueItem {
  date: string;
  revenue: number;
  orders: number;
  deliveredOrders: number;
}

interface OrderVoucherSnapshot {
  id: string;
  code: string;
  description?: string;
  discountType: VoucherDiscountType;
  discountValue: number;
  maxDiscountAmount?: number;
}

interface CategoryBreakdownAggregateItem {
  categoryId: unknown;
  categoryName: string;
  orders: number;
  deliveredOrders: number;
  items: number;
  revenue: number;
}

interface VariantSalesAggregateItem {
  _id: unknown;
  productId?: unknown;
  productName?: string;
  variantSku?: string;
  variantColor?: string;
  productImage?: string;
  soldCount: number;
  revenue: number;
}

const ORDER_STATUS_ORDER: OrderStatus[] = [
  'awaiting_payment',
  'pending',
  'confirmed',
  'shipping',
  'delivered',
  'completed',
  'cancelled',
  'returned'
];

const PAYMENT_METHOD_ORDER: PaymentMethod[] = ['cod', 'banking', 'momo', 'vnpay', 'zalopay'];
const MONEY_FORMATTER = new Intl.NumberFormat('vi-VN');

const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  awaiting_payment: 'Chờ thanh toán',
  pending: 'Chờ xác nhận',
  confirmed: 'Đã xác nhận',
  shipping: 'Đang giao',
  delivered: 'Đã giao',
  completed: 'Hoàn thành',
  cancelled: 'Đã hủy',
  returned: 'Đã trả hàng'
};

const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cod: 'COD',
  banking: 'Chuyển khoản',
  momo: 'MoMo',
  vnpay: 'VNPay',
  zalopay: 'ZaloPay'
};

const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  pending: 'Chờ thanh toán',
  paid: 'Đã thanh toán',
  failed: 'Thanh toán thất bại',
  refunded: 'Đã hoàn tiền'
};

const RETURN_REQUEST_STATUS_LABELS: Record<ReturnRequestStatus, string> = {
  pending: 'Chờ xử lý',
  approved: 'Đã duyệt',
  rejected: 'Từ chối',
  refunded: 'Đã hoàn tiền'
};

const REFUND_METHOD_LABELS: Record<RefundMethod, string> = {
  bank_transfer: 'Chuyển khoản',
  wallet: 'Hoàn vào ví'
};

const isOnlinePaymentMethod = (paymentMethod: PaymentMethod) => {
  return paymentMethod === 'vnpay' || paymentMethod === 'zalopay';
};

const attachVoucherSnapshots = async <T extends Record<string, unknown>>(orders: T[]) => {
  const voucherIds = Array.from(
    new Set(
      orders
        .map((order) => {
          if (!order.voucherId) {
            return '';
          }

          return String(order.voucherId);
        })
        .filter(Boolean)
    )
  );

  if (voucherIds.length === 0) {
    return orders.map((order) => ({
      ...order,
      voucher: undefined
    }));
  }

  const vouchers = await VoucherModel.find({
    _id: { $in: voucherIds }
  })
    .select('code description discountType discountValue maxDiscountAmount')
    .lean();

  const voucherMap = new Map<string, OrderVoucherSnapshot>(
    vouchers.map((voucher) => [
      String(voucher._id),
      {
        id: String(voucher._id),
        code: voucher.code,
        description: voucher.description,
        discountType: voucher.discountType,
        discountValue: voucher.discountValue,
        maxDiscountAmount: voucher.maxDiscountAmount
      }
    ])
  );

  return orders.map((order) => ({
    ...order,
    voucher: order.voucherId ? voucherMap.get(String(order.voucherId)) : undefined
  }));
};

type OrderMailSnapshot = Pick<
  OrderDocument,
  | 'orderCode'
  | 'status'
  | 'paymentMethod'
  | 'paymentStatus'
  | 'shippingRecipientName'
  | 'shippingPhone'
  | 'shippingAddress'
  | 'subtotal'
  | 'shippingFee'
  | 'discountAmount'
  | 'totalAmount'
  | 'items'
  | 'createdAt'
  | 'updatedAt'
>;

interface SendOrderLifecycleMailInput {
  to: string;
  customerName?: string;
  order: OrderMailSnapshot;
  event: 'created' | 'status_updated' | 'payment_success';
  previousStatus?: OrderStatus;
  note?: string;
  paymentUrl?: string;
}

const escapeHtml = (value: string) => {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
};

const formatMoneyVnd = (value: number) =>
  `${MONEY_FORMATTER.format(Math.max(0, roundMoney(value)))} ₫`;

const formatDateTime = (value?: Date | string) => {
  if (!value) {
    return 'N/A';
  }

  return new Date(value).toLocaleString('vi-VN', {
    hour12: false,
    timeZone: 'Asia/Ho_Chi_Minh'
  });
};

const toReturnRequestMailSnapshot = (
  request: NonNullable<OrderDocument['returnRequests']>[number]
): ReturnRequestMailSnapshot => {
  return {
    status: request.status,
    refundMethod: request.refundMethod,
    refundAmount: request.refundAmount,
    reason: request.reason,
    note: request.note,
    refundEvidenceImages: request.refundEvidenceImages,
    createdAt: request.createdAt,
    updatedAt: request.updatedAt,
    items: request.items.map((item) => ({
      productName: item.productName,
      variantSku: item.variantSku,
      quantity: item.quantity,
      price: item.price,
      total: item.total
    }))
  };
};

const sendOrderLifecycleMail = async ({
  to,
  customerName,
  order,
  event,
  previousStatus,
  note,
  paymentUrl
}: SendOrderLifecycleMailInput) => {
  try {
    const itemsRowsHtml = order.items
      .map((item, index) => {
        return `
          <tr>
            <td style="padding:8px;border:1px solid #e5e7eb;text-align:center;">${index + 1}</td>
            <td style="padding:8px;border:1px solid #e5e7eb;">${escapeHtml(item.productName)}</td>
            <td style="padding:8px;border:1px solid #e5e7eb;">${escapeHtml(item.variantSku)}</td>
            <td style="padding:8px;border:1px solid #e5e7eb;">${escapeHtml(item.variantColor)}</td>
            <td style="padding:8px;border:1px solid #e5e7eb;text-align:right;">${item.quantity}</td>
            <td style="padding:8px;border:1px solid #e5e7eb;text-align:right;">${formatMoneyVnd(item.price)}</td>
            <td style="padding:8px;border:1px solid #e5e7eb;text-align:right;">${formatMoneyVnd(item.total)}</td>
          </tr>
        `;
      })
      .join('');

    const statusChangeHtml =
      event === 'status_updated'
        ? `
      <p style="margin:0 0 12px;color:#374151;">
        Trạng thái đơn hàng đã đổi từ
        <strong>${ORDER_STATUS_LABELS[previousStatus ?? order.status]}</strong>
        sang
        <strong>${ORDER_STATUS_LABELS[order.status]}</strong>.
      </p>
      ${note ? `<p style="margin:0 0 12px;color:#374151;">Ghi chú: ${escapeHtml(note)}</p>` : ''}
    `
        : event === 'payment_success'
          ? `<p style="margin:0 0 12px;color:#374151;">Đơn hàng của bạn đã được thanh toán thành công.</p>`
          : `<p style="margin:0 0 12px;color:#374151;">Đơn hàng của bạn đã được tạo thành công.</p>`;

    const paymentLinkHtml =
      paymentUrl && event === 'created'
        ? `
      <p style="margin:0 0 12px;color:#374151;">
        Link thanh toán:
        <a href="${escapeHtml(paymentUrl)}" style="color:#2563eb;word-break:break-all;">${escapeHtml(paymentUrl)}</a>
      </p>
    `
        : '';

    const subject =
      event === 'created'
        ? `[Golden Billiards] Xác nhận đơn hàng ${order.orderCode}`
        : event === 'payment_success'
          ? `[Golden Billiards] Thanh toán thành công ${order.orderCode}`
          : `[Golden Billiards] Cập nhật trạng thái đơn hàng ${order.orderCode}`;

    const textItems = order.items
      .map((item, index) => {
        return `${index + 1}. ${item.productName} | SKU: ${item.variantSku} | Màu: ${item.variantColor} | SL: ${item.quantity} | Đơn giá: ${formatMoneyVnd(item.price)} | Thành tiền: ${formatMoneyVnd(item.total)}`;
      })
      .join('\n');

    const text =
      `Xin chào ${customerName ?? order.shippingRecipientName ?? 'bạn'},\n\n` +
      `${
        event === 'created'
          ? 'Đơn hàng của bạn đã được tạo thành công.'
          : event === 'payment_success'
            ? 'Đơn hàng của bạn đã được thanh toán thành công.'
            : 'Đơn hàng của bạn vừa được cập nhật trạng thái.'
      }\n` +
      `${
        event === 'status_updated'
          ? `Trạng thái: ${ORDER_STATUS_LABELS[previousStatus ?? order.status]} -> ${ORDER_STATUS_LABELS[order.status]}\n`
          : ''
      }` +
      `${note ? `Ghi chú: ${note}\n` : ''}` +
      `\nMã đơn: ${order.orderCode}\n` +
      `Người nhận: ${order.shippingRecipientName}\n` +
      `SĐT: ${order.shippingPhone}\n` +
      `Địa chỉ: ${order.shippingAddress}\n` +
      `Phương thức thanh toán: ${PAYMENT_METHOD_LABELS[order.paymentMethod]}\n` +
      `Trạng thái thanh toán: ${PAYMENT_STATUS_LABELS[order.paymentStatus]}\n` +
      `Ngày tạo: ${formatDateTime(order.createdAt)}\n` +
      `Cập nhật gần nhất: ${formatDateTime(order.updatedAt)}\n` +
      `\nDanh sách sản phẩm:\n${textItems}\n` +
      `\nTạm tính: ${formatMoneyVnd(order.subtotal)}\n` +
      `Phí vận chuyển: ${formatMoneyVnd(order.shippingFee)}\n` +
      `Giảm giá: ${formatMoneyVnd(order.discountAmount)}\n` +
      `Tổng thanh toán: ${formatMoneyVnd(order.totalAmount)}\n` +
      `${paymentUrl && event === 'created' ? `\nLink thanh toán: ${paymentUrl}\n` : ''}` +
      `\nCảm ơn bạn đã mua sắm tại Golden Billiards.`;

    const html = `
<!DOCTYPE html>
<html lang="vi">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:24px 0;background:#f3f4f6;">
    <tr>
      <td align="center">
        <table width="760" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;">
          <tr>
            <td style="background:#111827;padding:20px 24px;">
              <h1 style="margin:0;color:#ffffff;font-size:20px;">Golden Billiards</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:24px;">
              <p style="margin:0 0 12px;color:#111827;">Xin chào <strong>${escapeHtml(
                customerName ?? order.shippingRecipientName ?? 'bạn'
              )}</strong>,</p>
              ${statusChangeHtml}
              ${paymentLinkHtml}
              <h3 style="margin:16px 0 8px;color:#111827;">Thông tin đơn hàng</h3>
              <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:16px;">
                <tr><td style="padding:6px 0;color:#6b7280;width:180px;">Mã đơn</td><td style="padding:6px 0;color:#111827;">${escapeHtml(order.orderCode)}</td></tr>
                <tr><td style="padding:6px 0;color:#6b7280;">Người nhận</td><td style="padding:6px 0;color:#111827;">${escapeHtml(order.shippingRecipientName)}</td></tr>
                <tr><td style="padding:6px 0;color:#6b7280;">Số điện thoại</td><td style="padding:6px 0;color:#111827;">${escapeHtml(order.shippingPhone)}</td></tr>
                <tr><td style="padding:6px 0;color:#6b7280;">Địa chỉ</td><td style="padding:6px 0;color:#111827;">${escapeHtml(order.shippingAddress)}</td></tr>
                <tr><td style="padding:6px 0;color:#6b7280;">Trạng thái đơn</td><td style="padding:6px 0;color:#111827;">${ORDER_STATUS_LABELS[order.status]}</td></tr>
                <tr><td style="padding:6px 0;color:#6b7280;">Phương thức thanh toán</td><td style="padding:6px 0;color:#111827;">${PAYMENT_METHOD_LABELS[order.paymentMethod]}</td></tr>
                <tr><td style="padding:6px 0;color:#6b7280;">Trạng thái thanh toán</td><td style="padding:6px 0;color:#111827;">${PAYMENT_STATUS_LABELS[order.paymentStatus]}</td></tr>
                <tr><td style="padding:6px 0;color:#6b7280;">Ngày tạo</td><td style="padding:6px 0;color:#111827;">${formatDateTime(order.createdAt)}</td></tr>
                <tr><td style="padding:6px 0;color:#6b7280;">Cập nhật gần nhất</td><td style="padding:6px 0;color:#111827;">${formatDateTime(order.updatedAt)}</td></tr>
              </table>

              <h3 style="margin:16px 0 8px;color:#111827;">Danh sách sản phẩm đã đặt</h3>
              <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:16px;">
                <thead>
                  <tr style="background:#f9fafb;">
                    <th style="padding:8px;border:1px solid #e5e7eb;">#</th>
                    <th style="padding:8px;border:1px solid #e5e7eb;">Sản phẩm</th>
                    <th style="padding:8px;border:1px solid #e5e7eb;">SKU</th>
                    <th style="padding:8px;border:1px solid #e5e7eb;">Màu</th>
                    <th style="padding:8px;border:1px solid #e5e7eb;">SL</th>
                    <th style="padding:8px;border:1px solid #e5e7eb;">Đơn giá</th>
                    <th style="padding:8px;border:1px solid #e5e7eb;">Thành tiền</th>
                  </tr>
                </thead>
                <tbody>${itemsRowsHtml}</tbody>
              </table>

              <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
                <tr><td style="padding:6px 0;color:#6b7280;">Tạm tính</td><td style="padding:6px 0;text-align:right;color:#111827;">${formatMoneyVnd(order.subtotal)}</td></tr>
                <tr><td style="padding:6px 0;color:#6b7280;">Phí vận chuyển</td><td style="padding:6px 0;text-align:right;color:#111827;">${formatMoneyVnd(order.shippingFee)}</td></tr>
                <tr><td style="padding:6px 0;color:#6b7280;">Giảm giá</td><td style="padding:6px 0;text-align:right;color:#111827;">-${formatMoneyVnd(order.discountAmount)}</td></tr>
                <tr><td style="padding:10px 0 0;font-size:16px;font-weight:700;color:#111827;">Tổng thanh toán</td><td style="padding:10px 0 0;text-align:right;font-size:16px;font-weight:700;color:#111827;">${formatMoneyVnd(order.totalAmount)}</td></tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    const sent = await sendMail({
      to,
      subject,
      html,
      text
    });

    if (!sent) {
      logger.warn(`Không thể gửi email đơn hàng ${order.orderCode} tới ${to}`);
      return false;
    }

    return true;
  } catch (error) {
    logger.error(`Lỗi gửi email đơn hàng: ${(error as Error).message}`);
    return false;
  }
};

interface SendCancelRefundProcessedMailInput {
  to: string;
  customerName?: string;
  order: OrderMailSnapshot;
  refundRequest: NonNullable<OrderDocument['cancelRefundRequest']>;
}

interface ReturnRequestMailSnapshot {
  status: ReturnRequestStatus;
  refundMethod: RefundMethod;
  refundAmount: number;
  reason?: string;
  note?: string;
  refundEvidenceImages?: string[];
  items: Array<{
    productName: string;
    variantSku: string;
    quantity: number;
    price: number;
    total: number;
  }>;
  createdAt?: Date;
  updatedAt?: Date;
}

interface SendReturnRequestLifecycleMailInput {
  to: string;
  customerName?: string;
  order: OrderMailSnapshot;
  request: ReturnRequestMailSnapshot;
  event: 'created' | 'status_updated';
  previousStatus?: ReturnRequestStatus;
  orderMarkedReturned?: boolean;
}

const sendReturnRequestLifecycleMail = async ({
  to,
  customerName,
  order,
  request,
  event,
  previousStatus,
  orderMarkedReturned
}: SendReturnRequestLifecycleMailInput) => {
  try {
    const itemsRowsHtml = request.items
      .map((item, index) => {
        return `
          <tr>
            <td style="padding:8px;border:1px solid #e5e7eb;text-align:center;">${index + 1}</td>
            <td style="padding:8px;border:1px solid #e5e7eb;">${escapeHtml(item.productName)}</td>
            <td style="padding:8px;border:1px solid #e5e7eb;">${escapeHtml(item.variantSku)}</td>
            <td style="padding:8px;border:1px solid #e5e7eb;text-align:right;">${item.quantity}</td>
            <td style="padding:8px;border:1px solid #e5e7eb;text-align:right;">${formatMoneyVnd(item.price)}</td>
            <td style="padding:8px;border:1px solid #e5e7eb;text-align:right;">${formatMoneyVnd(item.total)}</td>
          </tr>
        `;
      })
      .join('');

    const evidenceLinksHtml = request.refundEvidenceImages?.length
      ? `
      <div style="margin:16px 0;">
        <p style="margin:0 0 8px;color:#111827;font-weight:700;">Ảnh minh chứng hoàn tiền</p>
        <div style="display:flex;flex-wrap:wrap;gap:8px;">
          ${request.refundEvidenceImages
            .map(
              (url) => `
                <a href="${escapeHtml(url)}" target="_blank" rel="noreferrer" style="display:inline-block;">
                  <img src="${escapeHtml(url)}" alt="Minh chứng hoàn tiền" style="width:120px;height:120px;object-fit:cover;border:1px solid #e5e7eb;border-radius:8px;" />
                </a>
              `
            )
            .join('')}
        </div>
      </div>
    `
      : '';

    const evidenceLinksText = request.refundEvidenceImages?.length
      ? `\nẢnh minh chứng hoàn tiền:\n${request.refundEvidenceImages.join('\n')}\n`
      : '';

    const introHtml =
      event === 'created'
        ? `<p style="margin:0 0 12px;color:#374151;">Chúng tôi đã nhận yêu cầu hoàn hàng cho đơn <strong>${escapeHtml(order.orderCode)}</strong>.</p>`
        : `
      <p style="margin:0 0 12px;color:#374151;">
        Yêu cầu hoàn hàng của bạn đã được cập nhật từ
        <strong>${RETURN_REQUEST_STATUS_LABELS[previousStatus ?? request.status]}</strong>
        sang
        <strong>${RETURN_REQUEST_STATUS_LABELS[request.status]}</strong>.
      </p>
    `;

    const orderReturnedHtml = orderMarkedReturned
      ? `
      <p style="margin:0 0 12px;color:#374151;">
        Đơn hàng đã được chuyển sang trạng thái <strong>${ORDER_STATUS_LABELS.returned}</strong>.
      </p>
    `
      : '';

    const subject =
      event === 'created'
        ? `[Golden Billiards] Đã nhận yêu cầu hoàn hàng ${order.orderCode}`
        : `[Golden Billiards] Cập nhật yêu cầu hoàn hàng ${order.orderCode}`;

    const textItems = request.items
      .map((item, index) => {
        return `${index + 1}. ${item.productName} | SKU: ${item.variantSku} | SL: ${item.quantity} | Đơn giá: ${formatMoneyVnd(item.price)} | Thành tiền: ${formatMoneyVnd(item.total)}`;
      })
      .join('\n');

    const text =
      `Xin chào ${customerName ?? order.shippingRecipientName ?? 'bạn'},\n\n` +
      `${
        event === 'created'
          ? `Chúng tôi đã nhận yêu cầu hoàn hàng cho đơn ${order.orderCode}.`
          : `Yêu cầu hoàn hàng của bạn đã được cập nhật từ ${RETURN_REQUEST_STATUS_LABELS[previousStatus ?? request.status]} sang ${RETURN_REQUEST_STATUS_LABELS[request.status]}.`
      }\n` +
      `${orderMarkedReturned ? `Đơn hàng đã được chuyển sang trạng thái ${ORDER_STATUS_LABELS.returned}.\n` : ''}` +
      `\nMã đơn: ${order.orderCode}\n` +
      `Trạng thái yêu cầu: ${RETURN_REQUEST_STATUS_LABELS[request.status]}\n` +
      `Phương thức hoàn tiền: ${REFUND_METHOD_LABELS[request.refundMethod]}\n` +
      `Số tiền hoàn dự kiến: ${formatMoneyVnd(request.refundAmount)}\n` +
      `${request.reason ? `Lý do hoàn hàng: ${request.reason}\n` : ''}` +
      `${request.note ? `Ghi chú xử lý: ${request.note}\n` : ''}` +
      `Ngày tạo yêu cầu: ${formatDateTime(request.createdAt)}\n` +
      `Cập nhật gần nhất: ${formatDateTime(request.updatedAt)}\n` +
      `\nSản phẩm hoàn hàng:\n${textItems}\n` +
      `${evidenceLinksText}` +
      `\nCảm ơn bạn đã mua sắm tại Golden Billiards.`;

    const html = `
<!DOCTYPE html>
<html lang="vi">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:24px 0;background:#f3f4f6;">
    <tr>
      <td align="center">
        <table width="720" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;">
          <tr>
            <td style="background:#111827;padding:20px 24px;">
              <h1 style="margin:0;color:#ffffff;font-size:20px;">Golden Billiards</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:24px;">
              <p style="margin:0 0 12px;color:#111827;">Xin chào <strong>${escapeHtml(
                customerName ?? order.shippingRecipientName ?? 'bạn'
              )}</strong>,</p>
              ${introHtml}
              ${orderReturnedHtml}

              <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:16px;">
                <tr><td style="padding:6px 0;color:#6b7280;width:180px;">Mã đơn</td><td style="padding:6px 0;color:#111827;">${escapeHtml(order.orderCode)}</td></tr>
                <tr><td style="padding:6px 0;color:#6b7280;">Trạng thái yêu cầu</td><td style="padding:6px 0;color:#111827;">${RETURN_REQUEST_STATUS_LABELS[request.status]}</td></tr>
                <tr><td style="padding:6px 0;color:#6b7280;">Phương thức hoàn tiền</td><td style="padding:6px 0;color:#111827;">${REFUND_METHOD_LABELS[request.refundMethod]}</td></tr>
                <tr><td style="padding:6px 0;color:#6b7280;">Số tiền hoàn dự kiến</td><td style="padding:6px 0;color:#111827;">${formatMoneyVnd(request.refundAmount)}</td></tr>
                <tr><td style="padding:6px 0;color:#6b7280;">Ngày tạo yêu cầu</td><td style="padding:6px 0;color:#111827;">${formatDateTime(request.createdAt)}</td></tr>
                <tr><td style="padding:6px 0;color:#6b7280;">Cập nhật gần nhất</td><td style="padding:6px 0;color:#111827;">${formatDateTime(request.updatedAt)}</td></tr>
                ${
                  request.reason
                    ? `<tr><td style="padding:6px 0;color:#6b7280;">Lý do hoàn hàng</td><td style="padding:6px 0;color:#111827;">${escapeHtml(request.reason)}</td></tr>`
                    : ''
                }
                ${
                  request.note
                    ? `<tr><td style="padding:6px 0;color:#6b7280;">Ghi chú xử lý</td><td style="padding:6px 0;color:#111827;">${escapeHtml(request.note)}</td></tr>`
                    : ''
                }
              </table>

              <h3 style="margin:16px 0 8px;color:#111827;">Sản phẩm hoàn hàng</h3>
              <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:16px;">
                <thead>
                  <tr style="background:#f9fafb;">
                    <th style="padding:8px;border:1px solid #e5e7eb;">#</th>
                    <th style="padding:8px;border:1px solid #e5e7eb;">Sản phẩm</th>
                    <th style="padding:8px;border:1px solid #e5e7eb;">SKU</th>
                    <th style="padding:8px;border:1px solid #e5e7eb;">SL</th>
                    <th style="padding:8px;border:1px solid #e5e7eb;">Đơn giá</th>
                    <th style="padding:8px;border:1px solid #e5e7eb;">Thành tiền</th>
                  </tr>
                </thead>
                <tbody>${itemsRowsHtml}</tbody>
              </table>

              ${evidenceLinksHtml}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    const sent = await sendMail({
      to,
      subject,
      html,
      text
    });

    if (!sent) {
      logger.warn(`Không thể gửi email hoàn hàng đơn ${order.orderCode} tới ${to}`);
      return false;
    }

    return true;
  } catch (error) {
    logger.error(`Lỗi gửi email hoàn hàng: ${(error as Error).message}`);
    return false;
  }
};

const sendCancelRefundProcessedMail = async ({
  to,
  customerName,
  order,
  refundRequest
}: SendCancelRefundProcessedMailInput) => {
  try {
    const billLinksHtml = refundRequest.refundEvidenceImages?.length
      ? `
      <div style="margin:16px 0;">
        <p style="margin:0 0 8px;color:#111827;font-weight:700;">Ảnh bill chuyển khoản</p>
        <div style="display:flex;flex-wrap:wrap;gap:8px;">
          ${refundRequest.refundEvidenceImages
            .map(
              (url) => `
                <a href="${escapeHtml(url)}" target="_blank" rel="noreferrer" style="display:inline-block;">
                  <img src="${escapeHtml(url)}" alt="Bill hoàn tiền" style="width:120px;height:120px;object-fit:cover;border:1px solid #e5e7eb;border-radius:8px;" />
                </a>
              `
            )
            .join('')}
        </div>
      </div>
    `
      : '';

    const billLinksText = refundRequest.refundEvidenceImages?.length
      ? `\nẢnh bill chuyển khoản:\n${refundRequest.refundEvidenceImages.join('\n')}\n`
      : '';

    const subject = `[Golden Billiards] Đã hoàn tiền đơn hàng ${order.orderCode}`;
    const text =
      `Xin chào ${customerName ?? order.shippingRecipientName ?? 'bạn'},\n\n` +
      `Yêu cầu hoàn tiền cho đơn hàng ${order.orderCode} đã được xử lý thành công.\n` +
      `Số tiền hoàn: ${formatMoneyVnd(refundRequest.refundAmount)}\n` +
      `Ngân hàng nhận: ${refundRequest.bankName}\n` +
      `Số tài khoản: ${refundRequest.accountNumber}\n` +
      `Chủ tài khoản: ${refundRequest.accountHolder}\n` +
      `${refundRequest.adminNote ? `Ghi chú từ cửa hàng: ${refundRequest.adminNote}\n` : ''}` +
      `Thời gian hoàn: ${formatDateTime(refundRequest.processedAt ?? new Date())}\n` +
      `${billLinksText}` +
      `\nCảm ơn bạn đã mua sắm tại Golden Billiards.`;

    const html = `
<!DOCTYPE html>
<html lang="vi">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:24px 0;background:#f3f4f6;">
    <tr>
      <td align="center">
        <table width="720" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;">
          <tr>
            <td style="background:#111827;padding:20px 24px;">
              <h1 style="margin:0;color:#ffffff;font-size:20px;">Golden Billiards</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:24px;">
              <p style="margin:0 0 12px;color:#111827;">Xin chào <strong>${escapeHtml(
                customerName ?? order.shippingRecipientName ?? 'bạn'
              )}</strong>,</p>
              <p style="margin:0 0 12px;color:#374151;">
                Cửa hàng đã hoàn tiền thành công cho đơn hàng <strong>${escapeHtml(order.orderCode)}</strong>.
              </p>

              <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:16px;">
                <tr><td style="padding:6px 0;color:#6b7280;width:180px;">Số tiền hoàn</td><td style="padding:6px 0;color:#111827;">${formatMoneyVnd(refundRequest.refundAmount)}</td></tr>
                <tr><td style="padding:6px 0;color:#6b7280;">Ngân hàng</td><td style="padding:6px 0;color:#111827;">${escapeHtml(refundRequest.bankName)}</td></tr>
                <tr><td style="padding:6px 0;color:#6b7280;">Số tài khoản</td><td style="padding:6px 0;color:#111827;">${escapeHtml(refundRequest.accountNumber)}</td></tr>
                <tr><td style="padding:6px 0;color:#6b7280;">Chủ tài khoản</td><td style="padding:6px 0;color:#111827;">${escapeHtml(refundRequest.accountHolder)}</td></tr>
                <tr><td style="padding:6px 0;color:#6b7280;">Thời gian hoàn</td><td style="padding:6px 0;color:#111827;">${formatDateTime(refundRequest.processedAt ?? new Date())}</td></tr>
                ${
                  refundRequest.adminNote
                    ? `<tr><td style="padding:6px 0;color:#6b7280;">Ghi chú</td><td style="padding:6px 0;color:#111827;">${escapeHtml(refundRequest.adminNote)}</td></tr>`
                    : ''
                }
              </table>

              ${billLinksHtml}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    const sent = await sendMail({
      to,
      subject,
      html,
      text
    });

    if (!sent) {
      logger.warn(`Không thể gửi email hoàn tiền đơn hàng ${order.orderCode} tới ${to}`);
      return false;
    }

    return true;
  } catch (error) {
    logger.error(`Lỗi gửi email hoàn tiền: ${(error as Error).message}`);
    return false;
  }
};

const sendOrderLifecycleMailInBackground = (input: SendOrderLifecycleMailInput) => {
  void sendOrderLifecycleMail(input);
};

const sendReturnRequestLifecycleMailInBackground = (input: SendReturnRequestLifecycleMailInput) => {
  void sendReturnRequestLifecycleMail(input);
};

const sendCancelRefundProcessedMailInBackground = (input: SendCancelRefundProcessedMailInput) => {
  void sendCancelRefundProcessedMail(input);
};

// worklog: 2026-03-04 09:35:15 | dung | refactor | toDateKey
const toDateKey = (value: Date) => {
  return value.toISOString().slice(0, 10);
};

// worklog: 2026-03-04 21:22:04 | vanduc | fix | buildDateRange
const buildDateRange = (days: number) => {
  const today = new Date();
  const toDate = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999);
  const fromDate = new Date(toDate);
  fromDate.setDate(fromDate.getDate() - (days - 1));
  fromDate.setHours(0, 0, 0, 0);

  return { fromDate, toDate };
};

const AUTO_COMPLETE_DAYS = 3;

const autoCompleteDeliveredOrders = async (userId?: string) => {
  const threshold = new Date();
  threshold.setDate(threshold.getDate() - AUTO_COMPLETE_DAYS);

  const filter: Record<string, unknown> = {
    status: 'delivered',
    $or: [
      { deliveredAt: { $lte: threshold } },
      { deliveredAt: { $exists: false }, updatedAt: { $lte: threshold } }
    ]
  };

  if (userId) {
    filter.userId = toObjectId(userId, 'userId');
  }

  const orders = await OrderModel.find(filter);

  if (orders.length === 0) {
    return;
  }

  const now = new Date();

  for (const order of orders) {
    order.status = 'completed';
    if (!order.completedAt) {
      order.completedAt = now;
    }

    order.statusHistory.push({
      status: 'completed',
      changedBy: order.userId,
      note: `Tự động hoàn thành sau ${AUTO_COMPLETE_DAYS} ngày`,
      changedAt: now
    });

    await order.save();
  }
};

const generateOrderCode = () => {
  const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const randomPart = crypto.randomInt(100000, 999999);
  return `ORD-${datePart}-${randomPart}`;
};

// worklog: 2026-03-04 09:25:21 | vanduc | refactor | buildVnpayTxnRef
const buildVnpayTxnRef = (orderCode: string) => {
  const compactOrderCode = orderCode
    .replace(/[^A-Z0-9]/gi, '')
    .toUpperCase()
    .slice(-12);
  const timePart = Date.now().toString().slice(-8);
  const randomPart = crypto.randomInt(1000, 9999);

  return `${compactOrderCode}${timePart}${randomPart}`;
};

const generateUniqueVnpayTxnRef = async (orderCode: string) => {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const candidate = buildVnpayTxnRef(orderCode);
    const existed = await OrderModel.exists({ paymentTxnRef: candidate });

    if (!existed) {
      return candidate;
    }
  }

  throw new ApiError(StatusCodes.INTERNAL_SERVER_ERROR, 'Không thể tạo mã giao dịch VNPay');
};

const getZalopayDatePrefix = () => {
  const timezoneOffsetMs = 7 * 60 * 60 * 1000;
  const local = new Date(Date.now() + timezoneOffsetMs);
  const year = String(local.getUTCFullYear()).slice(2);
  const month = String(local.getUTCMonth() + 1).padStart(2, '0');
  const day = String(local.getUTCDate()).padStart(2, '0');

  return `${year}${month}${day}`;
};

const buildZalopayAppTransId = (orderCode: string) => {
  const datePart = getZalopayDatePrefix();
  const compactOrderCode = orderCode
    .replace(/[^A-Z0-9]/gi, '')
    .toUpperCase()
    .slice(-12);
  const randomPart = crypto.randomInt(1000, 9999);
  return `${datePart}_${compactOrderCode}${randomPart}`;
};

const generateUniqueZalopayTxnRef = async (orderCode: string) => {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const candidate = buildZalopayAppTransId(orderCode);
    const existed = await OrderModel.exists({ paymentTxnRef: candidate });

    if (!existed) {
      return candidate;
    }
  }

  throw new ApiError(StatusCodes.INTERNAL_SERVER_ERROR, 'Không thể tạo mã giao dịch ZaloPay');
};

const resolveZalopayRedirectUrl = () => {
  return env.ZALOPAY_REDIRECT_URL?.trim() || `${env.FRONTEND_URL}/success`;
};

const resolveZalopayChannel = (channel?: ZalopayChannel): ZalopayChannel => {
  if (channel === 'wallet' || channel === 'bank_card' || channel === 'atm') {
    return channel;
  }

  return 'gateway';
};

const buildZalopayCheckoutConfig = (
  channel?: ZalopayChannel,
  embedData?: Record<string, unknown>
) => {
  const normalizedChannel = resolveZalopayChannel(channel);

  return {
    channel: normalizedChannel,
    bankCode: '',
    embedData: {
      ...(embedData ?? {}),
      ...(normalizedChannel === 'gateway'
        ? {}
        : {
            preferred_payment_method:
              normalizedChannel === 'wallet'
                ? ['zalopay_wallet']
                : normalizedChannel === 'bank_card'
                  ? ['international_card']
                  : ['domestic_card', 'account']
          })
    }
  };
};

// worklog: 2026-03-04 19:46:44 | dung | fix | resolveShippingInfo
const resolveShippingInfo = async (userId: string, input: CreateOrderInput) => {
  if (input.addressId) {
    const address = await AddressModel.findOne({
      _id: toObjectId(input.addressId, 'addressId'),
      userId: toObjectId(userId, 'userId')
    }).lean();

    if (!address) {
      throw new ApiError(StatusCodes.NOT_FOUND, 'Address not found');
    }

    return {
      shippingRecipientName: address.recipientName,
      shippingPhone: address.phone,
      shippingAddress: `${address.street}, ${address.ward}, ${address.district}, ${address.city}`
    };
  }

  if (!input.shippingRecipientName || !input.shippingPhone || !input.shippingAddress) {
    throw new ApiError(
      StatusCodes.UNPROCESSABLE_ENTITY,
      'shippingRecipientName, shippingPhone, shippingAddress are required when addressId is missing'
    );
  }

  return {
    shippingRecipientName: input.shippingRecipientName,
    shippingPhone: input.shippingPhone,
    shippingAddress: input.shippingAddress
  };
};

export const createOrderFromCart = async (userId: string, input: CreateOrderInput) => {
  const userObjectId = toObjectId(userId, 'userId');
  const cart = await CartModel.findOne({ userId: userObjectId });

  if (!cart || cart.items.length === 0) {
    throw new ApiError(StatusCodes.UNPROCESSABLE_ENTITY, 'Cart is empty');
  }

  const selectedVariantIdSet = new Set(
    (input.selectedVariantIds ?? []).map((variantId) => String(toObjectId(variantId, 'variantId')))
  );

  const checkedOutCartItems =
    selectedVariantIdSet.size > 0
      ? cart.items.filter((item) => selectedVariantIdSet.has(String(item.variantId)))
      : cart.items;

  if (checkedOutCartItems.length === 0) {
    throw new ApiError(StatusCodes.UNPROCESSABLE_ENTITY, 'No selected cart items to checkout');
  }

  const shippingInfo = await resolveShippingInfo(userId, input);
  const variantIds = checkedOutCartItems.map((item) => item.variantId);

  const variants = await ProductVariantModel.find({
    _id: {
      $in: variantIds
    }
  }).populate('colorId', 'name');

  const variantMap = new Map(variants.map((variant) => [String(variant._id), variant]));
  const productIds = variants.map((variant) => variant.productId);
  const products = await ProductModel.find({
    _id: {
      $in: productIds
    }
  }).lean();
  const productMap = new Map(products.map((product) => [String(product._id), product]));

  const materializedItems = checkedOutCartItems.map((item) => {
    const variant = variantMap.get(String(item.variantId));

    if (!variant) {
      throw new ApiError(StatusCodes.NOT_FOUND, 'Variant in cart not found');
    }

    const product = productMap.get(String(variant.productId));

    if (!product) {
      throw new ApiError(StatusCodes.NOT_FOUND, 'Product in cart not found');
    }

    if (!variant.isAvailable || variant.stockQuantity < item.quantity) {
      const variantColor =
        typeof (variant.colorId as unknown as { name?: string })?.name === 'string'
          ? (variant.colorId as unknown as { name: string }).name
          : 'Unknown';

      throw new ApiError(
        StatusCodes.UNPROCESSABLE_ENTITY,
        `Variant ${variantColor} is out of stock`
      );
    }

    const total = roundMoney(variant.price * item.quantity);
    const variantColor =
      typeof (variant.colorId as unknown as { name?: string })?.name === 'string'
        ? (variant.colorId as unknown as { name: string }).name
        : 'Unknown';

    return {
      variant,
      product,
      snapshot: {
        productId: product._id,
        productName: product.name,
        variantId: variant._id,
        variantSku: variant.sku,
        variantColor,
        productImage: variant.images[0] ?? product.images?.[0],
        quantity: item.quantity,
        price: variant.price,
        total
      }
    };
  });

  const subtotal = roundMoney(
    materializedItems.reduce((sum, item) => addMoney(sum, item.snapshot.total), 0)
  );
  const { voucher, discountAmount } = await applyVoucherForSubtotal(
    input.voucherCode,
    subtotal,
    userId
  );
  const shippingFee = input.shippingFee ?? 0;
  const totalAmount = subtractMoney(addMoney(subtotal, shippingFee), discountAmount);
  const paymentMethod = input.paymentMethod ?? 'cod';
  const zalopayChannel =
    paymentMethod === 'zalopay' ? resolveZalopayChannel(input.zalopayChannel) : undefined;
  const initialStatus: OrderStatus = isOnlinePaymentMethod(paymentMethod)
    ? 'awaiting_payment'
    : 'pending';

  for (const item of materializedItems) {
    item.variant.stockQuantity = Math.max(0, item.variant.stockQuantity - item.snapshot.quantity);

    if (item.variant.stockQuantity === 0) {
      item.variant.isAvailable = false;
    }

    await item.variant.save();
  }

  if (voucher) {
    await VoucherModel.updateOne(
      {
        _id: voucher._id
      },
      {
        $inc: {
          usedCount: 1
        }
      }
    );
  }

  const orderCode = generateOrderCode();
  const paymentTxnRef =
    paymentMethod === 'vnpay'
      ? await generateUniqueVnpayTxnRef(orderCode)
      : paymentMethod === 'zalopay'
        ? await generateUniqueZalopayTxnRef(orderCode)
        : undefined;

  const created = await OrderModel.create({
    orderCode,
    userId: userObjectId,
    ...shippingInfo,
    subtotal,
    shippingFee,
    discountAmount,
    totalAmount,
    paymentMethod,
    zalopayChannel,
    paymentStatus: 'pending',
    paymentTxnRef,
    voucherId: voucher?._id,
    status: initialStatus,
    items: materializedItems.map((item) => item.snapshot),
    statusHistory: [
      {
        status: initialStatus,
        changedBy: userObjectId,
        note: 'Order created',
        changedAt: new Date()
      }
    ]
  });

  if (selectedVariantIdSet.size === 0) {
    cart.items = [];
  } else {
    cart.items = cart.items.filter((item) => !selectedVariantIdSet.has(String(item.variantId)));
  }

  await cart.save();

  let paymentUrl: string | undefined;

  if (paymentMethod === 'vnpay') {
    paymentUrl = createVnpayPaymentUrl({
      txnRef: paymentTxnRef ?? '',
      amount: totalAmount,
      orderInfo: `Thanh toan don hang ${orderCode}`,
      ipAddr: input.clientIp
    });
  }

  if (paymentMethod === 'zalopay') {
    const items = materializedItems.map((item) => ({
      itemid: String(item.variant._id),
      itemname: item.product.name,
      itemprice: Math.round(item.variant.price),
      itemquantity: item.snapshot.quantity
    }));

    const zalopayConfig = buildZalopayCheckoutConfig(input.zalopayChannel, {
      orderId: String(created._id),
      orderCode
    });

    const zalopayResult = await createZalopayPaymentUrl({
      appTransId: paymentTxnRef ?? '',
      appUser: String(userObjectId),
      amount: totalAmount,
      description: `Thanh toan don hang ${orderCode}`,
      items,
      embedData: zalopayConfig.embedData,
      bankCode: zalopayConfig.bankCode,
      redirectUrl: resolveZalopayRedirectUrl()
    });

    paymentUrl = zalopayResult.orderUrl;
  }

  const customer = await UserModel.findById(userObjectId).select('email fullName').lean();

  if (customer?.email) {
    sendOrderLifecycleMailInBackground({
      to: customer.email,
      customerName: customer.fullName,
      order: created.toObject() as OrderMailSnapshot,
      event: 'created',
      paymentUrl
    });
  }

  emitStaffRealtimeNotification({
    id: String(created._id),
    type: 'order_created',
    title: 'Đơn hàng mới',
    body: `${customer?.fullName ?? created.shippingRecipientName} vừa tạo đơn ${created.orderCode} (${created.items.length} sản phẩm)`,
    createdAt: new Date().toISOString(),
    url: '/dashboard/orders',
    metadata: {
      orderId: String(created._id),
      orderCode: created.orderCode,
      userId: String(created.userId),
      itemCount: created.items.length,
      totalAmount: created.totalAmount
    }
  });

  const [enrichedCreated] = await attachVoucherSnapshots([
    {
      ...created.toObject(),
      paymentUrl
    } as Record<string, unknown>
  ]);

  return enrichedCreated;
};

const buildOrderSearchFilter = (search?: string) => {
  const normalizedSearch = search?.trim();

  if (!normalizedSearch) {
    return undefined;
  }

  const regex = new RegExp(normalizedSearch, 'i');

  return {
    $or: [{ orderCode: regex }, { shippingRecipientName: regex }, { shippingPhone: regex }]
  };
};

export const listMyOrders = async (
  userId: string,
  options: {
    page: number;
    limit: number;
    search?: string;
    status?: OrderStatus;
  }
) => {
  await autoCompleteDeliveredOrders(userId);
  const filters: Record<string, unknown> = {
    userId: toObjectId(userId, 'userId')
  };

  if (options.status) {
    filters.status = options.status;
  }

  const searchFilter = buildOrderSearchFilter(options.search);

  if (searchFilter) {
    Object.assign(filters, searchFilter);
  }

  const totalItems = await OrderModel.countDocuments(filters);
  const items = await OrderModel.find(filters)
    .sort({ createdAt: -1 })
    .skip((options.page - 1) * options.limit)
    .limit(options.limit)
    .lean();

  if (items.length === 0) {
    return toPaginatedData(items, totalItems, options.page, options.limit);
  }

  const orderIds = items.map((item) => item._id);
  const productIds = [
    ...new Set(items.flatMap((item) => item.items.map((orderItem) => orderItem.productId)))
  ];

  const reviews = await ReviewModel.find({
    userId: toObjectId(userId, 'userId'),
    orderId: { $in: orderIds },
    productId: { $in: productIds }
  })
    .select('orderId productId')
    .lean();

  const reviewedKeys = new Set(
    reviews.map((review) => `${String(review.orderId)}:${String(review.productId)}`)
  );

  const enrichedItems = items.map((item) => ({
    ...item,
    items: item.items.map((orderItem) => ({
      ...orderItem,
      isReviewed: reviewedKeys.has(`${String(item._id)}:${String(orderItem.productId)}`)
    }))
  }));

  const enrichedOrders = await attachVoucherSnapshots(
    enrichedItems as Array<Record<string, unknown>>
  );

  return toPaginatedData(enrichedOrders, totalItems, options.page, options.limit);
};

export const listAllOrders = async (options: {
  page: number;
  limit: number;
  search?: string;
  status?: OrderStatus;
  userId?: string;
}) => {
  await autoCompleteDeliveredOrders();
  const filters: Record<string, unknown> = {};

  if (options.status) {
    filters.status = options.status;
  }

  if (options.userId) {
    filters.userId = toObjectId(options.userId, 'userId');
  }

  const searchFilter = buildOrderSearchFilter(options.search);

  if (searchFilter) {
    Object.assign(filters, searchFilter);
  }

  const totalItems = await OrderModel.countDocuments(filters);
  const items = await OrderModel.find(filters)
    .sort({ createdAt: -1 })
    .skip((options.page - 1) * options.limit)
    .limit(options.limit)
    .lean();

  const userIds = [...new Set(items.map((item) => String(item.userId)))];
  const users = await UserModel.find({
    _id: { $in: userIds }
  })
    .select('email fullName role')
    .lean();
  const userMap = new Map(
    users.map((user) => [
      String(user._id),
      {
        id: String(user._id),
        email: user.email,
        fullName: user.fullName,
        role: user.role
      }
    ])
  );

  const enrichedItems = items.map((item) => ({
    ...item,
    user: userMap.get(String(item.userId))
  }));

  const enrichedOrders = await attachVoucherSnapshots(
    enrichedItems as Array<Record<string, unknown>>
  );

  return toPaginatedData(enrichedOrders, totalItems, options.page, options.limit);
};

export const getOrderStatistics = async (options: ListOrderStatisticsOptions) => {
  await autoCompleteDeliveredOrders();
  const normalizedDays = Math.min(Math.max(Math.trunc(options.days), 1), 90);
  const { fromDate, toDate } = buildDateRange(normalizedDays);

  const [
    orderSummaryAggregate,
    statusAggregate,
    paymentMethodAggregate,
    categoryAggregate,
    dailyAggregate,
    customersCount,
    staffCount,
    adminCount,
    activeUsers,
    inactiveUsers,
    totalProducts,
    availableProducts,
    outOfStockVariants,
    lowStockVariants,
    totalReviews,
    totalComments,
    totalItemsSoldAggregate,
    topProducts,
    bottomProducts,
    topVariantsAggregate,
    bottomVariantsAggregate
  ] = await Promise.all([
    OrderModel.aggregate<{
      _id: null;
      totalOrders: number;
      deliveredOrders: number;
      processingOrders: number;
      cancelledOrders: number;
      grossRevenue: number;
      deliveredRevenue: number;
    }>([
      {
        $group: {
          _id: null,
          totalOrders: { $sum: 1 },
          deliveredOrders: {
            $sum: {
              $cond: [{ $in: ['$status', ['delivered', 'completed']] }, 1, 0]
            }
          },
          processingOrders: {
            $sum: {
              $cond: [
                { $in: ['$status', ['awaiting_payment', 'pending', 'confirmed', 'shipping']] },
                1,
                0
              ]
            }
          },
          cancelledOrders: {
            $sum: {
              $cond: [{ $in: ['$status', ['cancelled', 'returned']] }, 1, 0]
            }
          },
          grossRevenue: { $sum: '$totalAmount' },
          deliveredRevenue: {
            $sum: {
              $cond: [{ $in: ['$status', ['delivered', 'completed']] }, '$totalAmount', 0]
            }
          }
        }
      }
    ]),
    OrderModel.aggregate<{
      _id: OrderStatus;
      count: number;
      revenue: number;
    }>([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          revenue: {
            $sum: {
              $cond: [{ $in: ['$status', ['delivered', 'completed']] }, '$totalAmount', 0]
            }
          }
        }
      }
    ]),
    OrderModel.aggregate<{
      _id: PaymentMethod;
      count: number;
      revenue: number;
    }>([
      {
        $group: {
          _id: '$paymentMethod',
          count: { $sum: 1 },
          revenue: {
            $sum: {
              $cond: [{ $in: ['$status', ['delivered', 'completed']] }, '$totalAmount', 0]
            }
          }
        }
      }
    ]),
    OrderModel.aggregate<CategoryBreakdownAggregateItem>([
      {
        $match: {
          createdAt: {
            $gte: fromDate,
            $lte: toDate
          }
        }
      },
      {
        $unwind: '$items'
      },
      {
        $lookup: {
          from: 'products',
          localField: 'items.productId',
          foreignField: '_id',
          as: 'product'
        }
      },
      {
        $unwind: {
          path: '$product',
          preserveNullAndEmptyArrays: true
        }
      },
      {
        $lookup: {
          from: 'categories',
          localField: 'product.categoryId',
          foreignField: '_id',
          as: 'category'
        }
      },
      {
        $unwind: {
          path: '$category',
          preserveNullAndEmptyArrays: true
        }
      },
      {
        $group: {
          _id: {
            categoryId: '$category._id',
            categoryName: {
              $ifNull: ['$category.name', 'Không xác định']
            }
          },
          orderIds: { $addToSet: '$_id' },
          deliveredOrderIds: {
            $addToSet: {
              $cond: [{ $in: ['$status', ['delivered', 'completed']] }, '$_id', null]
            }
          },
          items: { $sum: '$items.quantity' },
          revenue: {
            $sum: {
              $cond: [{ $in: ['$status', ['delivered', 'completed']] }, '$items.total', 0]
            }
          }
        }
      },
      {
        $project: {
          _id: 0,
          categoryId: '$_id.categoryId',
          categoryName: '$_id.categoryName',
          orders: { $size: '$orderIds' },
          deliveredOrders: {
            $size: {
              $setDifference: ['$deliveredOrderIds', [null]]
            }
          },
          items: 1,
          revenue: 1
        }
      },
      {
        $sort: {
          orders: -1,
          items: -1,
          categoryName: 1
        }
      },
      {
        $limit: 10
      }
    ]),
    OrderModel.aggregate<DailyRevenueItem & { _id: string }>([
      {
        $match: {
          createdAt: {
            $gte: fromDate,
            $lte: toDate
          }
        }
      },
      {
        $group: {
          _id: {
            $dateToString: {
              format: '%Y-%m-%d',
              date: '$createdAt'
            }
          },
          orders: { $sum: 1 },
          deliveredOrders: {
            $sum: {
              $cond: [{ $in: ['$status', ['delivered', 'completed']] }, 1, 0]
            }
          },
          revenue: {
            $sum: {
              $cond: [{ $in: ['$status', ['delivered', 'completed']] }, '$totalAmount', 0]
            }
          }
        }
      },
      {
        $sort: { _id: 1 }
      }
    ]),
    UserModel.countDocuments({ role: 'customer' }),
    UserModel.countDocuments({ role: 'staff' }),
    UserModel.countDocuments({ role: 'admin' }),
    UserModel.countDocuments({ isActive: { $ne: false } }),
    UserModel.countDocuments({ isActive: false }),
    ProductModel.countDocuments({}),
    ProductModel.countDocuments({ isAvailable: true }),
    ProductVariantModel.countDocuments({
      $or: [{ stockQuantity: { $lte: 0 } }, { isAvailable: false }]
    }),
    ProductVariantModel.countDocuments({
      stockQuantity: { $gt: 0, $lte: 5 },
      isAvailable: true
    }),
    ReviewModel.countDocuments({}),
    CommentModel.countDocuments({ targetModel: 'product', isHidden: { $ne: true } }),
    OrderModel.aggregate<{ _id: null; totalItemsSold: number }>([
      {
        $match: {
          status: { $in: ['delivered', 'completed'] }
        }
      },
      { $unwind: '$items' },
      {
        $group: {
          _id: null,
          totalItemsSold: {
            $sum: '$items.quantity'
          }
        }
      }
    ]),
    ProductModel.find({})
      .sort({ soldCount: -1, reviewCount: -1, createdAt: -1 })
      .limit(8)
      .select('name brand soldCount reviewCount averageRating isAvailable images')
      .lean(),
    ProductModel.find({})
      .sort({ soldCount: 1, reviewCount: 1, createdAt: -1 })
      .limit(8)
      .select('name brand soldCount reviewCount averageRating isAvailable images')
      .lean(),
    OrderModel.aggregate<VariantSalesAggregateItem>([
      {
        $match: {
          status: { $in: ['delivered', 'completed'] }
        }
      },
      {
        $unwind: '$items'
      },
      {
        $group: {
          _id: '$items.variantId',
          productId: { $first: '$items.productId' },
          productName: { $first: '$items.productName' },
          variantSku: { $first: '$items.variantSku' },
          variantColor: { $first: '$items.variantColor' },
          productImage: { $first: '$items.productImage' },
          soldCount: { $sum: '$items.quantity' },
          revenue: { $sum: '$items.total' }
        }
      },
      {
        $sort: {
          soldCount: -1,
          revenue: -1
        }
      },
      {
        $limit: 8
      }
    ]),
    OrderModel.aggregate<VariantSalesAggregateItem>([
      {
        $match: {
          status: { $in: ['delivered', 'completed'] }
        }
      },
      {
        $unwind: '$items'
      },
      {
        $group: {
          _id: '$items.variantId',
          productId: { $first: '$items.productId' },
          productName: { $first: '$items.productName' },
          variantSku: { $first: '$items.variantSku' },
          variantColor: { $first: '$items.variantColor' },
          productImage: { $first: '$items.productImage' },
          soldCount: { $sum: '$items.quantity' },
          revenue: { $sum: '$items.total' }
        }
      },
      {
        $match: {
          soldCount: { $gt: 0 }
        }
      },
      {
        $sort: {
          soldCount: 1,
          revenue: 1
        }
      },
      {
        $limit: 8
      }
    ])
  ]);

  const summaryData = orderSummaryAggregate[0] ?? {
    totalOrders: 0,
    deliveredOrders: 0,
    processingOrders: 0,
    cancelledOrders: 0,
    grossRevenue: 0,
    deliveredRevenue: 0
  };

  const totalItemsSold = totalItemsSoldAggregate[0]?.totalItemsSold ?? 0;
  const averageDeliveredOrderValue =
    summaryData.deliveredOrders > 0
      ? roundMoney(summaryData.deliveredRevenue / summaryData.deliveredOrders)
      : 0;

  const statusMap = new Map(
    statusAggregate.map((item) => [
      item._id,
      { count: item.count, revenue: roundMoney(item.revenue) }
    ])
  );
  const byStatus = ORDER_STATUS_ORDER.map((status) => {
    const value = statusMap.get(status);
    return {
      status,
      count: value?.count ?? 0,
      revenue: value?.revenue ?? 0
    };
  });

  const paymentMethodMap = new Map(
    paymentMethodAggregate.map((item) => [
      item._id,
      { count: item.count, revenue: roundMoney(item.revenue) }
    ])
  );
  const byPaymentMethod = PAYMENT_METHOD_ORDER.map((paymentMethod) => {
    const value = paymentMethodMap.get(paymentMethod);
    return {
      paymentMethod,
      count: value?.count ?? 0,
      revenue: value?.revenue ?? 0
    };
  });

  const byCategory = categoryAggregate.map((item) => ({
    categoryId: item.categoryId ? String(item.categoryId) : null,
    categoryName: item.categoryName,
    orders: item.orders,
    deliveredOrders: item.deliveredOrders,
    items: item.items,
    revenue: roundMoney(item.revenue)
  }));

  const dailyAggregateMap = new Map(
    dailyAggregate.map((item) => [
      item._id,
      {
        date: item._id,
        revenue: roundMoney(item.revenue),
        orders: item.orders,
        deliveredOrders: item.deliveredOrders
      }
    ])
  );

  const dailyRevenue: DailyRevenueItem[] = [];
  const cursorDate = new Date(fromDate);
  while (cursorDate <= toDate) {
    const key = toDateKey(cursorDate);
    const record = dailyAggregateMap.get(key);

    dailyRevenue.push({
      date: key,
      revenue: record?.revenue ?? 0,
      orders: record?.orders ?? 0,
      deliveredOrders: record?.deliveredOrders ?? 0
    });

    cursorDate.setDate(cursorDate.getDate() + 1);
  }

  const variantIds = Array.from(
    new Set(
      [...topVariantsAggregate, ...bottomVariantsAggregate]
        .map((item) => String(item._id ?? ''))
        .filter(Boolean)
    )
  );
  const variantDocs =
    variantIds.length > 0
      ? await ProductVariantModel.find({ _id: { $in: variantIds } })
          .select('sku size stockQuantity isAvailable images')
          .lean()
      : [];
  const variantMap = new Map(variantDocs.map((variant) => [String(variant._id), variant]));

  const mapVariantStats = (item: VariantSalesAggregateItem) => {
    const variant = variantMap.get(String(item._id));

    return {
      variantId: String(item._id),
      productId: item.productId ? String(item.productId) : '',
      productName: item.productName ?? 'N/A',
      variantSku: variant?.sku ?? item.variantSku ?? '',
      variantColor: item.variantColor ?? '',
      size: typeof variant?.size === 'string' ? variant.size : 'Standard',
      soldCount: item.soldCount ?? 0,
      revenue: roundMoney(item.revenue ?? 0),
      stockQuantity: variant?.stockQuantity ?? 0,
      isAvailable: variant?.isAvailable ?? false,
      thumbnailUrl: variant?.images?.[0] ?? item.productImage ?? null
    };
  };

  return {
    summary: {
      totalOrders: summaryData.totalOrders,
      deliveredOrders: summaryData.deliveredOrders,
      processingOrders: summaryData.processingOrders,
      cancelledOrders: summaryData.cancelledOrders,
      grossRevenue: roundMoney(summaryData.grossRevenue),
      deliveredRevenue: roundMoney(summaryData.deliveredRevenue),
      averageDeliveredOrderValue,
      totalItemsSold,
      totalUsers: customersCount + staffCount + adminCount,
      customersCount,
      staffCount,
      adminCount,
      activeUsers,
      inactiveUsers,
      totalProducts,
      availableProducts,
      outOfStockVariants,
      lowStockVariants,
      totalReviews,
      totalComments
    },
    trends: {
      days: normalizedDays,
      fromDate: fromDate.toISOString(),
      toDate: toDate.toISOString(),
      dailyRevenue
    },
    breakdowns: {
      byStatus,
      byPaymentMethod,
      byCategory
    },
    topProducts: topProducts.map((product) => ({
      productId: String(product._id),
      name: product.name,
      brand: product.brand,
      soldCount: product.soldCount,
      reviewCount: product.reviewCount,
      averageRating: product.averageRating,
      isAvailable: product.isAvailable,
      thumbnailUrl: product.images[0] ?? null
    })),
    bottomProducts: bottomProducts.map((product) => ({
      productId: String(product._id),
      name: product.name,
      brand: product.brand,
      soldCount: product.soldCount,
      reviewCount: product.reviewCount,
      averageRating: product.averageRating,
      isAvailable: product.isAvailable,
      thumbnailUrl: product.images[0] ?? null
    })),
    topVariants: topVariantsAggregate.map((item) => mapVariantStats(item)),
    bottomVariants: bottomVariantsAggregate.map((item) => mapVariantStats(item))
  };
};

// worklog: 2026-03-04 20:27:39 | dung | feature | getMyOrderById
export const getMyOrderById = async (userId: string, orderId: string) => {
  await autoCompleteDeliveredOrders(userId);
  const order = await OrderModel.findOne({
    _id: toObjectId(orderId, 'orderId'),
    userId: toObjectId(userId, 'userId')
  }).lean();

  if (!order) {
    throw new ApiError(StatusCodes.NOT_FOUND, 'Order not found');
  }

  const [enrichedOrder] = await attachVoucherSnapshots([order as unknown as Record<string, unknown>]);

  return enrichedOrder;
};

// worklog: 2026-03-04 13:56:52 | vanduc | feature | restoreStockForOrder
const restoreStockForOrder = async (order: OrderDocument) => {
  for (const item of order.items) {
    const variant = await ProductVariantModel.findById(item.variantId);

    if (!variant) {
      continue;
    }

    variant.stockQuantity += item.quantity;

    if (variant.stockQuantity > 0) {
      variant.isAvailable = true;
    }

    await variant.save();
  }
};

// worklog: 2026-03-04 14:49:15 | vanduc | cleanup | increaseSoldCount
const increaseSoldCount = async (order: OrderDocument, factor: 1 | -1) => {
  const increments = new Map<string, number>();

  for (const item of order.items) {
    const key = String(item.productId);
    increments.set(key, (increments.get(key) ?? 0) + item.quantity * factor);
  }

  for (const [productId, value] of increments.entries()) {
    await ProductModel.updateOne(
      {
        _id: toObjectId(productId, 'productId')
      },
      {
        $inc: {
          soldCount: value
        }
      }
    );
  }
};

const normalizeBankAccountInfo = (input: {
  bankCode?: string;
  bankName?: string;
  accountNumber?: string;
  accountHolder?: string;
}) => {
  const bankCode = input.bankCode?.trim().toUpperCase() ?? '';
  const bankName = input.bankName?.trim() ?? '';
  const accountNumber = input.accountNumber?.trim() ?? '';
  const accountHolder = input.accountHolder?.trim() ?? '';

  if (!bankCode || !bankName || !accountNumber || !accountHolder) {
    throw new ApiError(StatusCodes.UNPROCESSABLE_ENTITY, 'Bank account information is required');
  }

  return {
    bankCode,
    bankName,
    accountNumber,
    accountHolder
  };
};

const markOrderAsPendingAfterOnlinePayment = (
  order: OrderDocument,
  note = 'Thanh toán online thành công'
) => {
  if (order.status !== 'awaiting_payment') {
    return false;
  }

  order.status = 'pending';
  order.statusHistory.push({
    status: 'pending',
    changedBy: order.userId,
    note,
    changedAt: new Date()
  });

  return true;
};

export const updateOrderStatus = async ({
  orderId,
  status,
  changedBy,
  note
}: UpdateOrderStatusInput) => {
  const order = await OrderModel.findById(toObjectId(orderId, 'orderId'));

  if (!order) {
    throw new ApiError(StatusCodes.NOT_FOUND, 'Order not found');
  }

  const previousStatus = order.status;
  assertOrderTransitionAllowed(previousStatus, status);

  if (status === 'cancelled' || status === 'returned') {
    await restoreStockForOrder(order);
  }

  if (status === 'completed' && previousStatus !== 'completed') {
    await increaseSoldCount(order, 1);
  }

  if (previousStatus === 'completed' && status === 'returned') {
    await increaseSoldCount(order, -1);
  }

  order.status = status;

  if (status === 'delivered' && !order.deliveredAt) {
    order.deliveredAt = new Date();
  }

  if (status === 'completed' && !order.completedAt) {
    order.completedAt = new Date();
  }
  order.statusHistory.push({
    status,
    changedBy: toObjectId(changedBy, 'changedBy'),
    note,
    changedAt: new Date()
  });

  await order.save();

  const customer = await UserModel.findById(order.userId).select('email fullName').lean();

  if (customer?.email) {
    sendOrderLifecycleMailInBackground({
      to: customer.email,
      customerName: customer.fullName,
      order: order.toObject() as OrderMailSnapshot,
      event: 'status_updated',
      previousStatus,
      note
    });
  }

  return order.toObject();
};

export const cancelMyOrder = async (userId: string, orderId: string, note?: string) => {
  const order = await OrderModel.findOne({
    _id: toObjectId(orderId, 'orderId'),
    userId: toObjectId(userId, 'userId')
  });

  if (!order) {
    throw new ApiError(StatusCodes.NOT_FOUND, 'Order not found');
  }

  if (
    order.status !== 'awaiting_payment' &&
    order.status !== 'pending' &&
    order.status !== 'confirmed'
  ) {
    throw new ApiError(
      StatusCodes.UNPROCESSABLE_ENTITY,
      'Chỉ có thể hủy đơn khi đang chờ thanh toán, chờ xác nhận hoặc đã xác nhận'
    );
  }

  return updateOrderStatus({
    orderId,
    status: 'cancelled',
    changedBy: userId,
    note: note ?? 'Khách hàng hủy đơn'
  });
};

export const confirmOrderReceived = async (userId: string, orderId: string) => {
  const order = await OrderModel.findOne({
    _id: toObjectId(orderId, 'orderId'),
    userId: toObjectId(userId, 'userId')
  });

  if (!order) {
    throw new ApiError(StatusCodes.NOT_FOUND, 'Order not found');
  }

  if (order.status !== 'delivered') {
    throw new ApiError(
      StatusCodes.UNPROCESSABLE_ENTITY,
      'Chỉ có thể xác nhận nhận hàng khi đơn đang ở trạng thái đã giao'
    );
  }

  order.status = 'completed';
  if (!order.completedAt) {
    order.completedAt = new Date();
  }

  order.statusHistory.push({
    status: 'completed',
    changedBy: toObjectId(userId, 'userId'),
    note: 'Khách hàng xác nhận đã nhận hàng',
    changedAt: new Date()
  });

  await order.save();

  const customer = await UserModel.findById(order.userId).select('email fullName').lean();

  if (customer?.email) {
    sendOrderLifecycleMailInBackground({
      to: customer.email,
      customerName: customer.fullName,
      order: order.toObject() as OrderMailSnapshot,
      event: 'status_updated',
      previousStatus: 'delivered',
      note: 'Khách hàng xác nhận đã nhận hàng'
    });
  }

  return order.toObject();
};

export const createReturnRequest = async ({
  userId,
  orderId,
  items,
  reason,
  refundMethod
}: CreateReturnRequestInput) => {
  const order = await OrderModel.findOne({
    _id: toObjectId(orderId, 'orderId'),
    userId: toObjectId(userId, 'userId')
  });

  if (!order) {
    throw new ApiError(StatusCodes.NOT_FOUND, 'Order not found');
  }

  if (order.status !== 'completed') {
    throw new ApiError(StatusCodes.UNPROCESSABLE_ENTITY, 'Order is not eligible for return');
  }

  const normalizedItems = (items ?? [])
    .map((item) => ({
      variantId: item.variantId?.trim(),
      quantity: Math.max(0, Math.trunc(item.quantity))
    }))
    .filter((item) => item.variantId && item.quantity > 0);

  if (normalizedItems.length === 0) {
    throw new ApiError(StatusCodes.UNPROCESSABLE_ENTITY, 'Return items are required');
  }

  const orderItemMap = new Map(order.items.map((item) => [String(item.variantId), item]));
  const alreadyRequested = new Map<string, number>();

  for (const request of order.returnRequests ?? []) {
    if (request.status === 'rejected') {
      continue;
    }

    for (const item of request.items) {
      const key = String(item.variantId);
      alreadyRequested.set(key, (alreadyRequested.get(key) ?? 0) + item.quantity);
    }
  }

  const returnItems = normalizedItems.map((item) => {
    const orderItem = orderItemMap.get(item.variantId ?? '');

    if (!orderItem) {
      throw new ApiError(StatusCodes.UNPROCESSABLE_ENTITY, 'Variant does not belong to order');
    }

    const requestedQty = item.quantity;
    const allowedQty = orderItem.quantity - (alreadyRequested.get(item.variantId ?? '') ?? 0);

    if (requestedQty > allowedQty) {
      throw new ApiError(
        StatusCodes.UNPROCESSABLE_ENTITY,
        'Return quantity exceeds purchased quantity'
      );
    }

    const price = orderItem.price;
    const total = roundMoney(price * requestedQty);

    return {
      productId: orderItem.productId,
      productName: orderItem.productName,
      variantId: orderItem.variantId,
      variantSku: orderItem.variantSku,
      quantity: requestedQty,
      price,
      total
    };
  });

  const refundAmount = roundMoney(returnItems.reduce((sum, item) => sum + item.total, 0));

  order.returnRequests = order.returnRequests ?? [];
  order.returnRequests.push({
    requestedBy: toObjectId(userId, 'userId'),
    status: 'pending',
    refundMethod: refundMethod ?? 'bank_transfer',
    refundAmount,
    reason: reason?.trim(),
    items: returnItems
  } as never);

  await order.save();

  const createdRequest = order.returnRequests?.[order.returnRequests.length - 1];
  const customer = await UserModel.findById(order.userId).select('email fullName').lean();

  if (customer?.email && createdRequest) {
    sendReturnRequestLifecycleMailInBackground({
      to: customer.email,
      customerName: customer.fullName,
      order: order.toObject() as OrderMailSnapshot,
      request: toReturnRequestMailSnapshot(createdRequest),
      event: 'created'
    });
  }

  return order.toObject();
};

export const updateReturnRequest = async ({
  orderId,
  returnRequestId,
  status,
  refundMethod,
  note,
  refundEvidenceImages
}: UpdateReturnRequestInput) => {
  const order = await OrderModel.findById(toObjectId(orderId, 'orderId'));

  if (!order) {
    throw new ApiError(StatusCodes.NOT_FOUND, 'Order not found');
  }

  const request = order.returnRequests?.find((item) => String(item._id) === returnRequestId);

  if (!request) {
    throw new ApiError(StatusCodes.NOT_FOUND, 'Return request not found');
  }

  const previousRequestStatus = request.status;
  const nextRefundMethod = refundMethod ?? request.refundMethod;
  const incomingImages = (refundEvidenceImages ?? []).map((img) => img.trim()).filter(Boolean);
  const existingImages = request.refundEvidenceImages ?? [];
  const evidenceImages = incomingImages.length > 0 ? incomingImages : existingImages;

  if (status === 'refunded') {
    if (nextRefundMethod === 'bank_transfer' && evidenceImages.length === 0) {
      throw new ApiError(StatusCodes.UNPROCESSABLE_ENTITY, 'Refund evidence images are required');
    }
  }

  request.status = status;
  request.note = note?.trim();
  request.refundMethod = nextRefundMethod;
  if (incomingImages.length > 0 || status === 'refunded') {
    request.refundEvidenceImages = evidenceImages;
  }

  if (status === 'refunded' && order.paymentStatus === 'paid') {
    const refundedItems = new Map<string, number>();
    for (const req of order.returnRequests ?? []) {
      if (req.status !== 'refunded') {
        continue;
      }

      for (const item of req.items) {
        const key = String(item.variantId);
        refundedItems.set(key, (refundedItems.get(key) ?? 0) + item.quantity);
      }
    }

    const fullyReturned = order.items.every((item) => {
      const refundedQty = refundedItems.get(String(item.variantId)) ?? 0;
      return refundedQty >= item.quantity;
    });

    if (fullyReturned) {
      order.paymentStatus = 'refunded';
      order.refundedAt = new Date();
      order.status = 'returned';
      order.statusHistory.push({
        status: 'returned',
        changedBy: order.userId,
        note: 'Hoàn hàng đầy đủ',
        changedAt: new Date()
      });
    }
  }

  await order.save();

  const customer = await UserModel.findById(order.userId).select('email fullName').lean();

  if (customer?.email && previousRequestStatus !== status) {
    sendReturnRequestLifecycleMailInBackground({
      to: customer.email,
      customerName: customer.fullName,
      order: order.toObject() as OrderMailSnapshot,
      request: toReturnRequestMailSnapshot(request),
      event: 'status_updated',
      previousStatus: previousRequestStatus,
      orderMarkedReturned: order.status === 'returned'
    });
  }

  return order.toObject();
};

export const createCancelRefundRequest = async ({
  userId,
  orderId,
  bankCode,
  bankName,
  accountNumber,
  accountHolder,
  note
}: CreateCancelRefundRequestInput) => {
  const order = await OrderModel.findOne({
    _id: toObjectId(orderId, 'orderId'),
    userId: toObjectId(userId, 'userId')
  });

  if (!order) {
    throw new ApiError(StatusCodes.NOT_FOUND, 'Order not found');
  }

  if (
    order.status !== 'cancelled' ||
    order.paymentMethod === 'cod' ||
    order.paymentStatus !== 'paid'
  ) {
    throw new ApiError(
      StatusCodes.UNPROCESSABLE_ENTITY,
      'Cancelled order is not eligible for refund request'
    );
  }

  const normalizedBankInfo = normalizeBankAccountInfo({
    bankCode,
    bankName,
    accountNumber,
    accountHolder
  });

  const existingRequest = order.cancelRefundRequest;

  if (existingRequest && existingRequest.status !== 'rejected') {
    throw new ApiError(StatusCodes.UNPROCESSABLE_ENTITY, 'Cancel refund request already exists');
  }

  const now = new Date();
  order.cancelRefundRequest = {
    requestedBy: toObjectId(userId, 'userId'),
    status: 'pending',
    refundAmount: order.totalAmount,
    ...normalizedBankInfo,
    note: note?.trim(),
    adminNote: undefined,
    refundEvidenceImages: [],
    requestedAt: now,
    updatedAt: now,
    processedAt: undefined,
    processedBy: undefined
  };

  order.statusHistory.push({
    status: order.status,
    changedBy: toObjectId(userId, 'userId'),
    note: 'Khách hàng gửi yêu cầu hoàn tiền cho đơn đã hủy',
    changedAt: now
  });

  await order.save();

  return order.toObject();
};

export const updateCancelRefundRequest = async ({
  orderId,
  processedBy,
  status,
  adminNote,
  refundEvidenceImages
}: UpdateCancelRefundRequestInput) => {
  const order = await OrderModel.findById(toObjectId(orderId, 'orderId'));

  if (!order) {
    throw new ApiError(StatusCodes.NOT_FOUND, 'Order not found');
  }

  const request = order.cancelRefundRequest;

  if (!request) {
    throw new ApiError(StatusCodes.NOT_FOUND, 'Cancel refund request not found');
  }

  if (request.status === 'refunded' && status !== 'refunded') {
    throw new ApiError(StatusCodes.UNPROCESSABLE_ENTITY, 'Refund request already completed');
  }

  const nextImages = (refundEvidenceImages ?? []).map((item) => item.trim()).filter(Boolean);
  const evidenceImages = nextImages.length > 0 ? nextImages : (request.refundEvidenceImages ?? []);

  if (status === 'refunded' && evidenceImages.length === 0) {
    throw new ApiError(StatusCodes.UNPROCESSABLE_ENTITY, 'Refund evidence images are required');
  }

  request.status = status;
  request.adminNote = adminNote?.trim();
  request.updatedAt = new Date();

  if (nextImages.length > 0 || status === 'refunded') {
    request.refundEvidenceImages = evidenceImages;
  }

  if (status === 'refunded') {
    request.processedAt = new Date();
    request.processedBy = toObjectId(processedBy, 'processedBy');
    order.paymentStatus = 'refunded';
    order.refundedAt = request.processedAt;
  } else if (status === 'rejected') {
    request.processedAt = undefined;
    request.processedBy = undefined;
  }

  order.statusHistory.push({
    status: order.status,
    changedBy: toObjectId(processedBy, 'processedBy'),
    note:
      status === 'refunded'
        ? 'Nhân viên đã hoàn tiền cho đơn hủy'
        : status === 'rejected'
          ? 'Nhân viên từ chối yêu cầu hoàn tiền'
          : 'Nhân viên cập nhật yêu cầu hoàn tiền',
    changedAt: new Date()
  });

  await order.save();

  if (status === 'refunded') {
    const customer = await UserModel.findById(order.userId).select('email fullName').lean();

    if (customer?.email && order.cancelRefundRequest) {
      sendCancelRefundProcessedMailInBackground({
        to: customer.email,
        customerName: customer.fullName,
        order: order.toObject() as OrderMailSnapshot,
        refundRequest: order.cancelRefundRequest
      });
    }
  }

  return order.toObject();
};

export const retryMyVnpayPayment = async ({
  userId,
  orderId,
  clientIp
}: RetryVnpayPaymentInput) => {
  const order = await OrderModel.findOne({
    _id: toObjectId(orderId, 'orderId'),
    userId: toObjectId(userId, 'userId')
  });

  if (!order) {
    throw new ApiError(StatusCodes.NOT_FOUND, 'Order not found');
  }

  if (order.paymentMethod !== 'vnpay' && order.paymentMethod !== 'zalopay') {
    throw new ApiError(StatusCodes.UNPROCESSABLE_ENTITY, 'Đơn hàng không dùng thanh toán online');
  }

  if (order.status !== 'awaiting_payment') {
    throw new ApiError(
      StatusCodes.UNPROCESSABLE_ENTITY,
      'Chỉ có thể thanh toán lại khi đơn đang ở trạng thái chờ thanh toán'
    );
  }

  if (order.paymentStatus === 'paid') {
    throw new ApiError(StatusCodes.UNPROCESSABLE_ENTITY, 'Order already paid');
  }

  const nextTxnRef =
    order.paymentMethod === 'vnpay'
      ? await generateUniqueVnpayTxnRef(order.orderCode)
      : await generateUniqueZalopayTxnRef(order.orderCode);
  order.paymentTxnRef = nextTxnRef;
  order.paymentStatus = 'pending';
  order.paymentGatewayResponseCode = undefined;
  order.paymentTransactionNo = undefined;
  order.paidAt = undefined;
  await order.save();

  let paymentUrl: string | undefined;

  if (order.paymentMethod === 'vnpay') {
    paymentUrl = createVnpayPaymentUrl({
      txnRef: nextTxnRef,
      amount: order.totalAmount,
      orderInfo: `Thanh toan don hang ${order.orderCode}`,
      ipAddr: clientIp
    });
  }

  if (order.paymentMethod === 'zalopay') {
    const items = order.items.map((item) => ({
      itemid: String(item.variantId),
      itemname: item.productName,
      itemprice: Math.round(item.price),
      itemquantity: item.quantity
    }));

    const zalopayConfig = buildZalopayCheckoutConfig(order.zalopayChannel, {
      orderId: String(order._id),
      orderCode: order.orderCode
    });

    const zalopayResult = await createZalopayPaymentUrl({
      appTransId: nextTxnRef,
      appUser: String(order.userId),
      amount: order.totalAmount,
      description: `Thanh toan don hang ${order.orderCode}`,
      items,
      embedData: zalopayConfig.embedData,
      bankCode: zalopayConfig.bankCode,
      redirectUrl: resolveZalopayRedirectUrl()
    });

    paymentUrl = zalopayResult.orderUrl;
  }

  return {
    ...order.toObject(),
    paymentUrl
  };
};

export const handleVnpayReturn = async (payload: Record<string, unknown>) => {
  const verifiedResult = verifyVnpayReturnParams(payload);

  if (!verifiedResult.isVerified) {
    throw new ApiError(StatusCodes.UNPROCESSABLE_ENTITY, 'Invalid VNPay signature');
  }

  const order = await OrderModel.findOne({
    paymentTxnRef: verifiedResult.txnRef
  });

  if (!order) {
    throw new ApiError(StatusCodes.NOT_FOUND, 'Order not found by VNPay transaction');
  }

  if (order.paymentMethod !== 'vnpay') {
    throw new ApiError(StatusCodes.UNPROCESSABLE_ENTITY, 'Order payment method is not VNPay');
  }

  const wasPaid = order.paymentStatus === 'paid';
  order.paymentGatewayResponseCode = verifiedResult.responseCode;

  if (verifiedResult.isSuccess) {
    order.paymentStatus = 'paid';
    order.paymentTransactionNo = verifiedResult.transactionNo;
    markOrderAsPendingAfterOnlinePayment(order);

    if (!order.paidAt) {
      order.paidAt = new Date();
    }
  } else if (order.paymentStatus !== 'paid' && order.paymentStatus !== 'refunded') {
    order.paymentStatus = 'failed';
  }

  await order.save();

  if (verifiedResult.isSuccess && !wasPaid) {
    const customer = await UserModel.findById(order.userId).select('email fullName').lean();

    if (customer?.email) {
      sendOrderLifecycleMailInBackground({
        to: customer.email,
        customerName: customer.fullName,
        order: order.toObject() as OrderMailSnapshot,
        event: 'payment_success'
      });
    }
  }

  return {
    order: order.toObject(),
    isSuccess: verifiedResult.isSuccess,
    responseCode: verifiedResult.responseCode
  };
};

export const handleZalopayCallback = async (payload: Record<string, unknown>) => {
  const verifyResult = verifyZalopayCallback(payload as { data: string; mac: string });

  if (!verifyResult.isVerified || !verifyResult.data) {
    return {
      return_code: 0,
      return_message: 'Invalid ZaloPay signature'
    };
  }

  const appTransId = verifyResult.data.app_trans_id?.toString().trim();

  if (!appTransId) {
    return {
      return_code: 0,
      return_message: 'Missing app_trans_id'
    };
  }

  const order = await OrderModel.findOne({
    paymentTxnRef: appTransId.toUpperCase()
  });

  if (!order) {
    return {
      return_code: 0,
      return_message: 'Order not found'
    };
  }

  if (order.paymentMethod !== 'zalopay') {
    return {
      return_code: 0,
      return_message: 'Order payment method is not ZaloPay'
    };
  }

  const wasPaid = order.paymentStatus === 'paid';
  order.paymentGatewayResponseCode = '1';
  order.paymentStatus = 'paid';
  order.paymentTransactionNo = verifyResult.data.zp_trans_id
    ? String(verifyResult.data.zp_trans_id)
    : order.paymentTransactionNo;
  markOrderAsPendingAfterOnlinePayment(order);

  if (!order.paidAt) {
    order.paidAt = new Date();
  }

  await order.save();

  if (!wasPaid) {
    const customer = await UserModel.findById(order.userId).select('email fullName').lean();

    if (customer?.email) {
      sendOrderLifecycleMailInBackground({
        to: customer.email,
        customerName: customer.fullName,
        order: order.toObject() as OrderMailSnapshot,
        event: 'payment_success'
      });
    }
  }

  return {
    return_code: 1,
    return_message: 'success'
  };
};

export const handleZalopayRedirect = async (payload: Record<string, unknown>) => {
  const verifyResult = verifyZalopayRedirect(payload as unknown as ZalopayRedirectPayload);

  if (!verifyResult.isVerified) {
    throw new ApiError(StatusCodes.UNPROCESSABLE_ENTITY, 'Invalid ZaloPay checksum');
  }

  const order = await OrderModel.findOne({
    paymentTxnRef: verifyResult.appTransId.toUpperCase()
  });

  if (!order) {
    throw new ApiError(StatusCodes.NOT_FOUND, 'Order not found by ZaloPay transaction');
  }

  if (order.paymentMethod !== 'zalopay') {
    throw new ApiError(StatusCodes.UNPROCESSABLE_ENTITY, 'Order payment method is not ZaloPay');
  }

  let responseCode = String(verifyResult.status ?? 0);
  const wasPaid = order.paymentStatus === 'paid';

  if (verifyResult.status === 1 && order.paymentStatus !== 'paid') {
    try {
      const queryResult = await queryZalopayOrderStatus(verifyResult.appTransId);
      responseCode = String(queryResult.returnCode);

      if (queryResult.returnCode === 1) {
        order.paymentStatus = 'paid';
        order.paymentTransactionNo = queryResult.zpTransId ?? order.paymentTransactionNo;

        if (!order.paidAt) {
          order.paidAt = new Date();
        }
      } else if (queryResult.returnCode !== 2 && order.paymentStatus !== 'refunded') {
        order.paymentStatus = 'failed';
      }
    } catch (error) {
      logger.warn('ZaloPay query failed', error);

      order.paymentStatus = 'paid';

      if (!order.paidAt) {
        order.paidAt = new Date();
      }
    }
  } else if (
    verifyResult.status !== 1 &&
    order.paymentStatus !== 'paid' &&
    order.paymentStatus !== 'refunded'
  ) {
    order.paymentStatus = 'failed';
  }

  if (order.paymentStatus === 'paid') {
    markOrderAsPendingAfterOnlinePayment(order);
  }

  order.paymentGatewayResponseCode = responseCode;
  await order.save();
  const isPaidAfterRedirect = order.paymentStatus === 'paid';

  if (isPaidAfterRedirect && !wasPaid) {
    const customer = await UserModel.findById(order.userId).select('email fullName').lean();

    if (customer?.email) {
      sendOrderLifecycleMailInBackground({
        to: customer.email,
        customerName: customer.fullName,
        order: order.toObject() as OrderMailSnapshot,
        event: 'payment_success'
      });
    }
  }

  return {
    order: order.toObject(),
    isSuccess: isPaidAfterRedirect,
    responseCode
  };
};
