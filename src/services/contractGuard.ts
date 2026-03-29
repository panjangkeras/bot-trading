import { env } from '../config.js';

export function validateEntrySize() {
  if (env.BITGET_ENTRY_USDT < 5) {
    throw new Error('entry_usdt_below_minimum');
  }
  return true;
}
