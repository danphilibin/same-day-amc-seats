// CLI-side KV access — shells out to `wrangler kv key ...` against the remote
// (deployed) namespace. Used by pick / check / watchlist / unwatch.

import { spawnSync } from "node:child_process";

import {
  alertedKey,
  KV_BINDING,
  watchlistKey,
  WATCHLIST_PREFIX,
  type ShowtimeConfig,
} from "./config";

function wrangler(args: string[]): { stdout: string; stderr: string; status: number } {
  const r = spawnSync("bun", ["wrangler", ...args], { encoding: "utf8" });
  return { stdout: r.stdout ?? "", stderr: r.stderr ?? "", status: r.status ?? 1 };
}

export async function kvGet(key: string): Promise<unknown | null> {
  const r = wrangler(["kv", "key", "get", `--binding=${KV_BINDING}`, "--remote", key]);
  if (r.status !== 0) {
    if (r.stderr.toLowerCase().includes("not found") || r.stdout.toLowerCase().includes("not found")) {
      return null;
    }
    throw new Error(`wrangler kv key get failed: ${r.stderr || r.stdout}`);
  }
  const body = r.stdout.trim();
  if (!body) return null;
  try {
    return JSON.parse(body);
  } catch {
    return body;
  }
}

export async function kvPut(key: string, value: unknown): Promise<void> {
  const payload = typeof value === "string" ? value : JSON.stringify(value);
  const r = wrangler([
    "kv",
    "key",
    "put",
    `--binding=${KV_BINDING}`,
    "--remote",
    key,
    payload,
  ]);
  if (r.status !== 0) {
    throw new Error(`wrangler kv key put failed: ${r.stderr || r.stdout}`);
  }
}

export async function kvDelete(key: string): Promise<void> {
  const r = wrangler([
    "kv",
    "key",
    "delete",
    `--binding=${KV_BINDING}`,
    "--remote",
    key,
  ]);
  if (r.status !== 0 && !(r.stderr + r.stdout).toLowerCase().includes("not found")) {
    throw new Error(`wrangler kv key delete failed: ${r.stderr || r.stdout}`);
  }
}

export async function kvListKeys(prefix: string): Promise<string[]> {
  const r = wrangler([
    "kv",
    "key",
    "list",
    `--binding=${KV_BINDING}`,
    "--remote",
    `--prefix=${prefix}`,
  ]);
  if (r.status !== 0) {
    throw new Error(`wrangler kv key list failed: ${r.stderr || r.stdout}`);
  }
  const body = r.stdout.trim();
  if (!body) return [];
  try {
    const parsed = JSON.parse(body) as Array<{ name?: string } | string>;
    return parsed.map((k) => (typeof k === "string" ? k : (k.name ?? ""))).filter(Boolean);
  } catch {
    return [];
  }
}

// --- watchlist-specific helpers ---

export async function getWatchlistEntry(id: string | number): Promise<ShowtimeConfig | null> {
  const v = await kvGet(watchlistKey(id));
  if (v && typeof v === "object") return v as ShowtimeConfig;
  return null;
}

export async function putWatchlistEntry(entry: ShowtimeConfig): Promise<void> {
  await kvPut(watchlistKey(entry.id), entry);
}

export async function deleteWatchlistEntry(id: string | number): Promise<void> {
  await kvDelete(watchlistKey(id));
  // Also drop alerted state so a re-add starts fresh.
  await kvDelete(alertedKey(id));
}

export async function listWatchlist(): Promise<ShowtimeConfig[]> {
  const keys = await kvListKeys(WATCHLIST_PREFIX);
  const entries: ShowtimeConfig[] = [];
  for (const k of keys) {
    const v = await kvGet(k);
    if (v && typeof v === "object") entries.push(v as ShowtimeConfig);
  }
  return entries;
}
