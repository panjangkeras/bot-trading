import { TradeManagementState } from './tradeState.js';
import { OpenPosition } from './positions.js';

export function syncTradeStateWithPosition(state: TradeManagementState, position: OpenPosition) {
  const next = { ...state };

  if (position.total < state.remainingSize) {
    const diff = state.remainingSize - position.total;
    next.closedSize = Math.min(state.initialSize, state.closedSize + diff);
    next.remainingSize = position.total;

    if (!next.tp1Hit && next.closedSize > 0) {
      next.tp1Hit = true;
      next.breakEvenArmed = true;
      next.trailingEnabled = true;
      next.currentStopLoss = next.entryPrice;
      next.trailingStopPrice = next.entryPrice;
    }

    if (position.total <= 0) {
      next.tp2Hit = true;
      next.remainingSize = 0;
    }
  }

  return next;
}
