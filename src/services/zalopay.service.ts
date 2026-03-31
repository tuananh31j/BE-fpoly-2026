import crypto from 'node:crypto';

import { StatusCodes } from 'http-status-codes';

import { env } from '@config/env';
import { logger } from '@config/logger';
import { ApiError } from '@utils/api-error';

export interface ZalopayCreateOrderItem {
  itemid: string;
  itemname: string;
  itemprice: number;
  itemquantity: number;
}

export interface ZalopayCreateOrderInput {
  appTransId: string;
  appUser: string;
  amount: number;
  description: string;
  items: ZalopayCreateOrderItem[];
  embedData?: Record<string, unknown>;
  bankCode?: string;
  redirectUrl?: string;
}

export interface ZalopayCreateOrderResult {
  orderUrl: string;
  returnCode: number;
  returnMessage?: string;
  subReturnCode?: number;
  subReturnMessage?: string;
  zpTransToken?: string;
}

export interface ZalopayCallbackPayload {
  data: string;
  mac: string;
}

export interface ZalopayCallbackData {
  app_trans_id?: string;
  zp_trans_id?: string | number;
  amount?: number;
  status?: number;
}

export interface ZalopayRedirectPayload {
  appid: string | number;
  apptransid: string;
  pmcid?: string;
  bankcode?: string;
  amount?: string | number;
  discountamount?: string | number;
  status?: string | number;
  checksum: string;
}

export interface ZalopayRedirectVerifyResult {
  isVerified: boolean;
  appTransId: string;
  status: number;
}

export interface ZalopayQueryResult {
  returnCode: number;
  returnMessage?: string;
  subReturnCode?: number;
  subReturnMessage?: string;
  zpTransId?: string;
}

const ZALOPAY_V1_CREATE_ENDPOINT = 'https://sandbox.zalopay.com.vn/v001/tpe/createorder';
const ZALOPAY_V1_QUERY_ENDPOINT = 'https://sandbox.zalopay.com.vn/v001/tpe/getstatusbyapptransid';
const ZALOPAY_REQUEST_TIMEOUT_MS = 10000;

const signHmacSha256 = (key: string, data: string) => {
  return crypto.createHmac('sha256', key).update(data).digest('hex');
};

const isSameSignature = (left: string, right: string) => {
  const leftBuffer = Buffer.from(left, 'utf8');
  const rightBuffer = Buffer.from(right, 'utf8');

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
};

const isTimeoutLikeError = (error: unknown) => {
  return error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError');
};

const requireZalopayConfig = () => {
  if (!env.ZALOPAY_APP_ID || !env.ZALOPAY_KEY1 || !env.ZALOPAY_KEY2) {
    throw new ApiError(StatusCodes.SERVICE_UNAVAILABLE, 'ZaloPay chưa được cấu hình');
  }
};

const resolveZalopayCreateEndpoint = () => {
  const configured = env.ZALOPAY_CREATE_ENDPOINT?.trim();

  if (!configured) {
    return ZALOPAY_V1_CREATE_ENDPOINT;
  }

  if (configured.includes('openapi.zalopay.vn/v2/create')) {
    logger.warn(
      `[ZaloPay] endpoint ${configured} không tương thích với payload v1, tự chuyển sang ${ZALOPAY_V1_CREATE_ENDPOINT}`
    );
    return ZALOPAY_V1_CREATE_ENDPOINT;
  }

  return configured;
};

const resolveZalopayQueryEndpoint = () => {
  const configured = env.ZALOPAY_QUERY_ENDPOINT?.trim();

  if (!configured) {
    return ZALOPAY_V1_QUERY_ENDPOINT;
  }

  if (configured.includes('openapi.zalopay.vn/v2/query')) {
    logger.warn(
      `[ZaloPay] endpoint ${configured} không tương thích với payload v1, tự chuyển sang ${ZALOPAY_V1_QUERY_ENDPOINT}`
    );
    return ZALOPAY_V1_QUERY_ENDPOINT;
  }

  return configured;
};

