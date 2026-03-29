import { env } from '../config.js';
import { PerformanceSummary } from './performanceReview.js';

export async function getCerebrasPerformanceReview(summary: PerformanceSummary): Promise<string | null> {
  if (!env.CEREBRAS_ENABLED || !env.CEREBRAS_API_KEY) return null;

  const compact = {
    totals: {
      totalRuns: summary.totalRuns,
      totalSignals: summary.totalSignals,
      liveOrdersSent: summary.liveOrdersSent,
      liveExits: summary.liveExits,
      blockedCount: summary.blockedCount,
      tp1Count: summary.tp1Count,
      tp2Count: summary.tp2Count,
      breakEvenCount: summary.breakEvenCount,
      trailingCloseCount: summary.trailingCloseCount,
      stopLossCloseCount: summary.stopLossCloseCount
    },
    bySymbol: summary.bySymbol,
    recentRows: summary.recentRows.map((row) => ({
      symbol: row.symbol,
      decision: row.decision,
      execution_status: row.execution_status,
      reason: row.reason,
      pnl_usdt: row.pnl_usdt,
      created_at: row.created_at
    }))
  };

  const response = await fetch('https://api.cerebras.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.CEREBRAS_API_KEY}`
    },
    body: JSON.stringify({
      model: env.CEREBRAS_MODEL,
      temperature: 0,
      max_tokens: 220,
      messages: [
        {
          role: 'system',
          content: 'You are reviewing a live crypto trading bot. Return concise plain text with exactly 4 sections in this order: Wins:, Problems:, Adjustments:, Next Focus:. Each section max 2 short lines. Be specific to the provided data. No markdown bullets beyond simple dash lines.'
        },
        {
          role: 'user',
          content: JSON.stringify(compact)
        }
      ]
    })
  });

  if (!response.ok) throw new Error(`cerebras_review_http_${response.status}`);
  const json = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
  return json.choices?.[0]?.message?.content?.trim() ?? null;
}
