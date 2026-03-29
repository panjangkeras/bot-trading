import { getPositions } from './bitgetCli.js';

export interface OpenPosition {
  symbol: string;
  holdSide: 'long' | 'short';
  total: number;
  openPriceAvg: number;
  markPrice: number;
  unrealizedPL: number;
  raw: Record<string, unknown>;
}

export async function getOpenPositions(): Promise<OpenPosition[]> {
  const payload = await getPositions();
  const data = (payload as { data?: Array<Record<string, unknown>> })?.data ?? [];

  return data
    .map((row): OpenPosition => ({
      symbol: String(row.symbol ?? '').toUpperCase(),
      holdSide: String(row.holdSide ?? '') === 'short' ? 'short' : 'long',
      total: Number(row.total ?? 0),
      openPriceAvg: Number(row.openPriceAvg ?? 0),
      markPrice: Number(row.markPrice ?? 0),
      unrealizedPL: Number(row.unrealizedPL ?? 0),
      raw: row
    }))
    .filter((row) => row.symbol && row.total > 0);
}
