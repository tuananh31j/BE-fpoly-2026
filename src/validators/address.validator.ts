import { z } from 'zod';

export const createAddressSchema = z.object({
  body: z.object({
    label: z.string().min(1).max(30).optional(),
    recipientName: z.string().min(2).max(120),
    phone: z.string().min(8).max(20),
    street: z.string().min(2).max(255),
    city: z.string().min(1).max(120),
    district: z.string().min(1).max(120),
    ward: z.string().min(1).max(120),
    isDefault: z.boolean().optional()
  })
});

export const addressIdParamSchema = z.object({
  params: z.object({
    addressId: z.string().min(1)
  })
});

export const updateAddressSchema = z.object({
  params: z.object({
    addressId: z.string().min(1)
  }),
  body: z
    .object({
      label: z.string().min(1).max(30).optional(),
      recipientName: z.string().min(2).max(120).optional(),
      phone: z.string().min(8).max(20).optional(),
      street: z.string().min(2).max(255).optional(),
      city: z.string().min(1).max(120).optional(),
      district: z.string().min(1).max(120).optional(),
      ward: z.string().min(1).max(120).optional(),
      isDefault: z.boolean().optional()
    })
    .refine((value) => Object.keys(value).length > 0, {
      message: 'At least one field is required'
    })
});
