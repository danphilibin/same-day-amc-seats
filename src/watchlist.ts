// Lists every showtime in your KV watchlist.
//   bun run watchlist

import { listWatchlist } from "./kv-cli";

const entries = await listWatchlist();

if (entries.length === 0) {
  console.log("Your watchlist is empty. Add a showtime with: bun run pick <id>");
  process.exit(0);
}

entries.sort((a, b) => String(a.id).localeCompare(String(b.id)));

console.log(`${entries.length} entr${entries.length === 1 ? "y" : "ies"}:\n`);
for (const e of entries) {
  console.log(`  ${e.id}${e.notes ? ` — ${e.notes}` : ""}`);
  console.log(`    ${e.preferredSeats.length} preferred seat(s), min ${e.minSeatsTogether ?? 1} together`);
}