export const createZalopayPaymentUrl = async (
  input: ZalopayCreateOrderInput
): Promise<ZalopayCreateOrderResult> => {
  requireZalopayConfig();

  const appId = String(env.ZALOPAY_APP_ID ?? '').trim();
  const appUser = input.appUser.trim();
  const appTransId = input.appTransId.trim();
  const apptime = Date.now();
  const amount = Math.round(input.amount);
  const embedPayload = {
    ...(input.embedData ?? {}),
    ...(input.redirectUrl?.trim() ? { redirecturl: input.redirectUrl.trim() } : {})
  };
  const embedData = JSON.stringify(embedPayload);
  const item = JSON.stringify(input.items ?? []);

  const macData = `${appId}|${appTransId}|${appUser}|${amount}|${apptime}|${embedData}|${item}`;
  const mac = signHmacSha256(env.ZALOPAY_KEY1 ?? '', macData);

  const payload = new URLSearchParams({
    appid: appId,
    appuser: appUser,
    apptime: String(apptime),
    apptransid: appTransId,
    amount: String(amount),
    embeddata: embedData,
    item,
    description: input.description,
    mac
  });

  if (typeof input.bankCode === 'string') {
    payload.append('bankcode', input.bankCode.trim());
  }

  let response: Response;

  try {
    response = await fetch(resolveZalopayCreateEndpoint(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: payload,
      signal: AbortSignal.timeout(ZALOPAY_REQUEST_TIMEOUT_MS)
    });
  } catch (error) {
    if (isTimeoutLikeError(error)) {
      throw new ApiError(StatusCodes.BAD_GATEWAY, 'ZaloPay phản hồi quá chậm, vui lòng thử lại');
    }

    throw error;
  }

  if (!response.ok) {
    throw new ApiError(StatusCodes.BAD_GATEWAY, 'Không thể tạo giao dịch ZaloPay');
  }

  const data = (await response.json()) as {
    returncode?: number;
    return_code?: number;
    returnmessage?: string;
    return_message?: string;
    subreturncode?: number;
    sub_return_code?: number;
    subreturnmessage?: string;
    sub_return_message?: string;
    orderurl?: string;
    order_url?: string;
    zptranstoken?: string;
    zp_trans_token?: string;
  };

  const returnCode = Number(data.returncode ?? data.return_code ?? 0);
  const returnMessage = data.returnmessage ?? data.return_message;
  const subReturnCode = Number(data.subreturncode ?? data.sub_return_code ?? 0) || undefined;
  const subReturnMessage = data.subreturnmessage ?? data.sub_return_message;
  const orderUrl = data.orderurl ?? data.order_url;
  const zpTransToken = data.zptranstoken ?? data.zp_trans_token;

  if (returnCode !== 1 || !orderUrl) {
    logger.warn(
      `[ZaloPay] create order failed (code=${returnCode}, subCode=${subReturnCode ?? 'N/A'}, message=${returnMessage ?? 'N/A'})`,
      data
    );
    throw new ApiError(
      StatusCodes.BAD_GATEWAY,
      returnMessage
        ? `ZaloPay: ${returnMessage}${subReturnCode ? ` sub:${subReturnCode}` : ''}${subReturnMessage ? ` ${subReturnMessage}` : ''}`
        : `ZaloPay: Giao dịch thất bại (code: ${returnCode})`
    );
  }

  return {
    orderUrl,
    returnCode,
    returnMessage,
    subReturnCode,
    subReturnMessage,
    zpTransToken
  };
};

export const verifyZalopayCallback = (payload: ZalopayCallbackPayload) => {
  requireZalopayConfig();

  const expected = signHmacSha256(env.ZALOPAY_KEY2 ?? '', payload.data);
  const isVerified = isSameSignature(expected, payload.mac);

  if (!isVerified) {
    return {
      isVerified: false,
      data: null
    };
  }

  try {
    const parsed = JSON.parse(payload.data) as ZalopayCallbackData;
    return {
      isVerified: true,
      data: parsed
    };
  } catch (error) {
    logger.warn('[ZaloPay] invalid callback data', error);
    return {
      isVerified: false,
      data: null
    };
  }
};

export const verifyZalopayRedirect = (
  payload: ZalopayRedirectPayload
): ZalopayRedirectVerifyResult => {
  requireZalopayConfig();

  const checksumData = [
    payload.appid ?? '',
    payload.apptransid ?? '',
    payload.pmcid ?? '',
    payload.bankcode ?? '',
    payload.amount ?? '',
    payload.discountamount ?? '',
    payload.status ?? ''
  ].join('|');

  const expected = signHmacSha256(env.ZALOPAY_KEY2 ?? '', checksumData);
  const isVerified = isSameSignature(expected, payload.checksum);

  return {
    isVerified,
    appTransId: String(payload.apptransid ?? '').trim(),
    status: Number(payload.status ?? 0)
  };
};

export const queryZalopayOrderStatus = async (appTransId: string): Promise<ZalopayQueryResult> => {
  requireZalopayConfig();

  const appId = String(env.ZALOPAY_APP_ID ?? '').trim();
  const normalizedTransId = appTransId.trim();
  const macData = `${appId}|${normalizedTransId}|${env.ZALOPAY_KEY1 ?? ''}`;
  const mac = signHmacSha256(env.ZALOPAY_KEY1 ?? '', macData);

  const payload = new URLSearchParams({
    appid: appId,
    apptransid: normalizedTransId,
    mac
  });

  let response: Response;

  try {
    response = await fetch(resolveZalopayQueryEndpoint(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: payload,
      signal: AbortSignal.timeout(ZALOPAY_REQUEST_TIMEOUT_MS)
    });
  } catch (error) {
    if (isTimeoutLikeError(error)) {
      throw new ApiError(
        StatusCodes.BAD_GATEWAY,
        'Không thể kiểm tra trạng thái ZaloPay kịp thời'
      );
    }

    throw error;
  }

  if (!response.ok) {
    throw new ApiError(StatusCodes.BAD_GATEWAY, 'Không thể truy vấn trạng thái ZaloPay');
  }

  const data = (await response.json()) as {
    returncode?: number;
    return_code?: number;
    returnmessage?: string;
    return_message?: string;
    subreturncode?: number;
    sub_return_code?: number;
    subreturnmessage?: string;
    sub_return_message?: string;
    zptransid?: string | number;
    zp_trans_id?: string | number;
  };

  return {
    returnCode: Number(data.returncode ?? data.return_code ?? 0),
    returnMessage: data.returnmessage ?? data.return_message,
    subReturnCode: Number(data.subreturncode ?? data.sub_return_code ?? 0) || undefined,
    subReturnMessage: data.subreturnmessage ?? data.sub_return_message,
    zpTransId: data.zptransid ? String(data.zptransid) : data.zp_trans_id ? String(data.zp_trans_id) : undefined
  };
};
