import type { Seatmap } from "./seatmap";

export function findRuns(map: Seatmap, preferred: string[], minTogether: number): string[][] {
  const preferredSet = new Set(preferred);
  const byRow = new Map<string, { id: string; col: number }[]>();

  for (const seat of map.seats) {
    if (seat.status !== "available") continue;
    if (!preferredSet.has(seat.id)) continue;
    if (!byRow.has(seat.row)) byRow.set(seat.row, []);
    byRow.get(seat.row)!.push({ id: seat.id, col: seat.col });
  }

  const runs: string[][] = [];
  for (const seats of byRow.values()) {
    seats.sort((a, b) => a.col - b.col);
    let i = 0;
    while (i < seats.length) {
      let j = i;
      while (j + 1 < seats.length && seats[j + 1]!.col === seats[j]!.col + 1) j++;
      const len = j - i + 1;
      if (len >= minTogether) {
        runs.push(seats.slice(i, j + 1).map((s) => s.id));
      }
      i = j + 1;
    }
  }
  return runs;
}

export function formatRun(run: string[]): string {
  if (run.length === 1) return run[0]!;
  return `${run[0]}–${run[run.length - 1]}`;
}
