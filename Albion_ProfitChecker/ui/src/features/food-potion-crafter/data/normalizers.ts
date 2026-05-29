function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function normalizeCityPrices(value: unknown): Record<string, number> {
  if (!isRecord(value)) return {};
  const prices: Record<string, number> = {};
  for (const [city, raw] of Object.entries(value)) {
    const price = toFiniteNumber(raw);
    if (price !== null && price > 0) prices[city] = price;
  }
  return prices;
}

/**
 * Normalize a per-city price payload into a Map<itemId, { city: price }>.
 * Tolerant of:
 *   - { items: [{ itemId, prices: { city: price } }] }
 *   - [ [itemId, { city: price }] ] tuple arrays
 *   - [ { itemId, prices: {...} } ] bare arrays
 * Returns an empty Map on any bad / missing input. Never throws.
 */
export function normalizeCityPricePayload(payload: unknown): Map<string, Record<string, number>> {
  const map = new Map<string, Record<string, number>>();

  const list = Array.isArray(payload)
    ? payload
    : isRecord(payload) && Array.isArray(payload.items)
      ? payload.items
      : [];

  for (const entry of list) {
    if (Array.isArray(entry)) {
      const itemId = String(entry[0] || "").trim();
      const prices = normalizeCityPrices(entry[1]);
      if (itemId && Object.keys(prices).length) map.set(itemId, prices);
      continue;
    }
    if (!isRecord(entry)) continue;
    const itemId = String(entry.itemId || "").trim();
    if (!itemId) continue;
    const prices = normalizeCityPrices(entry.prices);
    if (Object.keys(prices).length) map.set(itemId, prices);
  }

  return map;
}

/** Read the optional generatedAt timestamp from a price payload. */
export function readGeneratedAt(payload: unknown): string | null {
  if (isRecord(payload) && typeof payload.generatedAt === "string") return payload.generatedAt;
  return null;
}
