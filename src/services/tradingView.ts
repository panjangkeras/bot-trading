import { z } from 'zod';

export const tradingViewPayloadSchema = z.object({
  secret: z.string().min(1),
  symbol: z.string().min(1),
  action: z.enum(['buy', 'sell']),
  leverage: z.coerce.number().positive().optional(),
  entry_usdt: z.coerce.number().min(5).optional(),
  stop_loss: z.coerce.number().positive().optional(),
  take_profit: z.coerce.number().positive().optional(),
  source: z.string().optional()
});

export type TradingViewPayload = z.infer<typeof tradingViewPayloadSchema>;

export function normalizeTradingViewPayload(input: unknown): TradingViewPayload {
  return tradingViewPayloadSchema.parse(input);
}
