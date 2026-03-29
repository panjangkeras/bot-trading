import { supabase } from './supabase.js';

export interface PerformanceSummary {
  totalRuns: number;
  totalSignals: number;
  liveOrdersSent: number;
  liveExits: number;
  blockedCount: number;
  tp1Count: number;
  tp2Count: number;
  breakEvenCount: number;
  trailingCloseCount: number;
  stopLossCloseCount: number;
  symbols: string[];
  bySymbol: Array<{
    symbol: string;
    runs: number;
    entries: number;
    exits: number;
    tp1Hits: number;
    tp2Hits: number;
    stopLossHits: number;
    trailingHits: number;
  }>;
  recentRows: Array<Record<string, unknown>>;
}

export async function getPerformanceSummary(limit = 200): Promise<PerformanceSummary> {
  const { data, error } = await supabase
    .from('bot_runs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw error;

  const rows = data ?? [];
  const totalRuns = rows.length;
  const totalSignals = rows.filter((row) => row.decision && row.decision !== 'none').length;
  const liveOrdersSent = rows.filter((row) => row.execution_status === 'live_order_sent').length;
  const liveExits = rows.filter((row) => ['live_exit_sent', 'live_close_sent', 'trade_management_action'].includes(String(row.execution_status ?? ''))).length;
  const blockedCount = rows.filter((row) => String(row.execution_status ?? '').startsWith('blocked_')).length;
  const tp1Count = rows.filter((row) => Array.isArray(row.reason) && row.reason.includes('tp1_partial_close')).length;
  const tp2Count = rows.filter((row) => Array.isArray(row.reason) && row.reason.includes('tp2_full_close')).length;
  const breakEvenCount = rows.filter((row) => {
    const payload = row.order_payload as Record<string, any> | null;
    return Boolean(payload?.tradeManagement?.breakEvenArmed);
  }).length;
  const trailingCloseCount = rows.filter((row) => Array.isArray(row.reason) && row.reason.includes('trailing_stop_close')).length;
  const stopLossCloseCount = rows.filter((row) => Array.isArray(row.reason) && row.reason.includes('stop_loss_close')).length;
  const symbols = [...new Set(rows.map((row) => String(row.symbol)).filter(Boolean))];

  const bySymbol = symbols.map((symbol) => {
    const subset = rows.filter((row) => String(row.symbol) === symbol);
    return {
      symbol,
      runs: subset.length,
      entries: subset.filter((row) => row.execution_status === 'live_order_sent').length,
      exits: subset.filter((row) => ['live_exit_sent', 'live_close_sent', 'trade_management_action'].includes(String(row.execution_status ?? ''))).length,
      tp1Hits: subset.filter((row) => Array.isArray(row.reason) && row.reason.includes('tp1_partial_close')).length,
      tp2Hits: subset.filter((row) => Array.isArray(row.reason) && row.reason.includes('tp2_full_close')).length,
      stopLossHits: subset.filter((row) => Array.isArray(row.reason) && row.reason.includes('stop_loss_close')).length,
      trailingHits: subset.filter((row) => Array.isArray(row.reason) && row.reason.includes('trailing_stop_close')).length
    };
  });

  return {
    totalRuns,
    totalSignals,
    liveOrdersSent,
    liveExits,
    blockedCount,
    tp1Count,
    tp2Count,
    breakEvenCount,
    trailingCloseCount,
    stopLossCloseCount,
    symbols,
    bySymbol,
    recentRows: rows.slice(0, 40)
  };
}
