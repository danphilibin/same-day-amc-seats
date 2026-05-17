# amc-tracker-cf — guidance for AI agents

## What this project is

A Cloudflare Worker that watches specific seats at specific AMC showtimes and pushes an iOS notification when a qualifying run of seats becomes newly available. Seat data comes from walzr.com's `/empty-screenings/fragments/seatmap/<id>` endpoint; notifications go through brrr.now.

## Architecture

- **Worker** (`src/index.ts`) — exports `scheduled` (cron) and `fetch` (manual trigger) handlers. Loads its watchlist from KV at the start of each tick.
- **Cron Trigger** — `*/5 * * * *` declared in `wrangler.toml`. Cloudflare's scheduler invokes the `scheduled` handler every 5 minutes.
- **KV namespace `AMC_TRACKER`** — holds two key families:
  - `watchlist:<id>` → JSON `ShowtimeConfig` for one watched showtime
  - `alerted:<id>` → JSON `string[]` of seat IDs we've already alerted about for that showtime
- **Local CLIs** (Bun) — `setup`, `pick`, `watchlist`, `unwatch`, `list`, `check`. The mutating ones (`pick`, `unwatch`) write to the live KV namespace by shelling out to `wrangler kv key ...`. CLIs are never deployed.

## Config lives outside the repo

Nothing user-specific is committed:

- The watchlist is in KV under `watchlist:<id>` keys, mutated via `bun run pick`.
- The brrr webhook is a wrangler secret.
- The KV namespace id is in a local `wrangler.toml` that's gitignored; `wrangler.toml.example` is the committed template.

`bun run setup` is the one-shot bootstrap: copies the example to a local `wrangler.toml`, creates the KV namespace and patches the id back into the file, prompts for the brrr secret, and deploys. It's idempotent.

Typical workflow:

```
git clone <repo>
bun install
bun run setup
bun run pick <id>            # repeat to add more
git pull && bun run deploy   # ship code updates later
```

## Data flow per tick

1. `loadWatchlist(env.AMC_TRACKER)` reads every `watchlist:*` key.
2. For each entry: fetch the walzr.com fragment, regex-parse seats.
3. `findRuns` returns groups of preferred seats in the same row with consecutive column numbers, length ≥ `minSeatsTogether`. Flatten to a `currentSet`.
4. Read `alerted:<id>` from KV. `newlyInRun = currentSet - alerted`.
5. If `newlyInRun` non-empty: POST to brrr.now with the full current `runs` list as the message.
6. Write `currentSet` back to `alerted:<id>` if it changed. Seats that leave the run get dropped — if they re-open later they re-alert.

## Important design decisions

- **Regex parse, no cheerio.** The walzr fragment is dead simple. Regex parser is ~15 lines, zero deps, fast.
- **No baseline tick on cold start.** Empty `alerted:<id>` → treat what's currently qualifying as new and alert. After `pick`, the very next cron tick produces an immediate alert if matching seats are already open.
- **Seats are keyed per-showtime, not per-theater.** Different auditoriums = different layouts, fragment exposes no room ID.
- **Adjacency is purely positional.** Two seats are "together" iff same row letter and `col diff == 1`. Aisles are encoded as `seat--empty` cells with their own column index, so col-diff-1 naturally excludes aisle-separated seats.
- **Per-showtime error isolation.** A failing fetch logs and skips that entry rather than killing the tick. `fetchSeatmap` translates walzr 404s into a friendly "only same-day showtimes are indexed" message, which surfaces in CLI errors and Worker logs.
- **CLI KV access shells out to wrangler.** Avoids managing a separate API token; the user is already authed via `wrangler login`. Slow per call but fine for an interactive picker.

## File layout

- `src/index.ts` — Worker entry: `scheduled` (cron) and `fetch` (manual) handlers
- `src/seatmap.ts` — `fetchSeatmap(id)` + regex parser; only place touching walzr.com
- `src/runs.ts` — `findRuns(map, preferred, minTogether)`
- `src/notify.ts` — brrr.now client. Dryrun (log to stdout) when `BRRR_WEBHOOK_URL` unset.
- `src/config.ts` — `ShowtimeConfig` type + KV key constants. No data.
- `src/kv-worker.ts` — Worker-side KV access (`loadWatchlist`, `getAlertedSeats`, `putAlertedSeats`)
- `src/kv-cli.ts` — CLI-side KV access via `wrangler kv key ...` subprocess
- `src/pick.ts` — interactive TUI seat picker. Reads/writes KV via kv-cli.
- `src/check.ts` — local dry-run of the Worker's check logic against the live watchlist
- `src/list.ts` — list all available seats for any showtime (no config dependency)
- `src/watchlist.ts` — list current watchlist
- `src/unwatch.ts` — remove a showtime from watchlist
- `src/setup.ts` — one-time bootstrap (idempotent)
- `wrangler.toml.example` — committed template; gets copied to gitignored `wrangler.toml` by `setup`

## Conventions

- TypeScript everywhere. Workers runtime in the Worker code; Bun runtime in the CLIs.
- Secrets via `wrangler secret put` (production) or `.dev.vars` (local dev).
- `nodejs_compat` is **not** enabled — the Worker uses only fetch + regex + KV.
- CLI scripts use `node:child_process` for spawning wrangler (not `Bun.spawn`) because spawnSync's inherited stdio plays nicest with interactive prompts.

## Things not to do

- Don't reintroduce a `config` constant with hard-coded showtimes — the watchlist is in KV (see "Config lives outside the repo"). `src/config.ts` is types and key constants only.
- Don't commit `wrangler.toml`. It's per-user. `wrangler.toml.example` is the committed template.
- Don't add cheerio or other Node-deps to the Worker — the regex parser is sufficient.
- Don't reach for Durable Objects. Cron + KV is the right shape.
- Don't hit `amctheatres.com` directly — Queue-it blocks non-browser traffic.
- Don't hardcode the brrr webhook. It's a secret; `wrangler secret put BRRR_WEBHOOK_URL`.
