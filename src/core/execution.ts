import { env } from '../config.js';
import { SignalResult } from '../types.js';

export function shouldExecuteLive(signal: SignalResult) {
  return env.BITGET_ENABLE_LIVE_TRADING && !env.BITGET_PAPER_TRADING && signal.decision !== 'none';
}
