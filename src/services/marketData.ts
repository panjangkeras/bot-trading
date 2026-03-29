import { Candle } from '../types.js';
import { appendWorkspaceErrorLog } from '../workspaceLog.js';

function mapGranularity(timeframe: string) {
  switch (timeframe) {
    case '5m': return '5m';
    case '15m': return '15m';
    default: return timeframe;
  }
}

export async function getCurrentMarkPrice(symbol: string): Promise<number> {
  const url = `https://api.bitget.com/api/v2/mix/market/ticker?symbol=${encodeURIComponent(symbol)}&productType=USDT-FUTURES`;
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`ticker_http_${response.status}`);
    const json = await response.json() as { data?: Array<{ markPrice?: string; lastPr?: string }> };
    const first = json.data?.[0];
    const price = Number(first?.markPrice ?? first?.lastPr ?? 0);
    if (!price) throw new Error('ticker_price_empty');
    return price;
  } catch (error) {
    await appendWorkspaceErrorLog({
      area: 'market-data',
      summary: `failed to fetch current mark price for ${symbol}`,
      command: url,
      error: error instanceof Error ? error.message : 'unknown_ticker_error',
      likelyCause: 'Bitget ticker endpoint issue or bad symbol',
      nextFix: 'Verify symbol format and Bitget ticker response'
    });
    throw error;
  }
}

export async function getCandles(symbol: string, timeframe: string, limit = 240): Promise<Candle[]> {
  const granularity = mapGranularity(timeframe);
  const url = `https://api.bitget.com/api/v2/mix/market/candles?symbol=${encodeURIComponent(symbol)}&productType=USDT-FUTURES&granularity=${encodeURIComponent(granularity)}&limit=${limit}`;
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`market_data_http_${response.status}`);
    const json = await response.json() as { data?: string[][] };
    const rows = json.data ?? [];
    if (rows.length === 0) throw new Error('market_data_empty');
    return rows.map((row) => ({
      ts: Number(row[0]),
      open: Number(row[1]),
      high: Number(row[2]),
      low: Number(row[3]),
      close: Number(row[4]),
      volume: Number(row[5] ?? 0)
    })).sort((a, b) => a.ts - b.ts);
  } catch (error) {
    await appendWorkspaceErrorLog({
      area: 'market-data',
      summary: `failed to fetch candles for ${symbol}`,
      command: url,
      error: error instanceof Error ? error.message : 'unknown_market_data_error',
      likelyCause: 'Bitget market endpoint issue, bad symbol, bad granularity, or network problem',
      nextFix: 'Verify symbol format, endpoint response, and supported granularity values'
    });
    throw error;
  }
}
