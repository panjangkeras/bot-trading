import { supabase } from './supabase.js';

export async function getTodayRealizedLossUsdt() {
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);

  const { data, error } = await supabase
    .from('bot_runs')
    .select('pnl_usdt')
    .gte('created_at', start.toISOString());

  if (error) throw error;

  return (data ?? []).reduce((sum, row) => {
    const pnl = Number((row as { pnl_usdt?: number | null }).pnl_usdt ?? 0);
    return pnl < 0 ? sum + Math.abs(pnl) : sum;
  }, 0);
}
