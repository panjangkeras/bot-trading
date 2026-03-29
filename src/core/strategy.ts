import { strategyConfig } from '../config.js';
import { atr, closes, ema, rsi } from '../indicators.js';
import { Candle, SignalResult } from '../types.js';

function last<T>(arr: T[]): T | undefined {
  return arr[arr.length - 1];
}

function candleBodyRatio(candle: Candle) {
  const range = candle.high - candle.low;
  if (range <= 0) return 0;
  return Math.abs(candle.close - candle.open) / range;
}

function upperWickRatio(candle: Candle) {
  const range = candle.high - candle.low;
  if (range <= 0) return 0;
  const upper = candle.high - Math.max(candle.open, candle.close);
  return upper / range;
}

function lowerWickRatio(candle: Candle) {
  const range = candle.high - candle.low;
  if (range <= 0) return 0;
  const lower = Math.min(candle.open, candle.close) - candle.low;
  return lower / range;
}

export function evaluateTrendPullback(symbol: string, trendCandles: Candle[], entryCandles: Candle[]): SignalResult {
  const trendCloses = closes(trendCandles);
  const entryCloses = closes(entryCandles);
  const trendFast = ema(trendCloses, strategyConfig.emaFast);
  const trendSlow = ema(trendCloses, strategyConfig.emaSlow);
  const pullback = ema(entryCloses, strategyConfig.pullbackEma);
  const momentum = rsi(entryCloses, strategyConfig.rsiLength);
  const entryAtr = atr(entryCandles, strategyConfig.atrLength);

  const price = last(entryCloses);
  const trendFastNow = last(trendFast);
  const trendSlowNow = last(trendSlow);
  const pullbackNow = last(pullback);
  const rsiNow = last(momentum);
  const atrNow = last(entryAtr);

  const result: SignalResult = {
    symbol,
    trend: 'neutral',
    decision: 'none',
    reason: [],
    confidence: 0
  };

  if (!price || !trendFastNow || !trendSlowNow || !pullbackNow || !rsiNow || !atrNow) {
    result.reason.push('insufficient_data');
    return result;
  }

  const latest = entryCandles[entryCandles.length - 1];
  const previous = entryCandles[entryCandles.length - 2];
  const swing = entryCandles.slice(-5, -1);
  const slopeRef = trendFast[trendFast.length - 1 - strategyConfig.trendSlopeLookback];

  if (!latest || !previous || swing.length === 0 || !slopeRef) {
    result.reason.push('missing_confirmation_candles');
    return result;
  }

  const atrRatio = atrNow / price;
  const nearPullback = Math.abs(price - pullbackNow) / price <= strategyConfig.nearPullbackThreshold;
  const bodyRatio = candleBodyRatio(latest);
  const breakoutStrength = Math.abs(latest.close - previous.close) / price;
  const trendSlopeRatio = Math.abs(trendFastNow - slopeRef) / price;
  const volatilityOk = atrRatio >= strategyConfig.atrMinRatio && atrRatio <= strategyConfig.atrMaxRatio;
  const bodyOk = bodyRatio >= strategyConfig.breakoutBodyMinRatio;
  const slopeOk = trendSlopeRatio >= strategyConfig.trendSlopeMinRatio;

  if (volatilityOk) result.reason.push('atr_ok');
  if (nearPullback) result.reason.push('near_pullback_ema');
  if (bodyOk) result.reason.push('body_ok');
  if (slopeOk) result.reason.push('trend_slope_ok');

  if (trendFastNow > trendSlowNow) {
    result.trend = 'bullish';
    result.reason.push('trend_bullish');

    const bullishConfirm = latest.close > latest.open && latest.close > previous.high;
    const wickOk = upperWickRatio(latest) <= strategyConfig.wickToleranceRatio;
    const rsiOk = rsiNow >= strategyConfig.rsiLongMin;

    if (rsiOk) result.reason.push('rsi_supportive');
    if (bullishConfirm) result.reason.push('bullish_confirmation');
    if (wickOk) result.reason.push('wick_ok');

    if (nearPullback && rsiOk && bullishConfirm && wickOk && bodyOk && volatilityOk && slopeOk && breakoutStrength > 0.0008) {
      const swingLow = Math.min(...swing.map((c) => c.low));
      const stopLoss = Math.min(swingLow, latest.low) - atrNow * strategyConfig.stopAtrBuffer;
      const risk = price - stopLoss;
      if (risk > 0) {
        result.decision = 'long';
        result.entryPrice = price;
        result.stopLoss = stopLoss;
        result.takeProfit = price + risk * strategyConfig.targetRR;
        result.confidence = 0.78;
      }
    }
  } else if (trendFastNow < trendSlowNow) {
    result.trend = 'bearish';
    result.reason.push('trend_bearish');

    const bearishConfirm = latest.close < latest.open && latest.close < previous.low;
    const wickOk = lowerWickRatio(latest) <= strategyConfig.wickToleranceRatio;
    const rsiOk = rsiNow <= strategyConfig.rsiShortMax;

    if (rsiOk) result.reason.push('rsi_supportive');
    if (bearishConfirm) result.reason.push('bearish_confirmation');
    if (wickOk) result.reason.push('wick_ok');

    if (nearPullback && rsiOk && bearishConfirm && wickOk && bodyOk && volatilityOk && slopeOk && breakoutStrength > 0.0008) {
      const swingHigh = Math.max(...swing.map((c) => c.high));
      const stopLoss = Math.max(swingHigh, latest.high) + atrNow * strategyConfig.stopAtrBuffer;
      const risk = stopLoss - price;
      if (risk > 0) {
        result.decision = 'short';
        result.entryPrice = price;
        result.stopLoss = stopLoss;
        result.takeProfit = price - risk * strategyConfig.targetRR;
        result.confidence = 0.78;
      }
    }
  }

  if (result.decision === 'none') {
    result.reason.push('no_valid_entry');
  }

  return result;
}
