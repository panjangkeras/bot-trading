export function validateStopsForAction(input: {
  action: 'buy' | 'sell';
  currentPrice: number;
  stopLoss?: number;
  takeProfit?: number;
}) {
  const { action, currentPrice, stopLoss, takeProfit } = input;

  if (action === 'buy') {
    if (stopLoss !== undefined && stopLoss >= currentPrice) {
      throw new Error('invalid_long_stop_loss_above_or_equal_market');
    }
    if (takeProfit !== undefined && takeProfit <= currentPrice) {
      throw new Error('invalid_long_take_profit_below_or_equal_market');
    }
  }

  if (action === 'sell') {
    if (stopLoss !== undefined && stopLoss <= currentPrice) {
      throw new Error('invalid_short_stop_loss_below_or_equal_market');
    }
    if (takeProfit !== undefined && takeProfit >= currentPrice) {
      throw new Error('invalid_short_take_profit_above_or_equal_market');
    }
  }
}
