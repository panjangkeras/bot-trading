import { env, strategyConfig } from '../config.js';
import { closePositionMarket } from '../services/bitgetRest.js';
import { getPositions } from '../services/bitgetCli.js';
import { insertBotRun } from '../services/supabase.js';
import { appendWorkspaceLearningLog } from '../workspaceLog.js';
import { sendTelegramMessage } from '../services/telegram.js';

function findOpenPosition(payload: unknown, symbol: string, holdSide?: 'long' | 'short') {
  const data = (payload as { data?: Array<Record<string, unknown>> })?.data ?? [];
  return data.find((row) => {
    const sameSymbol = String(row.symbol ?? '').toUpperCase() === symbol.toUpperCase();
    const sideOk = holdSide ? String(row.holdSide ?? '') === holdSide : true;
    const total = Number(row.total ?? 0);
    return sameSymbol && sideOk && total > 0;
  }) ?? null;
}

export async function executeManualClose(input: {
  symbol: string;
  holdSide?: 'long' | 'short';
}) {
  if (!env.BITGET_ENABLE_LIVE_TRADING || env.BITGET_PAPER_TRADING) {
    throw new Error('live_execution_disabled');
  }

  const symbol = input.symbol.trim().toUpperCase();
  const positions = await getPositions();
  const position = findOpenPosition(positions, symbol, input.holdSide);

  if (!position) {
    throw new Error('open_position_not_found');
  }

  const holdSide = String(position.holdSide ?? '') as 'long' | 'short';
  const closeResult = await closePositionMarket({
    symbol,
    holdSide,
    productType: strategyConfig.productType
  });

  await insertBotRun({
    symbol,
    timeframeTrend: 'manual',
    timeframeEntry: 'manual-close',
    decision: holdSide === 'long' ? 'short' : 'long',
    confidence: 1,
    reason: ['manual_close_position'],
    entryPrice: null,
    stopLoss: null,
    takeProfit: null,
    mode: 'live',
    pnlUsdt: null,
    executionStatus: 'live_close_sent',
    orderPayload: { closeResult, position }
  });

  await appendWorkspaceLearningLog({
    area: 'manual-close',
    summary: `manual close sent for ${symbol}`,
    details: `holdSide=${holdSide}, total=${String(position.total ?? '')}`,
    tags: ['manual-close', symbol.toLowerCase(), holdSide]
  });

  try {
    await sendTelegramMessage(`🧯 Manual close sent\n${symbol} | ${holdSide}`);
  } catch {
    // ignore telegram failure
  }

  return {
    ok: true,
    symbol,
    holdSide,
    position,
    closeResult
  };
}
