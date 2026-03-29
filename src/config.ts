import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
dotenv.config({ path: path.join(projectRoot, '.env') });

const boolFromEnv = z.union([z.boolean(), z.string()]).transform((value) => {
  if (typeof value === 'boolean') return value;
  const normalized = value.trim().toLowerCase();
  if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
  if (['false', '0', 'no', 'off', ''].includes(normalized)) return false;
  throw new Error(`Invalid boolean value: ${value}`);
});

const envSchema = z.object({
  BITGET_API_KEY: z.string().min(1),
  BITGET_SECRET_KEY: z.string().min(1),
  BITGET_PASSPHRASE: z.string().min(1),
  BITGET_PAPER_TRADING: boolFromEnv.default(false),
  BITGET_ENABLE_LIVE_TRADING: boolFromEnv.default(false),
  BITGET_PAIRS: z.string().default('BTCUSDT,ETHUSDT'),
  BITGET_DEFAULT_LEVERAGE: z.coerce.number().positive().default(3),
  BITGET_ENTRY_USDT: z.coerce.number().min(5).default(10),
  BITGET_DAILY_MAX_LOSS_USDT: z.coerce.number().positive().default(5),
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  CEREBRAS_ENABLED: boolFromEnv.default(false),
  CEREBRAS_API_KEY: z.string().optional(),
  CEREBRAS_MODEL: z.string().default('llama3.1-8b'),
  TELEGRAM_ENABLED: boolFromEnv.default(false),
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_CHAT_ID: z.string().optional(),
  TRADINGVIEW_WEBHOOK_SECRET: z.string().optional(),
  PORT: z.coerce.number().default(3000)
}).superRefine((data, ctx) => {
  if (data.BITGET_ENABLE_LIVE_TRADING && data.BITGET_PAPER_TRADING) {
    ctx.addIssue({ code: 'custom', message: 'BITGET_ENABLE_LIVE_TRADING=true requires BITGET_PAPER_TRADING=false', path: ['BITGET_ENABLE_LIVE_TRADING'] });
  }
  if (data.CEREBRAS_ENABLED && !data.CEREBRAS_API_KEY) {
    ctx.addIssue({ code: 'custom', message: 'CEREBRAS_API_KEY is required when CEREBRAS_ENABLED=true', path: ['CEREBRAS_API_KEY'] });
  }
  if (data.TELEGRAM_ENABLED && (!data.TELEGRAM_BOT_TOKEN || !data.TELEGRAM_CHAT_ID)) {
    ctx.addIssue({ code: 'custom', message: 'TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID are required when TELEGRAM_ENABLED=true', path: ['TELEGRAM_ENABLED'] });
  }
});

export const env = envSchema.parse(process.env);
export const pairs = env.BITGET_PAIRS.split(',').map((s) => s.trim()).filter(Boolean);

export const strategyConfig = {
  name: 'trend-pullback-intraday-v2',
  productType: 'USDT-FUTURES',
  marginCoin: 'USDT',
  trendTimeframe: '15m',
  entryTimeframe: '5m',
  emaFast: 50,
  emaSlow: 200,
  pullbackEma: 20,
  rsiLength: 14,
  rsiLongMin: 54,
  rsiShortMax: 46,
  atrLength: 14,
  atrMinRatio: 0.0012,
  atrMaxRatio: 0.02,
  targetRR: 1.6,
  nearPullbackThreshold: 0.0045,
  trendSlopeLookback: 3,
  trendSlopeMinRatio: 0.0008,
  breakoutBodyMinRatio: 0.35,
  wickToleranceRatio: 0.45,
  stopAtrBuffer: 0.35,
  maxActivePositions: 1
} as const;
