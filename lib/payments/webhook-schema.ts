import { z } from 'zod';

const paymentEntitySchema = z.object({
  id: z.string().min(1),
  order_id: z.string().min(1),
  status: z.string().optional(),
}).passthrough();

const refundEntitySchema = z.object({
  id: z.string().min(1),
  payment_id: z.string().min(1),
  amount: z.number().int().positive(),
  status: z.string().optional(),
  notes: z.record(z.unknown()).optional(),
}).passthrough();

const orderEntitySchema = z.object({
  id: z.string().min(1),
  status: z.string().optional(),
}).passthrough();

export const paymentWebhookSchema = z.discriminatedUnion('event', [
  z.object({
    event: z.literal('payment.captured'),
    payload: z.object({ payment: z.object({ entity: paymentEntitySchema }) }),
  }).passthrough(),
  z.object({
    event: z.literal('payment.failed'),
    payload: z.object({ payment: z.object({ entity: paymentEntitySchema }) }),
  }).passthrough(),
  z.object({
    event: z.literal('order.paid'),
    payload: z.object({ order: z.object({ entity: orderEntitySchema }) }),
  }).passthrough(),
  z.object({
    event: z.literal('refund.created'),
    payload: z.object({ refund: z.object({ entity: refundEntitySchema }) }),
  }).passthrough(),
  z.object({
    event: z.literal('refund.processed'),
    payload: z.object({ refund: z.object({ entity: refundEntitySchema }) }),
  }).passthrough(),
  z.object({
    event: z.literal('refund.failed'),
    payload: z.object({ refund: z.object({ entity: refundEntitySchema }) }),
  }).passthrough(),
]);

export type PaymentWebhook = z.infer<typeof paymentWebhookSchema>;
export type RefundWebhookEntity = z.infer<typeof refundEntitySchema>;
