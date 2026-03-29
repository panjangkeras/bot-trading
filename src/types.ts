export interface Candle {
  ts: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface SignalResult {
  symbol: string;
  trend: 'bullish' | 'bearish' | 'neutral';
  decision: 'long' | 'short' | 'none';
  reason: string[];
  entryPrice?: number;
  stopLoss?: number;
  takeProfit?: number;
  confidence: number;
}

export interface BotRunRecord {
  symbol: string;
  timeframeTrend: string;
  timeframeEntry: string;
  decision: 'long' | 'short' | 'none';
  confidence: number;
  reason: string[];
  entryPrice?: number | null;
  stopLoss?: number | null;
  takeProfit?: number | null;
  mode: 'paper' | 'live';
  pnlUsdt?: number | null;
  executionStatus?: string | null;
  orderPayload?: Record<string, unknown> | null;
}
