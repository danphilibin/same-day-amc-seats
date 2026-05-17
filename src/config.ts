// Shared types and KV key constants. The actual watchlist lives in KV
// (`watchlist:<id>` keys), populated via `bun run pick`. See `src/kv-cli.ts`
// (CLI side) and `src/kv-worker.ts` (Worker side).

export type ShowtimeConfig = {
	id: string | number;
	notes?: string;
	preferredSeats: string[];
	/**
	 * Minimum number of preferred seats that must be available together
	 * (same row, consecutive column numbers) to trigger a notification.
	 * Defaults to 1.
	 */
	minSeatsTogether?: number;
};

export const KV_BINDING = "AMC_TRACKER";
export const WATCHLIST_PREFIX = "watchlist:";
export const ALERTED_PREFIX = "alerted:";

export function watchlistKey(id: string | number): string {
	return `${WATCHLIST_PREFIX}${id}`;
}

export function alertedKey(id: string | number): string {
	return `${ALERTED_PREFIX}${id}`;
}
