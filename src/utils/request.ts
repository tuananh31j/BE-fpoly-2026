import { StatusCodes } from 'http-status-codes';

import { ApiError } from '@utils/api-error';

export const getParam = (value: string | string[] | undefined, fieldName: string) => {
  if (Array.isArray(value)) {
    if (value.length > 0 && value[0]) {
      return value[0];
    }

    throw new ApiError(StatusCodes.BAD_REQUEST, `Missing ${fieldName}`);
  }

  if (!value) {
    throw new ApiError(StatusCodes.BAD_REQUEST, `Missing ${fieldName}`);
  }

  return value;
};

export const getOptionalParam = (value: string | string[] | undefined) => {
  if (Array.isArray(value)) {
    if (value.length > 0 && value[0]) {
      return value[0];
    }

    return undefined;
  }

  return value;
};
