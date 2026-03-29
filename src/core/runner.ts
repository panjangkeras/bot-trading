import { env, pairs, strategyConfig } from '../config.js';
import { evaluateTrendPullback } from './strategy.js';
import { canOpenMorePositions, canTradeToday, getEntryNotionalUsdt } from './risk.js';
import { shouldExecuteLive } from './execution.js';
import { getOpenOrders, getPositions, placeMarketOrder, setLeverage } from '../services/bitgetCli.js';
import { getTodayRealizedLossUsdt } from '../services/dailyStats.js';
import { getCandles } from '../services/marketData.js';
import { insertBotRun } from '../services/supabase.js';
import { getCerebrasAdvice } from '../services/cerebras.js';
import { appendWorkspaceLearningLog } from '../workspaceLog.js';
import { canRunSymbol, markRun } from '../services/schedulerGuard.js';
import { attachProtectionOrders } from '../services/protection.js';
import { validateEntrySize } from '../services/contractGuard.js';
import { validateStopsForAction } from '../services/tradeValidation.js';
import { computeOrderSizeFromEntryUsdt, getContractSpec } from '../services/bitgetContracts.js';
import { getOpenPositions } from '../services/positions.js';
import { runExitManager } from '../services/exits.js';

function countOpenPositions(payload: unknown) {
  const data = (payload as { data?: unknown[] })?.data;
  return Array.isArray(data) ? data.length : 0;
}

function countOpenOrders(payload: unknown) {
  const list = (payload as { data?: { entrustedList?: unknown[] | null } })?.data?.entrustedList;
  return Array.isArray(list) ? list.length : 0;
}

export async function runScan() {
  validateEntrySize();

  const livePositions = await getOpenPositions();
  const exitResults = await runExitManager(livePositions);
  const positions = await getPositions();
  const openOrders = await getOpenOrders();
  const realizedDailyLossUsdt = await getTodayRealizedLossUsdt();

  const openPositionCount = countOpenPositions(positions);
  const openOrderCount = countOpenOrders(openOrders);
  const allowByLoss = canTradeToday(realizedDailyLossUsdt);
  const allowByPositions = canOpenMorePositions(openPositionCount);
  const cooldownMs = 5 * 60 * 1000;

  const results = [];
  for (const symbol of pairs) {
    const trendCandles = await getCandles(symbol, strategyConfig.trendTimeframe, 240);
    const entryCandles = await getCandles(symbol, strategyConfig.entryTimeframe, 240);
    const signal = evaluateTrendPullback(symbol, trendCandles, entryCandles);
    const cerebrasAdvice = await getCerebrasAdvice(signal);

    let executionStatus = 'signal_only';
    let orderPayload: Record<string, unknown> | null = null;
    let protectionPayload: Record<string, unknown> | null = null;

    if (!allowByLoss) {
      executionStatus = 'blocked_daily_loss';
    } else if (!allowByPositions) {
      executionStatus = 'blocked_max_positions';
    } else if (openOrderCount > 0) {
      executionStatus = 'blocked_open_orders';
    } else if (!canRunSymbol(symbol, cooldownMs)) {
      executionStatus = 'blocked_cooldown';
    } else if (shouldExecuteLive(signal)) {
      const side = signal.decision === 'long' ? 'buy' : 'sell';
      const entryUsdt = getEntryNotionalUsdt();

      validateStopsForAction({
        action: side,
        currentPrice: signal.entryPrice ?? 0,
        stopLoss: signal.stopLoss,
        takeProfit: signal.takeProfit
      });

      const contract = await getContractSpec(symbol, strategyConfig.productType);
      const sizePlan = computeOrderSizeFromEntryUsdt({
        entryUsdt,
        price: signal.entryPrice ?? 0,
        leverage: env.BITGET_DEFAULT_LEVERAGE,
        contract
      });

      await setLeverage(symbol, env.BITGET_DEFAULT_LEVERAGE);
      const order = await placeMarketOrder({
        symbol,
        side,
        size: sizePlan.sizeText,
        presetStopLossPrice: signal.stopLoss ? String(signal.stopLoss) : undefined,
        presetStopSurplusPrice: signal.takeProfit ? String(signal.takeProfit) : undefined
      });
      const protection = await attachProtectionOrders({
        symbol,
        stopLoss: signal.stopLoss,
        takeProfit: signal.takeProfit,
        orderPayload: order as Record<string, unknown>
      });
      executionStatus = 'live_order_sent';
      orderPayload = {
        order,
        sizePlan,
        contract
      } as Record<string, unknown>;
      protectionPayload = protection as Record<string, unknown>;
      markRun(symbol);
    }

    await insertBotRun({
      symbol,
      timeframeTrend: strategyConfig.trendTimeframe,
      timeframeEntry: strategyConfig.entryTimeframe,
      decision: signal.decision,
      confidence: signal.confidence,
      reason: cerebrasAdvice ? [...signal.reason, `cerebras:${cerebrasAdvice}`] : signal.reason,
      entryPrice: signal.entryPrice ?? null,
      stopLoss: signal.stopLoss ?? null,
      takeProfit: signal.takeProfit ?? null,
      mode: env.BITGET_PAPER_TRADING ? 'paper' : 'live',
      pnlUsdt: null,
      executionStatus,
      orderPayload: { order: orderPayload, protection: protectionPayload }
    });

    if (signal.decision !== 'none') {
      await appendWorkspaceLearningLog({
        area: 'strategy',
        summary: `signal generated for ${symbol}`,
        details: `decision=${signal.decision}, confidence=${signal.confidence}, executionStatus=${executionStatus}, advice=${cerebrasAdvice ?? 'none'}, reasons=${signal.reason.join(', ')}`,
        tags: ['strategy', symbol.toLowerCase(), signal.decision]
      });
    }

    results.push({ symbol, signal, executionStatus, orderPayload, protectionPayload, cerebrasAdvice });
  }

  return { realizedDailyLossUsdt, positions, openOrders, exitResults, results };
}
