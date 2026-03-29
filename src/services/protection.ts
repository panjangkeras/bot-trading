import { appendWorkspaceLearningLog } from '../workspaceLog.js';

export async function attachProtectionOrders(input: {
  symbol: string;
  stopLoss?: number;
  takeProfit?: number;
  orderPayload?: Record<string, unknown> | null;
}) {
  const protectionEnabled = Boolean(input.stopLoss || input.takeProfit);

  await appendWorkspaceLearningLog({
    area: 'protection',
    summary: protectionEnabled ? `protection prepared for ${input.symbol}` : `no protection attached for ${input.symbol}`,
    details: `stopLoss=${input.stopLoss ?? 'none'}, takeProfit=${input.takeProfit ?? 'none'}, orderPayloadPresent=${input.orderPayload ? 'yes' : 'no'}`,
    tags: ['protection', protectionEnabled ? 'planned' : 'none', input.symbol.toLowerCase()]
  });

  return {
    ok: true,
    mode: protectionEnabled ? 'tracked_for_followup' : 'none',
    stopLoss: input.stopLoss ?? null,
    takeProfit: input.takeProfit ?? null,
    note: protectionEnabled
      ? 'Entry-level protection values captured. Dedicated hedge-mode close/protection flow should manage exits explicitly.'
      : 'No protection values provided.'
  };
}
