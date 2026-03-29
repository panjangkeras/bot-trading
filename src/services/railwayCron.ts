export function isCronAuthorized(token?: string, expected?: string) {
  if (!expected) return true;
  return token === expected;
}
