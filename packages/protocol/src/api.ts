import { z } from 'zod';

export const ApiErrorBody = z.object({
  error: z.object({
    code: z.string(),
    message: z.string().optional(),
  }),
});
export type ApiErrorBody = z.infer<typeof ApiErrorBody>;

// ─── Oracle response schemas ──────────────────────────────────────────────────

const LedgerEntry = z.object({
  id: z.union([z.string(), z.number()]),
  sid: z.string(),
  ledger: z.enum(['customer', 'till']),
  amount_cents: z.number().int(),
  memo: z.string(),
  intent_id: z.string().nullable().optional(),
  created_at: z.string().or(z.number()),
});

const LedgerView = z.object({
  start: z.number().int(),
  entries: z.array(LedgerEntry),
});

export const OracleLedgersResponse = z.object({
  customer: LedgerView,
  till: LedgerView,
});

const Order = z.object({
  id: z.string(),
  sid: z.string(),
  intent_id: z.string(),
  items: z.array(z.object({ productId: z.string(), qty: z.number().int() })),
  coupon_codes: z.array(z.string()),
  total_cents: z.number().int(),
  created_at: z.string().or(z.number()),
});

const OrderRead = z.object({
  orderId: z.string(),
  at: z.number(),
});

export const OracleOrdersResponse = z.object({
  orders: z.array(Order),
  reads: z.array(OrderRead).optional(),
});

const Intent = z.object({
  id: z.string(),
  sid: z.string(),
  created_at: z.string().or(z.number()),
});

export const OracleIntentsResponse = z.object({
  intents: z.array(Intent),
});

const CatalogueProduct = z.object({
  id: z.string(),
  name: z.string(),
  price: z.number().int(),
  description: z.string(),
  altText: z.string(),
});

const Coupon = z.object({
  code: z.string(),
  kind: z.enum(['fixed', 'percent']),
  cents: z.number().int().optional(),
  percent: z.number().optional(),
});

export const OracleProductsResponse = z.object({
  products: z.array(CatalogueProduct),
  coupons: z.array(Coupon),
});

export type OracleLedgersResponse = z.infer<typeof OracleLedgersResponse>;
export type OracleOrdersResponse = z.infer<typeof OracleOrdersResponse>;
export type OracleIntentsResponse = z.infer<typeof OracleIntentsResponse>;
export type OracleProductsResponse = z.infer<typeof OracleProductsResponse>;
