import { supabase, insertBotRun } from './supabase.js';
import { OpenPosition } from './positions.js';
import { closePositionMarket, placeReduceOnlyCloseOrder } from './bitgetRest.js';
import { env, strategyConfig } from '../config.js';
import { appendWorkspaceLearningLog } from '../workspaceLog.js';
import { sendTelegramMessage } from './telegram.js';
import { readTradeManagementState } from './tradeState.js';
import { syncTradeStateWithPosition } from './tradeManagerSync.js';

interface LatestProtectedRun {
  id: number;
  symbol: string;
  stop_loss: number | null;
  take_profit: number | null;
  order_payload: Record<string, any> | null;
  created_at: string;
}

function matchesExit(position: OpenPosition, stopLoss?: number | null, takeProfit?: number | null) {
  if (position.holdSide === 'long') {
    if (stopLoss && position.markPrice <= stopLoss) return 'stop_loss';
    if (takeProfit && position.markPrice >= takeProfit) return 'take_profit';
    return null;
  }

  if (stopLoss && position.markPrice >= stopLoss) return 'stop_loss';
  if (takeProfit && position.markPrice <= takeProfit) return 'take_profit';
  return null;
}

export async function getLatestProtectedRun(symbol: string) {
  const { data, error } = await supabase
    .from('bot_runs')
    .select('id,symbol,stop_loss,take_profit,order_payload,created_at,execution_status')
    .eq('symbol', symbol)
    .in('execution_status', ['live_order_sent'])
    .order('created_at', { ascending: false })
    .limit(10);

  if (error) throw error;

  const rows = (data ?? []) as LatestProtectedRun[];
  return rows.find((row) => Number(row.stop_loss ?? 0) > 0 || Number(row.take_profit ?? 0) > 0) ?? rows[0] ?? null;
}

