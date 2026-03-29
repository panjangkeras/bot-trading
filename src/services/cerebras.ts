import { env } from '../config.js';
import { SignalResult } from '../types.js';

export async function getCerebrasAdvice(signal: SignalResult): Promise<string | null> {
  if (!env.CEREBRAS_ENABLED || !env.CEREBRAS_API_KEY) return null;

  const response = await fetch('https://api.cerebras.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.CEREBRAS_API_KEY}`
    },
    body: JSON.stringify({
      model: env.CEREBRAS_MODEL,
      temperature: 0,
      max_tokens: 30,
      messages: [
        {
          role: 'system',
          content: 'Return exactly one short line under 12 words. Advisory only. No markdown. No explanations. Examples: wait bearish trend | hold no valid entry | avoid weak setup'
        },
        {
          role: 'user',
          content: `symbol=${signal.symbol};trend=${signal.trend};decision=${signal.decision};reasons=${signal.reason.join('|')};confidence=${signal.confidence}`
        }
      ]
    })
  });

  if (!response.ok) throw new Error(`cerebras_http_${response.status}`);
  const json = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
  return json.choices?.[0]?.message?.content?.trim() ?? null;
}
