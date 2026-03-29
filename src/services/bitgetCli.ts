import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { env, strategyConfig } from '../config.js';
import { logger } from '../logger.js';
import { appendWorkspaceErrorLog } from '../workspaceLog.js';

const execFileAsync = promisify(execFile);

function resolveBgcBinary() {
  const localBin = path.resolve(process.cwd(), 'node_modules', '.bin', 'bgc');
  return existsSync(localBin) ? localBin : 'bgc';
}

function buildEnv(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    BITGET_API_KEY: env.BITGET_API_KEY,
    BITGET_SECRET_KEY: env.BITGET_SECRET_KEY,
    BITGET_PASSPHRASE: env.BITGET_PASSPHRASE
  };
}

export async function runBgc(args: string[]) {
  const fullArgs = env.BITGET_PAPER_TRADING ? ['--paper-trading', ...args] : args;
  const bgcBinary = resolveBgcBinary();
  logger.info('bgc', fullArgs.join(' '));
  try {
    const { stdout, stderr } = await execFileAsync(bgcBinary, fullArgs, { env: buildEnv() });
    if (stderr?.trim()) logger.warn(stderr.trim());
    return stdout;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown_bgc_error';
    const stderr = typeof error === 'object' && error && 'stderr' in error ? String((error as { stderr?: string }).stderr ?? '') : '';
    const stdout = typeof error === 'object' && error && 'stdout' in error ? String((error as { stdout?: string }).stdout ?? '') : '';
    await appendWorkspaceErrorLog({
      area: 'bitget-cli',
      summary: 'bgc command failed',
      command: `bgc ${fullArgs.join(' ')}`,
      mode: env.BITGET_PAPER_TRADING ? 'paper' : 'live',
      error: [message, stderr.trim(), stdout.trim()].filter(Boolean).join(' | '),
      likelyCause: 'Bitget CLI, credentials, parameters, contract size, or environment mismatch',
      nextFix: 'Inspect bgc stderr/stdout, verify order size format, account mode, and credentials'
    });
    throw error;
  }
}

export async function getPositions() {
  const stdout = await runBgc(['futures', 'futures_get_positions', '--productType', strategyConfig.productType, '--pretty']);
  return JSON.parse(stdout);
}

export async function getOpenOrders() {
  const stdout = await runBgc(['futures', 'futures_get_orders', '--productType', strategyConfig.productType, '--status', 'open', '--pretty']);
  return JSON.parse(stdout);
}

export async function setLeverage(symbol: string, leverage: number) {
  const stdout = await runBgc([
    'futures',
    'futures_set_leverage',
    '--productType', strategyConfig.productType,
    '--symbol', symbol,
    '--marginCoin', strategyConfig.marginCoin,
    '--leverage', String(leverage),
    '--pretty'
  ]);
  return JSON.parse(stdout);
}

export async function placeMarketOrder(input: {
  symbol: string;
  side: 'buy' | 'sell';
  size: string;
  presetStopLossPrice?: string;
  presetStopSurplusPrice?: string;
}) {
  const order: Record<string, string> = {
    symbol: input.symbol,
    productType: strategyConfig.productType,
    marginCoin: strategyConfig.marginCoin,
    side: input.side,
    tradeSide: 'open',
    orderType: 'market',
    size: input.size,
    reduceOnly: 'NO'
  };

  if (input.presetStopLossPrice) {
    order.presetStopLossPrice = input.presetStopLossPrice;
  }

  if (input.presetStopSurplusPrice) {
    order.presetStopSurplusPrice = input.presetStopSurplusPrice;
  }

  const stdout = await runBgc([
    'futures',
    'futures_place_order',
    '--orders', JSON.stringify([order]),
    '--pretty'
  ]);
  return JSON.parse(stdout);
}
