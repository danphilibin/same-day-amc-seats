// Local-only CLI: `bun run list <showtimeId>` prints all available seats for
// a showtime so you can pick which ones to add to `src/config.ts`.
// Not deployed to Cloudflare.

import { availableSeats, fetchSeatmap, type Seatmap } from "./seatmap";

const showtimeId = process.argv[2];
if (!showtimeId) {
  console.error("Usage: bun run list <showtimeId>");
  process.exit(1);
}

let map: Seatmap;
try {
  map = await fetchSeatmap(showtimeId);
} catch (err) {
  console.error((err as Error).message);
  process.exit(1);
}
const avail = availableSeats(map);

console.log(`${map.theater} · ${map.time} · ${map.movie}`);
console.log(`Showtime ID: ${map.showtimeId}`);
console.log(`Available seats (${avail.length}):`);

const byRow = new Map<string, string[]>();
for (const seat of avail) {
  if (!byRow.has(seat.row)) byRow.set(seat.row, []);
  byRow.get(seat.row)!.push(seat.id);
}
for (const row of [...byRow.keys()].sort()) {
  const ids = byRow.get(row)!.sort((a, b) => Number(a.slice(row.length)) - Number(b.slice(row.length)));
  console.log(`  ${row}: ${ids.join(", ")}`);
}
