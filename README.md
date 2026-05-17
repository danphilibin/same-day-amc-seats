# Last-minute AMC seats

Cloudflare app that watches specific seats at specific AMC showtimes and pushes an iOS notification when they become available.

Ships with a local bun CLI with tools for setup and managing your watchlist. Uses https://walzr.com/empty-screenings to get same-day showtimes and seat data.

## Requirements

- Cloudflare account: https://dash.cloudflare.com/
- brrr.now account: https://brrr.now/

Your watchlist lives in Cloudflare KV and you manage it with a small terminal UI.

Once it's deployed, a Cloudflare Worker polls every 5 minutes, finds qualifying runs of your preferred seats (N or more in a row, side by side), and pushes you a [brrr.now](https://brrr.now) notification only on _new_ opportunities.

## Quick start

```sh
git clone git@github.com:danphilibin/same-day-amc-seats.git
cd same-day-amc-seats
bun install
bun run setup                 # creates KV namespace, sets brrr secret, deploys
bun run pick <showtimeId>     # add a showtime to your watchlist
```

Visit your deployed Cloudflare Worker URL to trigger a check immediately. Otherwise, every 5 minutes the Worker will check your watchlist and ping you if seats are open.

## How to get a showtime ID

```
https://www.amctheatres.com/showtimes/143135824/seats
                                      ^^^^^^^^^
```

Find them on [amctheatres.com](https://www.amctheatres.com) (pick theater → movie → time, URL contains the ID) or on [walzr.com/empty-screenings](https://walzr.com/empty-screenings) (each row has a `data-showing-id`).

## Commands

| Command                | What it does                                            |
| ---------------------- | ------------------------------------------------------- |
| `bun run setup`        | One-time bootstrap. Safe to re-run.                     |
| `bun run reset`        | Tear down the Worker, KV namespace, and local toml.     |
| `bun run pick <id>`    | Interactive seat picker. Writes to KV.                  |
| `bun run watchlist`    | List your current watchlist.                            |
| `bun run unwatch <id>` | Remove a showtime from your watchlist.                  |
| `bun run list <id>`    | Print all available seats for any showtime (read-only). |
| `bun run check [<id>]` | Dry-run the Worker's check logic locally. No pushes.    |
| `bun run deploy`       | Redeploy the Worker (after pulling code updates).       |
| `bun run tail`         | Stream logs from the deployed Worker.                   |
| `bun run dev`          | Run the Worker locally with `wrangler dev`.             |

## Using the picker

```sh
bun run pick <showtimeId>
```

- Arrow keys move the cursor; aisles are skipped automatically
- **Space** toggles a seat
- **`[`** / **`]`** decrease / increase `minSeatsTogether` (default 2)
- **`c`** clears selections
- **`q`** or **Enter** saves to KV and quits
- **Ctrl+C** cancels
- Re-running on an existing watchlist entry loads your prior selections so you can edit
- Saving with zero seats removes the entry

Legend: `.` available · `#` booked · `*` selected · cursor highlighted in reverse video.

## Local dev

```sh
cp .dev.vars.example .dev.vars   # add your BRRR_WEBHOOK_URL
bun run dev                      # serves the Worker on localhost:8787
```

Hit `http://localhost:8787/` to trigger one tick. Without `BRRR_WEBHOOK_URL`, the Worker logs notifications to stdout instead of sending them.

## Notes

- The data source (walzr.com) is a third party. Only same-day showtimes are supported right now.
- Showtime IDs expire when the showing ends; clean them up with `bun run unwatch <id>`.
- Free Cloudflare plan covers this easily.
