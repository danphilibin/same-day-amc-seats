export type SeatStatus = "available" | "booked" | "empty";

export type Seat = {
  id: string;
  row: string;
  col: number;
  status: SeatStatus;
};

export type Seatmap = {
  showtimeId: string;
  movie: string;
  theater: string;
  time: string;
  seats: Seat[];
};

const FRAGMENT_URL = "https://walzr.com/empty-screenings/fragments/seatmap";

export async function fetchSeatmap(showtimeId: string | number): Promise<Seatmap> {
  const url = `${FRAGMENT_URL}/${showtimeId}`;
  const res = await fetch(url, {
    headers: { "User-Agent": "amc-tracker (personal seat watcher)" },
  });
  if (res.status === 404) {
    throw new Error(
      `Showtime ${showtimeId} not found. Empty Screenings only indexes same-day showtimes — try one that's playing later today.`,
    );
  }
  if (!res.ok) {
    throw new Error(`Failed to fetch seatmap for ${showtimeId}: HTTP ${res.status}`);
  }
  return parseSeatmap(String(showtimeId), await res.text());
}

// The fragment is small, server-rendered, and predictable, so regex parsing
// is enough — no HTML parser dependency.
export function parseSeatmap(showtimeId: string, html: string): Seatmap {
  if (!html.includes('class="seat-detail"')) {
    throw new Error(`No seat map found for showtime ${showtimeId} (page may be empty or showing has ended)`);
  }

  const kicker = html.match(/<div class="caption-kicker">([^<]+)<\/div>/)?.[1]?.trim() ?? "";
  const [timeRaw, theaterRaw] = kicker.split("·").map((s) => s.trim());
  const movie = html.match(/<h2>([^<]+)<\/h2>/)?.[1]?.trim() ?? "";

  const seats: Seat[] = [];
  const seatRe = /<span class="seat seat--(available|booked|empty)" title="([A-Za-z]+)(\d+)"/g;
  for (const m of html.matchAll(seatRe)) {
    const status = m[1] as SeatStatus;
    const row = m[2]!;
    const col = Number(m[3]);
    seats.push({ id: `${row}${col}`, row, col, status });
  }

  return {
    showtimeId,
    movie,
    theater: theaterRaw ?? "",
    time: timeRaw ?? "",
    seats,
  };
}

export function availableSeats(map: Seatmap): Seat[] {
  return map.seats.filter((s) => s.status === "available");
}
