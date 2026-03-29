import crypto from 'node:crypto';
import { env } from '../config.js';
import { appendWorkspaceErrorLog } from '../workspaceLog.js';

const BITGET_BASE_URL = 'https://api.bitget.com';

function signBitget(params: {
  timestamp: string;
  method: string;
  requestPath: string;
  body?: string;
}) {
  const payload = `${params.timestamp}${params.method.toUpperCase()}${params.requestPath}${params.body ?? ''}`;
  return crypto.createHmac('sha256', env.BITGET_SECRET_KEY).update(payload).digest('base64');
}

async function bitgetPrivateRequest<T>(input: {
  method: 'GET' | 'POST';
  path: string;
  body?: Record<string, unknown>;
}) {
  const bodyText = input.body ? JSON.stringify(input.body) : '';
  const timestamp = Date.now().toString();
  const signature = signBitget({
    timestamp,
    method: input.method,
    requestPath: input.path,
    body: bodyText
  });

  const response = await fetch(`${BITGET_BASE_URL}${input.path}`, {
    method: input.method,
    headers: {
      'Content-Type': 'application/json',
      'ACCESS-KEY': env.BITGET_API_KEY,
      'ACCESS-SIGN': signature,
      'ACCESS-TIMESTAMP': timestamp,
      'ACCESS-PASSPHRASE': env.BITGET_PASSPHRASE,
      locale: 'en-US'
    },
    body: input.method === 'POST' ? bodyText : undefined
  });

  const text = await response.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }

  if (!response.ok || (json && json.code && json.code !== '00000')) {
    await appendWorkspaceErrorLog({
      area: 'bitget-rest',
      summary: `bitget private request failed: ${input.method} ${input.path}`,
      command: `${input.method} ${input.path}`,
      mode: env.BITGET_PAPER_TRADING ? 'paper' : 'live',
      error: JSON.stringify(json),
      likelyCause: 'Bitget private REST auth, account mode, or payload mismatch',
      nextFix: 'Inspect path, signature, account mode, and required fields for this endpoint'
    });
    throw new Error(`bitget_rest_error:${response.status}:${JSON.stringify(json)}`);
  }

  return json as T;
}

export async function closePositionMarket(input: {
  symbol: string;
  holdSide: 'long' | 'short';
  productType: string;
}) {
  return bitgetPrivateRequest({
    method: 'POST',
    path: '/api/v2/mix/order/close-positions',
    body: {
      symbol: input.symbol,
      holdSide: input.holdSide,
      productType: input.productType
    }
  });
}

export async function placeReduceOnlyCloseOrder(input: {
  symbol: string;
  holdSide: 'long' | 'short';
  productType: string;
  marginCoin: string;
  size: string;
}) {
  const side = input.holdSide === 'long' ? 'buy' : 'sell';

  return bitgetPrivateRequest({
    method: 'POST',
    path: '/api/v2/mix/order/place-order',
    body: {
      symbol: input.symbol,
      productType: input.productType,
      marginCoin: input.marginCoin,
      marginMode: 'crossed',
      side,
      holdSide: input.holdSide,
      tradeSide: 'close',
      orderType: 'market',
      size: input.size,
      reduceOnly: 'YES'
    }
  });
}
