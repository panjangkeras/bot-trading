import { appendWorkspaceErrorLog } from '../workspaceLog.js';

export interface ContractSpec {
  symbol: string;
  productType: string;
  minTradeNum: number;
  sizeMultiplier: number;
  minTradeUSDT?: number;
  pricePlace?: number;
  volumePlace?: number;
}

function toNumber(value: unknown, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export async function getContractSpec(symbol: string, productType = 'USDT-FUTURES'): Promise<ContractSpec> {
  const url = `https://api.bitget.com/api/v2/mix/market/contracts?symbol=${encodeURIComponent(symbol)}&productType=${encodeURIComponent(productType)}`;

  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`contract_spec_http_${response.status}`);

    const json = await response.json() as {
      code?: string;
      msg?: string;
      data?: Array<Record<string, unknown>>;
    };

    const row = json.data?.[0];
    if (!row) throw new Error(`contract_spec_empty:${json.code ?? 'no_code'}:${json.msg ?? 'no_msg'}`);

    return {
      symbol,
      productType,
      minTradeNum: toNumber(row.minTradeNum, 0),
      sizeMultiplier: toNumber(row.sizeMultiplier, 0),
      minTradeUSDT: toNumber(row.minTradeUSDT, 0),
      pricePlace: toNumber(row.pricePlace, 0),
      volumePlace: toNumber(row.volumePlace, 0)
    };
  } catch (error) {
    await appendWorkspaceErrorLog({
      area: 'bitget-contracts',
      summary: `failed to fetch contract spec for ${symbol}`,
      command: url,
      error: error instanceof Error ? error.message : 'unknown_contract_spec_error',
      likelyCause: 'Bitget contract endpoint issue, bad symbol, or unsupported product type',
      nextFix: 'Verify symbol, productType, and inspect raw Bitget contract response'
    });
    throw error;
  }
}

function countDecimals(value: number) {
  if (!Number.isFinite(value)) return 0;
  const text = String(value);
  if (!text.includes('.')) return 0;
  return text.split('.')[1]?.length ?? 0;
}

function floorToStep(value: number, step: number) {
  if (step <= 0) return value;
  return Math.floor(value / step) * step;
}

function normalizePrecision(value: number, decimals: number) {
  return Number(value.toFixed(Math.max(0, decimals)));
}

export function computeOrderSizeFromEntryUsdt(input: {
  entryUsdt: number;
  price: number;
  leverage: number;
  contract: ContractSpec;
}) {
  const { entryUsdt, price, leverage, contract } = input;
  if (entryUsdt <= 0) throw new Error('invalid_entry_usdt');
  if (price <= 0) throw new Error('invalid_price');
  if (leverage <= 0) throw new Error('invalid_leverage');

  const notional = entryUsdt * leverage;
  const rawBaseQty = notional / price;
  const step = contract.sizeMultiplier > 0 ? contract.sizeMultiplier : contract.minTradeNum;
  const minQty = contract.minTradeNum > 0 ? contract.minTradeNum : step;
  const decimals = contract.volumePlace && contract.volumePlace >= 0 ? contract.volumePlace : countDecimals(step);

  let size = floorToStep(rawBaseQty, step);
  size = normalizePrecision(size, decimals);

  if (minQty > 0 && size < minQty) {
    size = normalizePrecision(minQty, decimals);
  }

  if (step > 0 && size < step) {
    size = normalizePrecision(step, decimals);
  }

  const finalNotionalEstimate = size * price;

  return {
    entryUsdt,
    leverage,
    price,
    rawBaseQty,
    size,
    sizeText: decimals > 0 ? size.toFixed(decimals) : String(size),
    minQty,
    step,
    finalNotionalEstimate
  };
}
