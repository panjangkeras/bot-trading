const lastRunMap = new Map<string, number>();

export function canRunSymbol(symbol: string, cooldownMs: number) {
  const last = lastRunMap.get(symbol) ?? 0;
  return Date.now() - last >= cooldownMs;
}

export function markRun(symbol: string) {
  lastRunMap.set(symbol, Date.now());
}
