import crypto from 'node:crypto';

import { StatusCodes } from 'http-status-codes';

import { env } from '@config/env';
import { ApiError } from '@utils/api-error';

interface CreateVnpayPaymentUrlInput {
  txnRef: string;
  amount: number;
  orderInfo: string;
  ipAddr?: string;
  locale?: 'vn' | 'en';
  createDate?: Date;
}

interface VerifyVnpayReturnInput {
  [key: string]: unknown;
}

interface VerifyVnpayReturnResult {
  isVerified: boolean;
  isSuccess: boolean;
  txnRef: string;
  transactionNo?: string;
  responseCode: string;
  transactionStatus?: string;
  amount: number;
  bankCode?: string;
  payDate?: string;
}

const VNPAY_TIMEZONE_OFFSET_MS = 7 * 60 * 60 * 1000;
const VNPAY_PAYMENT_TIMEOUT_MINUTES = 15;

// worklog: 2026-03-04 19:32:10 | dung | feature | isVnpayConfigured
// worklog: 2026-03-04 09:35:15 | dung | refactor | isVnpayConfigured
const isVnpayConfigured = () => {
  return Boolean(env.VNP_URL && env.VNP_HASHSECRET && env.VNP_RETURNURL && env.VNP_TMNCODE);
};

const assertVnpayConfigured = () => {
  if (!isVnpayConfigured()) {
    throw new ApiError(StatusCodes.SERVICE_UNAVAILABLE, 'VNPay chưa được cấu hình');
  }
};

const toVnpDateTime = (input: Date) => {
  const date = new Date(input.getTime() + VNPAY_TIMEZONE_OFFSET_MS);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  const hour = String(date.getUTCHours()).padStart(2, '0');
  const minute = String(date.getUTCMinutes()).padStart(2, '0');
  const second = String(date.getUTCSeconds()).padStart(2, '0');

  return `${year}${month}${day}${hour}${minute}${second}`;
};

const encodeQueryValue = (value: string) => {
  return encodeURIComponent(value).replace(/%20/g, '+');
};

const buildSignData = (params: Record<string, string>) => {
  const keys = Object.keys(params).sort((left, right) => left.localeCompare(right));

  return keys
    .map((key) => {
      return `${encodeQueryValue(key)}=${encodeQueryValue(params[key])}`;
    })
    .join('&');
};

const signParams = (params: Record<string, string>) => {
  if (!env.VNP_HASHSECRET) {
    throw new ApiError(StatusCodes.SERVICE_UNAVAILABLE, 'VNPay hash secret chưa được cấu hình');
  }

  return crypto
    .createHmac('sha512', env.VNP_HASHSECRET)
    .update(buildSignData(params), 'utf8')
    .digest('hex');
};

// worklog: 2026-03-04 13:56:52 | vanduc | feature | normalizeIpAddress
const normalizeIpAddress = (rawIp?: string) => {
  if (!rawIp) {
    return '127.0.0.1';
  }

  if (rawIp.includes(',')) {
    return rawIp.split(',')[0].trim();
  }

  if (rawIp.startsWith('::ffff:')) {
    return rawIp.replace('::ffff:', '');
  }

  if (rawIp === '::1') {
    return '127.0.0.1';
  }

  return rawIp;
};

// worklog: 2026-03-04 13:34:35 | vanduc | feature | normalizeVnpParams
const normalizeVnpParams = (payload: VerifyVnpayReturnInput) => {
  const entries = Object.entries(payload);
  const normalizedParams: Record<string, string> = {};

  for (const [key, value] of entries) {
    if (!key.startsWith('vnp_')) {
      continue;
    }

    if (Array.isArray(value)) {
      const first = value.find((item) => typeof item === 'string');

      if (typeof first === 'string') {
        normalizedParams[key] = first;
      }

      continue;
    }

    if (value === null || value === undefined) {
      continue;
    }

    normalizedParams[key] = String(value);
  }

  return normalizedParams;
};

export const createVnpayPaymentUrl = ({
  txnRef,
  amount,
  orderInfo,
  ipAddr,
  locale = 'vn',
  createDate = new Date()
}: CreateVnpayPaymentUrlInput) => {
  assertVnpayConfigured();

  const vnpAmount = Math.round(Math.max(amount, 0) * 100);
  const expireDate = new Date(createDate.getTime() + VNPAY_PAYMENT_TIMEOUT_MINUTES * 60 * 1000);

  const params: Record<string, string> = {
    vnp_Version: '2.1.0',
    vnp_Command: 'pay',
    vnp_TmnCode: env.VNP_TMNCODE ?? '',
    vnp_Amount: String(vnpAmount),
    vnp_CreateDate: toVnpDateTime(createDate),
    vnp_CurrCode: 'VND',
    vnp_IpAddr: normalizeIpAddress(ipAddr),
    vnp_Locale: locale,
    vnp_OrderInfo: orderInfo,
    vnp_OrderType: 'other',
    vnp_ReturnUrl: env.VNP_RETURNURL ?? '',
    vnp_TxnRef: txnRef,
    vnp_ExpireDate: toVnpDateTime(expireDate)
  };

  const signature = signParams(params);
  const query = buildSignData({
    ...params,
    vnp_SecureHash: signature
  });

  return `${env.VNP_URL}?${query}`;
};

export const verifyVnpayReturnParams = (
  payload: VerifyVnpayReturnInput
): VerifyVnpayReturnResult => {
  assertVnpayConfigured();

  const params = normalizeVnpParams(payload);
  const secureHash = params.vnp_SecureHash;
  const txnRef = params.vnp_TxnRef;
  const responseCode = params.vnp_ResponseCode ?? '';
  const transactionStatus = params.vnp_TransactionStatus;

  if (!secureHash || !txnRef) {
    throw new ApiError(StatusCodes.UNPROCESSABLE_ENTITY, 'Thiếu dữ liệu callback VNPay');
  }

  const signSource = { ...params };
  delete signSource.vnp_SecureHash;
  delete signSource.vnp_SecureHashType;

  const generatedHash = signParams(signSource);
  const isVerified = generatedHash.toLowerCase() === secureHash.toLowerCase();
  const isSuccess = isVerified && responseCode === '00' && (!transactionStatus || transactionStatus === '00');

  return {
    isVerified,
    isSuccess,
    txnRef,
    transactionNo: params.vnp_TransactionNo,
    responseCode,
    transactionStatus,
    amount: Number(params.vnp_Amount ?? 0) / 100,
    bankCode: params.vnp_BankCode,
    payDate: params.vnp_PayDate
  };
};

