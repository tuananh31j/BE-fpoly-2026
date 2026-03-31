import { StatusCodes } from 'http-status-codes';

import type { OrderStatus } from '@/types/domain';
import { ApiError } from '@utils/api-error';

const transitionMap: Record<OrderStatus, OrderStatus[]> = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['shipping', 'cancelled'],
  shipping: ['delivered'],
  delivered: ['completed'],
  completed: ['returned'],
  cancelled: [],
  returned: []
};

export const assertOrderTransitionAllowed = (from: OrderStatus, to: OrderStatus) => {
  if (from === to) {
    return;
  }

  const allowed = transitionMap[from];

  if (!allowed.includes(to)) {
    throw new ApiError(
      StatusCodes.UNPROCESSABLE_ENTITY,
      `Invalid order transition: ${from} -> ${to}`
    );
  }
};
