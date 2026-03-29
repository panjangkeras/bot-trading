import { env, pairs, strategyConfig } from '../config.js';
import { supabase } from './supabase.js';

type RunRow = Record<string, any>;
type ReviewRow = Record<string, any>;

function esc(value: unknown) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function badgeClass(status: string) {
  if (status === 'live_order_sent') return 'green';
  if (status.startsWith('blocked_')) return 'yellow';
  if (status === 'signal_only') return 'slate';
  return 'blue';
}

export async function getDashboardData() {
  const [{ data: runs }, { data: reviews }] = await Promise.all([
    supabase.from('bot_runs').select('*').order('created_at', { ascending: false }).limit(50),
    supabase.from('bot_reviews').select('*').order('created_at', { ascending: false }).limit(10)
  ]);

  const botRuns: RunRow[] = runs ?? [];
  const botReviews: ReviewRow[] = reviews ?? [];

  const lastBySymbol = pairs.map((symbol) => ({
    symbol,
    row: botRuns.find((row) => row.symbol === symbol) ?? null
  }));

  const latestReview = botReviews[0] ?? null;

  return {
    meta: {
      strategy: strategyConfig.name,
      liveTradingEnabled: env.BITGET_ENABLE_LIVE_TRADING,
      paperTrading: env.BITGET_PAPER_TRADING,
      cerebrasEnabled: env.CEREBRAS_ENABLED,
      pairs
    },
    totals: {
      runs: botRuns.length,
      signals: botRuns.filter((row) => row.decision && row.decision !== 'none').length,
      liveOrders: botRuns.filter((row) => row.execution_status === 'live_order_sent').length,
      liveExits: botRuns.filter((row) => row.execution_status === 'live_exit_sent' || row.execution_status === 'live_close_sent').length,
      blocked: botRuns.filter((row) => String(row.execution_status ?? '').startsWith('blocked_')).length
    },
    lastBySymbol,
    latestReview,
    botRuns,
    botReviews
  };
}

