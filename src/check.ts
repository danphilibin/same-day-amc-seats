// Runs the same fetch + findRuns logic the Worker uses, against your live KV
// watchlist. Prints qualifying runs to stdout. No KV writes, no notifications.
//   bun run check          # all entries in your watchlist
//   bun run check <id>     # just one entry from your watchlist

import { getWatchlistEntry, listWatchlist } from "./kv-cli";
import { findRuns, formatRun } from "./runs";
import { fetchSeatmap } from "./seatmap";

const arg = process.argv[2];

const entries = arg
  ? [await getWatchlistEntry(arg)].filter((e) => e !== null)
  : await listWatchlist();

if (arg && entries.length === 0) {
  console.log(`Showtime ${arg} is not in your watchlist. Add it with: bun run pick ${arg}`);
}

if (!arg && entries.length === 0) {
  console.log("Your watchlist is empty. Add a showtime with: bun run pick <id>");
}

for (const entry of entries) {
  try {
    const map = await fetchSeatmap(entry.id);
    console.log(`${map.theater} · ${map.time} · ${map.movie} (${entry.id})`);
    if (entry.notes) console.log(`  notes: ${entry.notes}`);

    const minTogether = entry.minSeatsTogether ?? 1;
    const runs = findRuns(map, entry.preferredSeats, minTogether);

    if (runs.length > 0) {
      const total = runs.flat().length;
      console.log(`  AVAILABLE: ${total} seat(s) in qualifying runs (>=${minTogether} together): ${runs.map(formatRun).join(", ")}`);
    } else {
      const allAvailable = new Set(map.seats.filter((s) => s.status === "available").map((s) => s.id));
      const lonely = entry.preferredSeats.filter((id) => allAvailable.has(id));
      const lonelyNote = lonely.length > 0 ? ` (lonely available: ${lonely.join(", ")})` : "";
      console.log(`  no qualifying runs (need >=${minTogether} together).${lonelyNote}`);
    }
  } catch (err) {
    console.log(`${entry.id}: ERROR — ${(err as Error).message}`);
  }
}
