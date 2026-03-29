import { env, strategyConfig } from '../config.js';
import { canOpenMorePositions, canTradeToday, getEntryNotionalUsdt } from './risk.js';
import { getOpenOrders, getPositions, placeMarketOrder, setLeverage } from '../services/bitgetCli.js';
import { getTodayRealizedLossUsdt } from '../services/dailyStats.js';
import { insertBotRun } from '../services/supabase.js';
import { appendWorkspaceLearningLog } from '../workspaceLog.js';
import { sendTelegramMessage } from '../services/telegram.js';
import { normalizeTradingViewPayload } from '../services/tradingView.js';
import { getCurrentMarkPrice } from '../services/marketData.js';
import { validateStopsForAction } from '../services/tradeValidation.js';
import { computeOrderSizeFromEntryUsdt, getContractSpec } from '../services/bitgetContracts.js';

function countOpenPositions(payload: unknown) {
  const data = (payload as { data?: unknown[] })?.data;
  return Array.isArray(data) ? data.length : 0;
}

function countOpenOrders(payload: unknown) {
  const list = (payload as { data?: { entrustedList?: unknown[] | null } })?.data?.entrustedList;
  return Array.isArray(list) ? list.length : 0;
}

export async function executeTradingViewSignal(rawPayload: unknown) {
  const payload = normalizeTradingViewPayload(rawPayload);

  if (payload.secret !== process.env.TRADINGVIEW_WEBHOOK_SECRET) {
    throw new Error('invalid_tradingview_secret');
  }

  const positions = await getPositions();
  const openOrders = await getOpenOrders();
  const realizedDailyLossUsdt = await getTodayRealizedLossUsdt();

  const openPositionCount = countOpenPositions(positions);
  const openOrderCount = countOpenOrders(openOrders);

  if (!canTradeToday(realizedDailyLossUsdt)) throw new Error('blocked_daily_loss');
  if (!canOpenMorePositions(openPositionCount)) throw new Error('blocked_max_positions');
  if (openOrderCount > 0) throw new Error('blocked_open_orders');
  if (!env.BITGET_ENABLE_LIVE_TRADING || env.BITGET_PAPER_TRADING) throw new Error('live_execution_disabled');

  const leverage = payload.leverage ?? env.BITGET_DEFAULT_LEVERAGE;
  const entryUsdt = payload.entry_usdt ?? getEntryNotionalUsdt();
  const currentPrice = await getCurrentMarkPrice(payload.symbol);

  validateStopsForAction({
    action: payload.action,
    currentPrice,
    stopLoss: payload.stop_loss,
    takeProfit: payload.take_profit
  });

  const contract = await getContractSpec(payload.symbol, strategyConfig.productType);
  const sizePlan = computeOrderSizeFromEntryUsdt({
    entryUsdt,
    price: currentPrice,
    leverage,
    contract
  });

  await setLeverage(payload.symbol, leverage);
  const order = await placeMarketOrder({
    symbol: payload.symbol,
    side: payload.action,
    size: sizePlan.sizeText,
    presetStopLossPrice: payload.stop_loss ? String(payload.stop_loss) : undefined,
    presetStopSurplusPrice: payload.take_profit ? String(payload.take_profit) : undefined
  });

  await insertBotRun({
    symbol: payload.symbol,
    timeframeTrend: 'tradingview',
    timeframeEntry: 'tradingview',
    decision: payload.action === 'buy' ? 'long' : 'short',
    confidence: 1,
    reason: [`tv:${payload.source ?? 'alert'}`],
    entryPrice: null,
    stopLoss: payload.stop_loss ?? null,
    takeProfit: payload.take_profit ?? null,
    mode: 'live',
    pnlUsdt: null,
    executionStatus: 'live_order_sent',
    orderPayload: { order, sizePlan, contract } as Record<string, unknown>
  });

  await appendWorkspaceLearningLog({
    area: 'tradingview',
    summary: `tradingview signal executed for ${payload.symbol}`,
    details: `action=${payload.action}, leverage=${leverage}, entryUsdt=${entryUsdt}, source=${payload.source ?? 'alert'}`,
    tags: ['tradingview', payload.symbol.toLowerCase(), payload.action]
  });

  await sendTelegramMessage(`📈 TradingView signal executed\n${payload.symbol} | ${payload.action}\nLev: ${leverage} | Entry: ${entryUsdt} USDT`);

  return { ok: true, payload, order, realizedDailyLossUsdt };
}
