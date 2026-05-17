// Removes a showtime from your KV watchlist (and clears its alerted state).
//   bun run unwatch <id>

import { deleteWatchlistEntry, getWatchlistEntry } from "./kv-cli";

const id = process.argv[2];
if (!id) {
  console.error("Usage: bun run unwatch <showtimeId>");
  process.exit(1);
}

const existing = await getWatchlistEntry(id);
if (!existing) {
  console.log(`Showtime ${id} is not in your watchlist; nothing to do.`);
  process.exit(0);
}

console.log(`Removing ${id}${existing.notes ? ` (${existing.notes})` : ""}...`);
await deleteWatchlistEntry(id);
console.log("Removed.");
