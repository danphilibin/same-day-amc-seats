// Interactive seat picker.
//   bun run pick <showtimeId>
// Arrow keys move; space toggles; [ / ] adjust minSeatsTogether; c clears;
// q or Enter saves directly to KV; Ctrl+C cancels without saving.
// Pre-seeds selection from the KV watchlist entry for this ID if one exists.

import { getWatchlistEntry, putWatchlistEntry, deleteWatchlistEntry } from "./kv-cli";
import { fetchSeatmap, type Seat, type Seatmap, type SeatStatus } from "./seatmap";

function die(msg: string): never {
  console.error(msg);
  process.exit(1);
}

const showtimeId: string = process.argv[2] ?? die("Usage: bun run pick <showtimeId>");
if (!process.stdin.isTTY) die("pick requires an interactive terminal");

let map: Seatmap;
try {
  map = await fetchSeatmap(showtimeId);
} catch (err) {
  die((err as Error).message);
}
const existing = await getWatchlistEntry(showtimeId);

const grid = new Map<string, Seat>();
let maxCol = 0;
for (const seat of map.seats) {
  grid.set(seat.id, seat);
  if (seat.col > maxCol) maxCol = seat.col;
}
const rowIndex = [...new Set(map.seats.map((s) => s.row))].sort();

let cursor = { row: rowIndex[0]!, col: 0 };
const firstAvail = map.seats.find((s) => s.status === "available") ?? map.seats[0];
if (firstAvail) cursor = { row: firstAvail.row, col: firstAvail.col };

const selected = new Set<string>(existing?.preferredSeats ?? []);
let minSeatsTogether = existing?.minSeatsTogether ?? 2;

const ESC = "\x1b";
const RESET = `${ESC}[0m`;
const DIM = `${ESC}[2m`;
const REVERSE = `${ESC}[7m`;
const GREEN = `${ESC}[32m`;
const CYAN = `${ESC}[36m`;
const BOLD = `${ESC}[1m`;
const HIDE_CURSOR = `${ESC}[?25l`;
const SHOW_CURSOR = `${ESC}[?25h`;
const CLEAR_HOME = `${ESC}[2J${ESC}[H`;

function cellChars(status: SeatStatus, isSelected: boolean): string {
  if (isSelected) return " *";
  if (status === "available") return " .";
  if (status === "booked") return " #";
  return "  ";
}

function cellColor(status: SeatStatus, isSelected: boolean): string {
  if (isSelected) return CYAN;
  if (status === "available") return GREEN;
  if (status === "booked") return DIM;
  return "";
}

function sortSeatIds(ids: Iterable<string>): string[] {
  return [...ids].sort((a, b) => {
    const ra = a.match(/^[A-Z]+/)?.[0] ?? "";
    const rb = b.match(/^[A-Z]+/)?.[0] ?? "";
    if (ra !== rb) return ra.localeCompare(rb);
    return Number(a.slice(ra.length)) - Number(b.slice(rb.length));
  });
}

