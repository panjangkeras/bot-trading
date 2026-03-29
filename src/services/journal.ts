import { supabase } from './supabase.js';

export async function getJournalData(limit = 100) {
  const { data: runs, error } = await supabase
    .from('bot_runs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw error;

  const rows = runs ?? [];
  const signaled = rows.filter((row) => row.decision && row.decision !== 'none');
  const liveOrders = rows.filter((row) => row.execution_status === 'live_order_sent');
  const liveExits = rows.filter((row) => row.execution_status === 'live_exit_sent' || row.execution_status === 'live_close_sent');
  const bySymbol = Object.values(rows.reduce<Record<string, { symbol: string; runs: number; signals: number; liveOrders: number; liveExits: number }>>((acc, row) => {
    const symbol = String(row.symbol ?? 'UNKNOWN');
    acc[symbol] ??= { symbol, runs: 0, signals: 0, liveOrders: 0, liveExits: 0 };
    acc[symbol].runs += 1;
    if (row.decision && row.decision !== 'none') acc[symbol].signals += 1;
    if (row.execution_status === 'live_order_sent') acc[symbol].liveOrders += 1;
    if (row.execution_status === 'live_exit_sent' || row.execution_status === 'live_close_sent') acc[symbol].liveExits += 1;
    return acc;
  }, {}));

  return {
    totals: {
      runs: rows.length,
      signals: signaled.length,
      liveOrders: liveOrders.length,
      liveExits: liveExits.length,
      blocked: rows.filter((row) => String(row.execution_status ?? '').startsWith('blocked_')).length
    },
    bySymbol,
    recent: rows.slice(0, 30)
  };
}

export function renderJournalHtml(input: Awaited<ReturnType<typeof getJournalData>>) {
  const symbolRows = input.bySymbol.map((row) => `
    <tr>
      <td>${row.symbol}</td>
      <td>${row.runs}</td>
      <td>${row.signals}</td>
      <td>${row.liveOrders}</td>
      <td>${row.liveExits}</td>
    </tr>
  `).join('');

  const recentRows = input.recent.map((row) => `
    <tr>
      <td>${row.created_at ?? ''}</td>
      <td>${row.symbol ?? ''}</td>
      <td>${row.decision ?? ''}</td>
      <td>${row.execution_status ?? ''}</td>
      <td>${Array.isArray(row.reason) ? row.reason.slice(0, 3).join(' | ') : ''}</td>
    </tr>
  `).join('');

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Trading Journal</title>
  <style>
    body { font-family: Arial, sans-serif; background:#0b1220; color:#e5e7eb; margin:0; padding:24px; }
    .grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(180px,1fr)); gap:12px; margin-bottom:24px; }
    .card { background:#111827; border:1px solid #1f2937; border-radius:12px; padding:16px; }
    table { width:100%; border-collapse:collapse; background:#111827; margin-top:12px; }
    th,td { border:1px solid #1f2937; padding:10px; text-align:left; font-size:14px; vertical-align:top; }
    th { background:#0f172a; }
  </style>
</head>
<body>
  <h1>Trading Journal</h1>
  <div class="grid">
    <div class="card"><strong>Runs</strong><div>${input.totals.runs}</div></div>
    <div class="card"><strong>Signals</strong><div>${input.totals.signals}</div></div>
    <div class="card"><strong>Live Orders</strong><div>${input.totals.liveOrders}</div></div>
    <div class="card"><strong>Live Exits</strong><div>${input.totals.liveExits}</div></div>
    <div class="card"><strong>Blocked</strong><div>${input.totals.blocked}</div></div>
  </div>

  <h2>By Symbol</h2>
  <table>
    <thead><tr><th>Symbol</th><th>Runs</th><th>Signals</th><th>Live Orders</th><th>Live Exits</th></tr></thead>
    <tbody>${symbolRows}</tbody>
  </table>

  <h2>Recent Activity</h2>
  <table>
    <thead><tr><th>Time</th><th>Symbol</th><th>Decision</th><th>Status</th><th>Reason</th></tr></thead>
    <tbody>${recentRows}</tbody>
  </table>
</body>
</html>`;
}