export function renderDashboardHtml(input: Awaited<ReturnType<typeof getDashboardData>>) {
  const pairCards = input.lastBySymbol.map(({ symbol, row }) => `
    <div class="card pair-card">
      <div class="muted">${esc(symbol)}</div>
      <div class="big">${esc(row?.decision ?? 'n/a')}</div>
      <div class="badges">
        <span class="badge ${badgeClass(String(row?.execution_status ?? 'unknown'))}">${esc(row?.execution_status ?? 'unknown')}</span>
        <span class="badge blue">${esc(row?.mode ?? 'n/a')}</span>
      </div>
      <div class="small">trend reasons: ${esc(Array.isArray(row?.reason) ? row.reason.slice(0, 2).join(' | ') : 'n/a')}</div>
    </div>
  `).join('');

  const runRows = input.botRuns.map((row) => `
    <tr>
      <td>${esc(row.created_at)}</td>
      <td>${esc(row.symbol)}</td>
      <td>${esc(row.decision)}</td>
      <td><span class="badge ${badgeClass(String(row.execution_status ?? 'unknown'))}">${esc(row.execution_status)}</span></td>
      <td>${esc(row.mode)}</td>
      <td>${esc(Array.isArray(row.reason) ? row.reason.slice(0, 3).join(' | ') : '')}</td>
    </tr>
  `).join('');

  const reviewRows = input.botReviews.map((row) => `
    <tr>
      <td>${esc(row.created_at)}</td>
      <td><pre>${esc(String(row.advisory ?? ''))}</pre></td>
    </tr>
  `).join('');

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta http-equiv="refresh" content="60" />
  <title>Bot Trading Dashboard</title>
  <style>
    :root {
      --bg:#0b1220; --panel:#111827; --panel2:#0f172a; --line:#1f2937; --text:#e5e7eb; --muted:#94a3b8;
      --green:#14532d; --greenText:#bbf7d0; --yellow:#713f12; --yellowText:#fde68a; --blue:#1e3a8a; --blueText:#bfdbfe; --slate:#334155; --slateText:#e2e8f0;
    }
    *{box-sizing:border-box} body{font-family:Inter,Arial,sans-serif;background:linear-gradient(180deg,#0b1220,#0f172a);color:var(--text);margin:0;padding:24px}
    .wrap{max-width:1400px;margin:0 auto} .top{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;flex-wrap:wrap;margin-bottom:20px}
    h1,h2,h3{margin:0 0 10px} .muted{color:var(--muted)} .small{font-size:12px;color:var(--muted)} .big{font-size:28px;font-weight:700;margin:8px 0}
    .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px}.grid-2{display:grid;grid-template-columns:2fr 1fr;gap:16px}.grid-pairs{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px}
    .card{background:rgba(17,24,39,.95);border:1px solid var(--line);border-radius:16px;padding:16px;box-shadow:0 10px 30px rgba(0,0,0,.25)}
    .badges{display:flex;gap:8px;flex-wrap:wrap;margin:8px 0}.badge{display:inline-block;border-radius:999px;padding:4px 10px;font-size:12px;font-weight:700}
    .badge.green{background:var(--green);color:var(--greenText)} .badge.yellow{background:var(--yellow);color:var(--yellowText)} .badge.blue{background:var(--blue);color:var(--blueText)} .badge.slate{background:var(--slate);color:var(--slateText)}
    table{width:100%;border-collapse:collapse;background:transparent} th,td{border:1px solid var(--line);padding:10px;text-align:left;font-size:13px;vertical-align:top} th{background:var(--panel2)}
    pre{white-space:pre-wrap;margin:0;font-family:inherit} .section{margin-top:18px} @media (max-width: 960px){.grid-2{grid-template-columns:1fr}}
  </style>
</head>
<body>
  <div class="wrap">
    <div class="top">
      <div>
        <h1>Bot Trading Dashboard</h1>
        <div class="muted">${esc(input.meta.strategy)} • pairs: ${esc(input.meta.pairs.join(', '))}</div>
      </div>
      <div class="card" style="min-width:280px">
        <div class="badges">
          <span class="badge ${input.meta.liveTradingEnabled ? 'green' : 'yellow'}">live: ${esc(String(input.meta.liveTradingEnabled))}</span>
          <span class="badge ${input.meta.paperTrading ? 'yellow' : 'blue'}">paper: ${esc(String(input.meta.paperTrading))}</span>
          <span class="badge ${input.meta.cerebrasEnabled ? 'blue' : 'slate'}">cerebras: ${esc(String(input.meta.cerebrasEnabled))}</span>
        </div>
        <div class="small">Auto refresh every 60s</div>
      </div>
    </div>

    <div class="grid">
      <div class="card"><div class="muted">Runs</div><div class="big">${input.totals.runs}</div></div>
      <div class="card"><div class="muted">Signals</div><div class="big">${input.totals.signals}</div></div>
      <div class="card"><div class="muted">Live Orders</div><div class="big">${input.totals.liveOrders}</div></div>
      <div class="card"><div class="muted">Live Exits</div><div class="big">${input.totals.liveExits}</div></div>
      <div class="card"><div class="muted">Blocked</div><div class="big">${input.totals.blocked}</div></div>
    </div>

    <div class="section">
      <h2>Latest per Pair</h2>
      <div class="grid-pairs">${pairCards}</div>
    </div>

    <div class="section grid-2">
      <div class="card">
        <h2>Recent Runs</h2>
        <table>
          <thead><tr><th>Time</th><th>Symbol</th><th>Decision</th><th>Status</th><th>Mode</th><th>Reason</th></tr></thead>
          <tbody>${runRows || '<tr><td colspan="6">No runs yet</td></tr>'}</tbody>
        </table>
      </div>
      <div class="card">
        <h2>Latest Review</h2>
        ${input.latestReview ? `<div class="small">${esc(input.latestReview.created_at)}</div><pre>${esc(String(input.latestReview.advisory ?? ''))}</pre>` : '<div class="muted">No review yet</div>'}
      </div>
    </div>

    <div class="section card">
      <h2>Review History</h2>
      <table>
        <thead><tr><th>Time</th><th>Advisory</th></tr></thead>
        <tbody>${reviewRows || '<tr><td colspan="2">No reviews yet</td></tr>'}</tbody>
      </table>
    </div>
  </div>
</body>
</html>`;
}
