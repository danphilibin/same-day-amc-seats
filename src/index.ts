import { type ShowtimeConfig } from "./config";
import { getAlertedSeats, loadWatchlist, putAlertedSeats } from "./kv-worker";
import { notify } from "./notify";
import { findRuns, formatRun } from "./runs";
import { fetchSeatmap } from "./seatmap";

export type Env = {
	AMC_TRACKER: KVNamespace;
	BRRR_WEBHOOK_URL?: string;
};

async function checkShowtime(env: Env, entry: ShowtimeConfig): Promise<void> {
	const id = String(entry.id);
	const map = await fetchSeatmap(id);
	const minTogether = entry.minSeatsTogether ?? 1;
	const runs = findRuns(map, entry.preferredSeats, minTogether);
	const currentSet = new Set(runs.flat());

	const alerted = await getAlertedSeats(env.AMC_TRACKER, id);
	const newlyInRun = [...currentSet].filter((s) => !alerted.has(s));

	const header = `${map.theater} · ${map.time} · ${map.movie} (${id})`;
	const runsStr = runs.length > 0 ? runs.map(formatRun).join(", ") : "(none)";

	if (newlyInRun.length === 0) {
		console.log(`${header} — no new runs. current: ${runsStr}`);
	} else {
		console.log(
			`${header} — NEW seats: ${newlyInRun.join(", ")} | current: ${runsStr}`
		);
		await notify(env.BRRR_WEBHOOK_URL, {
			title: `Seats opened: ${map.movie}`,
			subtitle: `${map.theater} · ${map.time}`,
			message: `${currentSet.size} seats together (>=${minTogether}): ${runsStr}`,
			open_url: `https://www.amctheatres.com/showtimes/${id}/seats`,
			thread_id: `amc-${id}`,
			interruption_level: "time-sensitive",
		});
	}

	if (
		currentSet.size !== alerted.size ||
		[...currentSet].some((s) => !alerted.has(s))
	) {
		await putAlertedSeats(env.AMC_TRACKER, id, currentSet);
	}
}

async function runAll(env: Env): Promise<void> {
	const watchlist = await loadWatchlist(env.AMC_TRACKER);
	if (watchlist.length === 0) {
		console.log(
			"watchlist is empty — nothing to check. Add showtimes with `bun run pick <id>`."
		);
		return;
	}
	for (const entry of watchlist) {
		try {
			await checkShowtime(env, entry);
		} catch (err) {
			console.error(`${entry.id}: ERROR — ${(err as Error).message}`);
		}
	}
}

export default {
	async scheduled(_event, env: Env, ctx) {
		ctx.waitUntil(runAll(env));
	},
	async fetch(_req, env: Env) {
		await runAll(env);
		return new Response("ok\n");
	},
} satisfies ExportedHandler<Env>;
