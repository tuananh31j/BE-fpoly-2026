import { StatusCodes } from 'http-status-codes';

import { AddressModel } from '@models/address.model';
import { ApiError } from '@utils/api-error';
import { toObjectId } from '@utils/object-id';

interface AddressPayload {
  label?: string;
  recipientName: string;
  phone: string;
  street: string;
  city: string;
  district: string;
  ward: string;
  isDefault?: boolean;
}

// worklog: 2026-03-04 19:46:44 | dung | fix | ensureUserDefaultAddress
const ensureUserDefaultAddress = async (userId: string, excludeAddressId?: string) => {
  const filters: Record<string, unknown> = {
    userId: toObjectId(userId, 'userId'),
    isDefault: true
  };

  if (excludeAddressId) {
    filters._id = {
      $ne: toObjectId(excludeAddressId, 'addressId')
    };
  }

  const existingDefault = await AddressModel.findOne(filters).lean();
  return existingDefault;
};

export const listMyAddresses = async (userId: string) => {
  const items = await AddressModel.find({ userId: toObjectId(userId, 'userId') })
    .sort({ isDefault: -1, _id: -1 })
    .lean();

  return items;
};

export const createMyAddress = async (userId: string, payload: AddressPayload) => {
  const shouldSetDefault = payload.isDefault ?? false;
  const existingDefault = await ensureUserDefaultAddress(userId);

  const created = await AddressModel.create({
    userId: toObjectId(userId, 'userId'),
    label: payload.label ?? 'Home',
    recipientName: payload.recipientName,
    phone: payload.phone,
    street: payload.street,
    city: payload.city,
    district: payload.district,
    ward: payload.ward,
    isDefault: shouldSetDefault || !existingDefault
  });

  if (shouldSetDefault) {
    await AddressModel.updateMany(
      {
        userId: toObjectId(userId, 'userId'),
        _id: {
          $ne: created._id
        }
      },
      {
        isDefault: false
      }
    );
  }

  return created.toObject();
};

export const updateMyAddress = async (
  userId: string,
  addressId: string,
  payload: Partial<AddressPayload>
) => {
  const _userId = toObjectId(userId, 'userId');
  const _addressId = toObjectId(addressId, 'addressId');

  const address = await AddressModel.findOne({
    _id: _addressId,
    userId: _userId
  });

  if (!address) {
    throw new ApiError(StatusCodes.NOT_FOUND, 'Address not found');
  }

  if (payload.label !== undefined) {
    address.label = payload.label;
  }

  if (payload.recipientName !== undefined) {
    address.recipientName = payload.recipientName;
  }

  if (payload.phone !== undefined) {
    address.phone = payload.phone;
  }

  if (payload.street !== undefined) {
    address.street = payload.street;
  }

  if (payload.city !== undefined) {
    address.city = payload.city;
  }

  if (payload.district !== undefined) {
    address.district = payload.district;
  }

  if (payload.ward !== undefined) {
    address.ward = payload.ward;
  }

  if (payload.isDefault !== undefined) {
    address.isDefault = payload.isDefault;
  }

  await address.save();

  if (payload.isDefault) {
    await AddressModel.updateMany(
      {
        userId: _userId,
        _id: {
          $ne: _addressId
        }
      },
      {
        isDefault: false
      }
    );
  }

  return address.toObject();
};

// worklog: 2026-03-04 17:01:54 | vanduc | fix | deleteMyAddress
export const deleteMyAddress = async (userId: string, addressId: string) => {
  const _userId = toObjectId(userId, 'userId');
  const _addressId = toObjectId(addressId, 'addressId');

  const deleted = await AddressModel.findOneAndDelete({
    _id: _addressId,
    userId: _userId
  }).lean();

  if (!deleted) {
    throw new ApiError(StatusCodes.NOT_FOUND, 'Address not found');
  }

  if (deleted.isDefault) {
    const fallback = await AddressModel.findOne({ userId: _userId }).sort({ _id: -1 });

    if (fallback) {
      fallback.isDefault = true;
      await fallback.save();
    }
  }

  return {
    id: String(deleted._id)
  };
};
