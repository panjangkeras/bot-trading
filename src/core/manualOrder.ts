import { env, strategyConfig } from '../config.js';
import { setLeverage, placeMarketOrder } from '../services/bitgetCli.js';
import { getCurrentMarkPrice } from '../services/marketData.js';
import { computeOrderSizeFromEntryUsdt, getContractSpec } from '../services/bitgetContracts.js';
import { validateStopsForAction } from '../services/tradeValidation.js';
import { insertBotRun } from '../services/supabase.js';
import { appendWorkspaceLearningLog } from '../workspaceLog.js';
import { sendTelegramMessage } from '../services/telegram.js';
import { buildTradeManagementState } from '../services/tradeState.js';

export async function executeManualLiveOrder(input: {
  symbol: string;
  side: 'buy' | 'sell';
  entryUsdt?: number;
  leverage?: number;
  stopLoss?: number;
  takeProfit?: number;
}) {
  if (!env.BITGET_ENABLE_LIVE_TRADING || env.BITGET_PAPER_TRADING) {
    throw new Error('live_execution_disabled');
  }

  const symbol = input.symbol.trim().toUpperCase();
  const side = input.side;
  const entryUsdt = input.entryUsdt ?? env.BITGET_ENTRY_USDT;
  const leverage = input.leverage ?? env.BITGET_DEFAULT_LEVERAGE;

  const currentPrice = await getCurrentMarkPrice(symbol);
  validateStopsForAction({
    action: side,
    currentPrice,
    stopLoss: input.stopLoss,
    takeProfit: input.takeProfit
  });

  const contract = await getContractSpec(symbol, strategyConfig.productType);
  const sizePlan = computeOrderSizeFromEntryUsdt({
    entryUsdt,
    price: currentPrice,
    leverage,
    contract
  });

  await setLeverage(symbol, leverage);
  const order = await placeMarketOrder({
    symbol,
    side,
    size: sizePlan.sizeText,
    presetStopLossPrice: input.stopLoss ? String(input.stopLoss) : undefined,
    presetStopSurplusPrice: input.takeProfit ? String(input.takeProfit) : undefined
  });

  const tradeManagement = buildTradeManagementState({
    symbol,
    side,
    entryPrice: currentPrice,
    stopLoss: input.stopLoss ?? null,
    takeProfit: input.takeProfit ?? null,
    size: sizePlan.size
  });

  await insertBotRun({
    symbol,
    timeframeTrend: 'manual',
    timeframeEntry: 'manual',
    decision: side === 'buy' ? 'long' : 'short',
    confidence: 1,
    reason: ['manual_live_order'],
    entryPrice: currentPrice,
    stopLoss: input.stopLoss ?? null,
    takeProfit: input.takeProfit ?? null,
    mode: 'live',
    pnlUsdt: null,
    executionStatus: 'live_order_sent',
    orderPayload: { order, contract, sizePlan, tradeManagement }
  });

  await appendWorkspaceLearningLog({
    area: 'manual-order',
    summary: `manual live order sent for ${symbol}`,
    details: `side=${side}, entryUsdt=${entryUsdt}, leverage=${leverage}, size=${sizePlan.sizeText}, price=${currentPrice}`,
    tags: ['manual-order', symbol.toLowerCase(), side]
  });

  try {
    await sendTelegramMessage(`🚀 Manual live order sent\n${symbol} | ${side}\nEntry: ${entryUsdt} USDT | Lev: ${leverage}\nSize: ${sizePlan.sizeText} | Price: ${currentPrice}`);
  } catch {
    // ignore telegram notification failure so it does not mask a successful order
  }

  return {
    ok: true,
    symbol,
    side,
    entryUsdt,
    leverage,
    currentPrice,
    contract,
    sizePlan,
    order
  };
}
