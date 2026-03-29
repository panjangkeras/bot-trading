import { env, strategyConfig } from '../config.js';

export function canTradeToday(realizedDailyLossUsdt: number) {
  return realizedDailyLossUsdt < env.BITGET_DAILY_MAX_LOSS_USDT;
}

export function canOpenMorePositions(currentOpenPositionCount: number) {
  return currentOpenPositionCount < strategyConfig.maxActivePositions;
}

export function getEntryNotionalUsdt() {
  return env.BITGET_ENTRY_USDT;
}
