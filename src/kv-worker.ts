// Worker-side KV access (uses the KVNamespace binding).

import { alertedKey, watchlistKey, WATCHLIST_PREFIX, type ShowtimeConfig } from "./config";

export async function loadWatchlist(kv: KVNamespace): Promise<ShowtimeConfig[]> {
  const list = await kv.list({ prefix: WATCHLIST_PREFIX });
  const entries: ShowtimeConfig[] = [];
  for (const key of list.keys) {
    const v = await kv.get(key.name, "json");
    if (v && typeof v === "object") entries.push(v as ShowtimeConfig);
  }
  return entries;
}

export async function getAlertedSeats(kv: KVNamespace, showtimeId: string): Promise<Set<string>> {
  const raw = await kv.get(alertedKey(showtimeId), "json");
  if (!Array.isArray(raw)) return new Set();
  return new Set(raw as string[]);
}

export async function putAlertedSeats(
  kv: KVNamespace,
  showtimeId: string,
  seats: Set<string>,
): Promise<void> {
  await kv.put(alertedKey(showtimeId), JSON.stringify([...seats]));
}

export async function deleteAlertedSeats(kv: KVNamespace, showtimeId: string): Promise<void> {
  await kv.delete(alertedKey(showtimeId));
}

// Re-export for convenience.
export { watchlistKey };
