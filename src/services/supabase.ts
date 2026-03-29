import { createClient } from '@supabase/supabase-js';
import { env } from '../config.js';
import { BotRunRecord } from '../types.js';
import { appendWorkspaceErrorLog } from '../workspaceLog.js';

export const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

export async function insertBotRun(record: BotRunRecord) {
  const { error } = await supabase.from('bot_runs').insert({
    symbol: record.symbol,
    timeframe_trend: record.timeframeTrend,
    timeframe_entry: record.timeframeEntry,
    decision: record.decision,
    confidence: record.confidence,
    reason: record.reason,
    entry_price: record.entryPrice ?? null,
    stop_loss: record.stopLoss ?? null,
    take_profit: record.takeProfit ?? null,
    mode: record.mode,
    pnl_usdt: record.pnlUsdt ?? null,
    execution_status: record.executionStatus ?? null,
    order_payload: record.orderPayload ?? null
  });

  if (error) {
    await appendWorkspaceErrorLog({
      area: 'supabase',
      summary: 'failed to insert bot run',
      mode: record.mode,
      error: error.message,
      likelyCause: 'Supabase env/config/schema mismatch or connectivity issue',
      nextFix: 'Verify SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and run schema.sql'
    });
    throw error;
  }
}
