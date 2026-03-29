import { strategyConfig } from '../config.js';

export interface TradeManagementState {
  version: 1;
  symbol: string;
  side: 'buy' | 'sell';
  holdSide: 'long' | 'short';
  entryPrice: number;
  initialStopLoss: number | null;
  currentStopLoss: number | null;
  tp1Price: number | null;
  tp2Price: number | null;
  trailingStopPrice: number | null;
  trailingEnabled: boolean;
  breakEvenArmed: boolean;
  tp1Hit: boolean;
  tp2Hit: boolean;
  closedSize: number;
  initialSize: number;
  remainingSize: number;
  tp1CloseRatio: number;
  tp2CloseRatio: number;
  trailAtrMultiple: number;
}

function toNumber(value: unknown, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function buildTradeManagementState(input: {
  symbol: string;
  side: 'buy' | 'sell';
  entryPrice: number;
  stopLoss?: number | null;
  takeProfit?: number | null;
  size: number;
}) {
  const holdSide = input.side === 'buy' ? 'long' : 'short';
  const risk = input.stopLoss
    ? Math.abs(input.entryPrice - input.stopLoss)
    : input.takeProfit
      ? Math.abs(input.takeProfit - input.entryPrice) / strategyConfig.targetRR
      : 0;

  const tp1Price = risk > 0
    ? holdSide === 'long'
      ? input.entryPrice + risk
      : input.entryPrice - risk
    : null;

  const tp2Price = input.takeProfit ?? null;

  return {
    version: 1,
    symbol: input.symbol,
    side: input.side,
    holdSide,
    entryPrice: input.entryPrice,
    initialStopLoss: input.stopLoss ?? null,
    currentStopLoss: input.stopLoss ?? null,
    tp1Price,
    tp2Price,
    trailingStopPrice: null,
    trailingEnabled: false,
    breakEvenArmed: false,
    tp1Hit: false,
    tp2Hit: false,
    closedSize: 0,
    initialSize: input.size,
    remainingSize: input.size,
    tp1CloseRatio: 0.5,
    tp2CloseRatio: 1,
    trailAtrMultiple: 1.2
  } satisfies TradeManagementState;
}

export function readTradeManagementState(orderPayload: Record<string, any> | null | undefined) {
  const state = orderPayload?.tradeManagement;
  if (!state || typeof state !== 'object') return null;

  return {
    version: 1,
    symbol: String(state.symbol ?? ''),
    side: state.side === 'sell' ? 'sell' : 'buy',
    holdSide: state.holdSide === 'short' ? 'short' : 'long',
    entryPrice: toNumber(state.entryPrice),
    initialStopLoss: state.initialStopLoss !== null && state.initialStopLoss !== undefined ? toNumber(state.initialStopLoss) : null,
    currentStopLoss: state.currentStopLoss !== null && state.currentStopLoss !== undefined ? toNumber(state.currentStopLoss) : null,
    tp1Price: state.tp1Price !== null && state.tp1Price !== undefined ? toNumber(state.tp1Price) : null,
    tp2Price: state.tp2Price !== null && state.tp2Price !== undefined ? toNumber(state.tp2Price) : null,
    trailingStopPrice: state.trailingStopPrice !== null && state.trailingStopPrice !== undefined ? toNumber(state.trailingStopPrice) : null,
    trailingEnabled: Boolean(state.trailingEnabled),
    breakEvenArmed: Boolean(state.breakEvenArmed),
    tp1Hit: Boolean(state.tp1Hit),
    tp2Hit: Boolean(state.tp2Hit),
    closedSize: toNumber(state.closedSize),
    initialSize: toNumber(state.initialSize),
    remainingSize: toNumber(state.remainingSize),
    tp1CloseRatio: toNumber(state.tp1CloseRatio, 0.5),
    tp2CloseRatio: toNumber(state.tp2CloseRatio, 1),
    trailAtrMultiple: toNumber(state.trailAtrMultiple, 1.2)
  } satisfies TradeManagementState;
}
