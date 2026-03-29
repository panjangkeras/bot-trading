import { Candle } from './types.js';

export function ema(values: number[], period: number): number[] {
  if (values.length === 0) return [];
  const k = 2 / (period + 1);
  const result: number[] = [values[0]];
  for (let i = 1; i < values.length; i += 1) {
    result.push(values[i] * k + result[i - 1] * (1 - k));
  }
  return result;
}

export function rsi(values: number[], period: number): number[] {
  if (values.length <= period) return [];
  const output = new Array(values.length).fill(NaN);
  let gains = 0;
  let losses = 0;

  for (let i = 1; i <= period; i += 1) {
    const diff = values[i] - values[i - 1];
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;
  output[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);

  for (let i = period + 1; i < values.length; i += 1) {
    const diff = values[i] - values[i - 1];
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    output[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }

  return output;
}

export function closes(candles: Candle[]): number[] {
  return candles.map((c) => c.close);
}

export function highs(candles: Candle[]): number[] {
  return candles.map((c) => c.high);
}

export function lows(candles: Candle[]): number[] {
  return candles.map((c) => c.low);
}

export function atr(candles: Candle[], period: number): number[] {
  if (candles.length === 0) return [];

  const trueRanges = candles.map((candle, index) => {
    if (index === 0) return candle.high - candle.low;
    const prevClose = candles[index - 1]?.close ?? candle.close;
    return Math.max(
      candle.high - candle.low,
      Math.abs(candle.high - prevClose),
      Math.abs(candle.low - prevClose)
    );
  });

  if (trueRanges.length < period) return new Array(candles.length).fill(NaN);

  const output = new Array(candles.length).fill(NaN);
  let sum = 0;
  for (let i = 0; i < period; i += 1) {
    sum += trueRanges[i];
  }
  output[period - 1] = sum / period;

  for (let i = period; i < trueRanges.length; i += 1) {
    output[i] = ((output[i - 1] as number) * (period - 1) + trueRanges[i]) / period;
  }

  return output;
}