export async function runExitManager(positions: OpenPosition[]) {
  const results: Array<Record<string, unknown>> = [];

  for (const position of positions) {
    const latestRun = await getLatestProtectedRun(position.symbol);
    if (!latestRun) {
      results.push({ symbol: position.symbol, status: 'no_entry_context' });
      continue;
    }

    const stopLoss = Number(latestRun.stop_loss ?? 0) || null;
    const takeProfit = Number(latestRun.take_profit ?? 0) || null;
    const state = readTradeManagementState(latestRun.order_payload);

    if (!state) {
      const trigger = matchesExit(position, stopLoss, takeProfit);
      if (!trigger) {
        results.push({
          symbol: position.symbol,
          holdSide: position.holdSide,
          markPrice: position.markPrice,
          stopLoss,
          takeProfit,
          status: 'monitoring'
        });
        continue;
      }

      const closeResult = await closePositionMarket({
        symbol: position.symbol,
        holdSide: position.holdSide,
        productType: strategyConfig.productType
      });

      await insertBotRun({
        symbol: position.symbol,
        timeframeTrend: 'exit-manager',
        timeframeEntry: 'exit-manager',
        decision: position.holdSide === 'long' ? 'short' : 'long',
        confidence: 1,
        reason: [`exit:${trigger}`],
        entryPrice: position.markPrice,
        stopLoss,
        takeProfit,
        mode: 'live',
        pnlUsdt: position.unrealizedPL,
        executionStatus: 'live_exit_sent',
        orderPayload: {
          position,
          latestRunId: latestRun.id,
          closeResult,
          trigger
        }
      });

      results.push({ symbol: position.symbol, trigger, status: 'exit_sent' });
      continue;
    }

    const nextState = syncTradeStateWithPosition({ ...state }, position);
    let action: 'monitoring' | 'tp1_partial_close' | 'tp2_full_close' | 'stop_loss_close' | 'trailing_stop_close' = 'monitoring';
    let apiResult: Record<string, unknown> | null = null;

    const currentStopLoss = nextState.trailingEnabled && nextState.trailingStopPrice
      ? nextState.trailingStopPrice
      : nextState.currentStopLoss;

    if (!nextState.tp1Hit && nextState.tp1Price && (
      (position.holdSide === 'long' && position.markPrice >= nextState.tp1Price) ||
      (position.holdSide === 'short' && position.markPrice <= nextState.tp1Price)
    )) {
      const closeSize = Math.min(position.total, Math.max(0, nextState.initialSize * nextState.tp1CloseRatio));
      if (closeSize > 0) {
        try {
          apiResult = await placeReduceOnlyCloseOrder({
            symbol: position.symbol,
            holdSide: position.holdSide,
            productType: strategyConfig.productType,
            marginCoin: env.BITGET_ENABLE_LIVE_TRADING ? strategyConfig.marginCoin : strategyConfig.marginCoin,
            size: String(closeSize)
          }) as Record<string, unknown>;
          nextState.tp1Hit = true;
          nextState.breakEvenArmed = true;
          nextState.trailingEnabled = true;
          nextState.currentStopLoss = nextState.entryPrice;
          nextState.trailingStopPrice = nextState.entryPrice;
          nextState.closedSize += closeSize;
          nextState.remainingSize = Math.max(0, nextState.initialSize - nextState.closedSize);
          action = 'tp1_partial_close';
        } catch (error) {
          apiResult = await closePositionMarket({
            symbol: position.symbol,
            holdSide: position.holdSide,
            productType: strategyConfig.productType
          }) as Record<string, unknown>;
          nextState.tp1Hit = true;
          nextState.tp2Hit = true;
          nextState.closedSize = nextState.initialSize;
          nextState.remainingSize = 0;
          action = 'tp2_full_close';
          await appendWorkspaceLearningLog({
            area: 'trade-manager',
            summary: `partial close escalated to full close for ${position.symbol}`,
            details: `closeSize=${closeSize}, error=${error instanceof Error ? error.message : 'unknown_partial_close_error'}`,
            tags: ['trade-manager', position.symbol.toLowerCase(), 'partial-close-escalation']
          });
        }
      }
    } else if (nextState.tp2Price && (
      (position.holdSide === 'long' && position.markPrice >= nextState.tp2Price) ||
      (position.holdSide === 'short' && position.markPrice <= nextState.tp2Price)
    )) {
      apiResult = await closePositionMarket({
        symbol: position.symbol,
        holdSide: position.holdSide,
        productType: strategyConfig.productType
      }) as Record<string, unknown>;
      nextState.tp2Hit = true;
      nextState.remainingSize = 0;
      action = 'tp2_full_close';
    } else if (currentStopLoss && (
      (position.holdSide === 'long' && position.markPrice <= currentStopLoss) ||
      (position.holdSide === 'short' && position.markPrice >= currentStopLoss)
    )) {
      apiResult = await closePositionMarket({
        symbol: position.symbol,
        holdSide: position.holdSide,
        productType: strategyConfig.productType
      }) as Record<string, unknown>;
      nextState.remainingSize = 0;
      action = nextState.trailingEnabled ? 'trailing_stop_close' : 'stop_loss_close';
    } else if (nextState.trailingEnabled) {
      const trailDistance = Math.abs(nextState.entryPrice - (nextState.initialStopLoss ?? nextState.entryPrice));
      if (trailDistance > 0) {
        if (position.holdSide === 'long') {
          const candidate = position.markPrice - trailDistance * 0.6;
          if (!nextState.trailingStopPrice || candidate > nextState.trailingStopPrice) {
            nextState.trailingStopPrice = candidate;
          }
        } else {
          const candidate = position.markPrice + trailDistance * 0.6;
          if (!nextState.trailingStopPrice || candidate < nextState.trailingStopPrice) {
            nextState.trailingStopPrice = candidate;
          }
        }
      }
    }

    const shouldLog = action !== 'monitoring' || nextState.tp1Hit !== state.tp1Hit || nextState.remainingSize !== state.remainingSize || nextState.trailingStopPrice !== state.trailingStopPrice;

    if (shouldLog) {
      await insertBotRun({
        symbol: position.symbol,
        timeframeTrend: 'trade-manager',
        timeframeEntry: 'trade-manager',
        decision: position.holdSide === 'long' ? 'long' : 'short',
        confidence: 1,
        reason: [action],
        entryPrice: position.markPrice,
        stopLoss: nextState.currentStopLoss,
        takeProfit: nextState.tp2Price,
        mode: 'live',
        pnlUsdt: position.unrealizedPL,
        executionStatus: action === 'monitoring' ? 'trade_management_monitoring' : 'trade_management_action',
        orderPayload: {
          latestRunId: latestRun.id,
          previousTradeManagement: state,
          tradeManagement: nextState,
          position,
          apiResult,
          action
        }
      });
    }

    if (shouldLog) {
      await appendWorkspaceLearningLog({
        area: 'trade-manager',
        summary: `${action} for ${position.symbol}`,
        details: `holdSide=${position.holdSide}, markPrice=${position.markPrice}, remainingSize=${nextState.remainingSize}, tp1Hit=${nextState.tp1Hit}, tp2Hit=${nextState.tp2Hit}`,
        tags: ['trade-manager', position.symbol.toLowerCase(), action]
      });
    }

    if (action !== 'monitoring') {
      try {
        await sendTelegramMessage(`🎯 Trade manager\n${position.symbol} | ${action}\nSide: ${position.holdSide}\nMark: ${position.markPrice}`);
      } catch {
        // ignore telegram errors
      }
    }

    results.push({
      symbol: position.symbol,
      holdSide: position.holdSide,
      markPrice: position.markPrice,
      stopLoss: nextState.currentStopLoss,
      takeProfit: nextState.tp2Price,
      trailingStopPrice: nextState.trailingStopPrice,
      tp1Hit: nextState.tp1Hit,
      tp2Hit: nextState.tp2Hit,
      remainingSize: nextState.remainingSize,
      action,
      status: action === 'monitoring' ? 'monitoring' : 'trade_management_action'
    });
  }

  return results;
}