function render(): void {
  let out = CLEAR_HOME + HIDE_CURSOR;
  out += `${BOLD}${map.theater} · ${map.time} · ${map.movie}${RESET}\n`;
  const avail = map.seats.filter((s) => s.status === "available").length;
  const existingNote = existing ? " [in watchlist]" : " [not in watchlist yet]";
  out += `${DIM}Showtime ${showtimeId} · ${avail} available${existingNote}${RESET}\n\n`;

  let header = "    ";
  for (let c = 0; c <= maxCol; c++) header += ` ${c % 10}`;
  out += `${DIM}${header}${RESET}\n`;

  for (const row of rowIndex) {
    let line = ` ${BOLD}${row}${RESET}  `;
    for (let c = 0; c <= maxCol; c++) {
      const seat = grid.get(`${row}${c}`);
      const isCursor = cursor.row === row && cursor.col === c;
      if (!seat) {
        line += isCursor ? `${REVERSE}  ${RESET}` : "  ";
        continue;
      }
      const isSelected = selected.has(seat.id);
      const chars = cellChars(seat.status, isSelected);
      if (isCursor) {
        line += `${REVERSE}${chars}${RESET}`;
      } else {
        line += `${cellColor(seat.status, isSelected)}${chars}${RESET}`;
      }
    }
    out += line + "\n";
  }

  out += "\n";
  const cursorSeat = grid.get(`${cursor.row}${cursor.col}`);
  const cursorLabel = cursorSeat
    ? `${cursor.row}${cursor.col} (${cursorSeat.status})`
    : `${cursor.row}${cursor.col} (off-grid)`;
  out += `cursor: ${BOLD}${cursorLabel}${RESET}    minSeatsTogether: ${BOLD}${minSeatsTogether}${RESET}\n`;
  out += `selected (${selected.size}): ${sortSeatIds(selected).join(", ") || "(none)"}\n\n`;
  out += `${DIM}legend:  ${GREEN}.${DIM} available  # booked  ${CYAN}*${DIM} selected${RESET}\n`;
  out += `${DIM}keys: arrows=move  space=toggle  [ ]=adjust min  c=clear  q/enter=save & quit  ctrl+c=cancel${RESET}\n`;

  process.stdout.write(out);
}

function moveCursor(dRow: number, dCol: number): void {
  let r = rowIndex.indexOf(cursor.row);
  let c = cursor.col;
  while (true) {
    r += dRow;
    c += dCol;
    if (r < 0 || r >= rowIndex.length || c < 0 || c > maxCol) return;
    const seat = grid.get(`${rowIndex[r]}${c}`);
    if (seat && seat.status !== "empty") {
      cursor = { row: rowIndex[r]!, col: c };
      return;
    }
  }
}

function toggleAtCursor(): void {
  const seat = grid.get(`${cursor.row}${cursor.col}`);
  if (!seat || seat.status === "empty") return;
  if (selected.has(seat.id)) selected.delete(seat.id);
  else selected.add(seat.id);
}

function exitTui(): void {
  process.stdout.write(SHOW_CURSOR);
  process.stdin.setRawMode(false);
  process.stdin.pause();
}

async function saveAndExit(): Promise<void> {
  exitTui();
  if (selected.size === 0) {
    if (existing) {
      console.log("\nNo seats selected. Removing this showtime from your watchlist...");
      await deleteWatchlistEntry(showtimeId);
      console.log("Removed.");
    } else {
      console.log("\nNo seats selected, nothing saved.");
    }
    process.exit(0);
  }
  const note = `${map.movie} @ ${map.theater}, ${map.time}`;
  const entry = {
    id: Number.isNaN(Number(showtimeId)) ? showtimeId : Number(showtimeId),
    notes: note,
    preferredSeats: sortSeatIds(selected),
    minSeatsTogether,
  };
  console.log(`\nSaving ${entry.preferredSeats.length} seat(s) to KV (minSeatsTogether=${minSeatsTogether})...`);
  await putWatchlistEntry(entry);
  console.log("Saved. The next 5-minute tick will pick it up.");
  process.exit(0);
}

process.stdin.setRawMode(true);
process.stdin.resume();
process.stdin.setEncoding("utf8");
render();

process.stdin.on("data", (key: string) => {
  switch (key) {
    case "\x1b[A": moveCursor(-1, 0); break;
    case "\x1b[B": moveCursor(1, 0); break;
    case "\x1b[C": moveCursor(0, 1); break;
    case "\x1b[D": moveCursor(0, -1); break;
    case " ": toggleAtCursor(); break;
    case "[": minSeatsTogether = Math.max(1, minSeatsTogether - 1); break;
    case "]": minSeatsTogether = minSeatsTogether + 1; break;
    case "c": case "C": selected.clear(); break;
    case "q": case "Q": case "\r": case "\n":
      void saveAndExit();
      return;
    case "\x03":
      exitTui();
      console.log("\ncancelled (no changes saved)");
      process.exit(130);
    default:
      return;
  }
  render();
});
