export function estimateTaxReserve(revenueCents: number, ratePct: number): number {
  if (!Number.isFinite(ratePct) || ratePct <= 0 || revenueCents <= 0) return 0;
  return Math.round((revenueCents * ratePct) / 100);
}
