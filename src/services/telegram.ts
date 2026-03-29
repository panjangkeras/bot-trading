import { env } from '../config.js';

export async function sendTelegramMessage(text: string) {
  if (!env.TELEGRAM_ENABLED || !env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) return null;

  const response = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: env.TELEGRAM_CHAT_ID,
      text,
      disable_web_page_preview: true
    })
  });

  if (!response.ok) throw new Error(`telegram_http_${response.status}`);
  return response.json();
}

export function formatScanTelegramMessage(input: {
  realizedDailyLossUsdt: number;
  results: Array<{ symbol: string; executionStatus: string; signal: { decision: string; trend: string } ; cerebrasAdvice?: string | null }>;
}) {
  const lines = ['📡 Scan', `Loss: ${input.realizedDailyLossUsdt} USDT`];
  for (const row of input.results) {
    lines.push(`- ${row.symbol}: ${row.signal.decision} | ${row.executionStatus} | ${row.signal.trend}${row.cerebrasAdvice ? ` | ${row.cerebrasAdvice}` : ''}`);
  }
  return lines.join('\n');
}

export function formatReviewTelegramMessage(input: {
  totalRuns: number;
  totalSignals: number;
  liveOrdersSent: number;
  blockedCount: number;
  advisory: string | null;
}) {
  return [
    '🧠 Review',
    `Runs: ${input.totalRuns} | Signals: ${input.totalSignals}`,
    `Live: ${input.liveOrdersSent} | Blocked: ${input.blockedCount}`,
    input.advisory ?? 'No advisory'
  ].join('\n');
}
