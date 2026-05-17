// Tears down the live Cloudflare resources so the next `bun run setup` starts
// from scratch. Deletes: the deployed Worker, the KV namespace, and the local
// wrangler.toml. Requires typing `yes` at the confirmation prompt.
//   bun run reset

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, unlinkSync } from "node:fs";
import { createInterface } from "node:readline";

const WRANGLER_TOML = "wrangler.toml";

async function confirm(question: string): Promise<boolean> {
	const rl = createInterface({ input: process.stdin, output: process.stdout });
	try {
		const answer = await new Promise<string>((resolve) => {
			rl.question(question, resolve);
		});
		return answer.trim().toLowerCase() === "yes";
	} finally {
		rl.close();
	}
}

function run(args: string[]): number {
	const r = spawnSync("bun", ["wrangler", ...args], { stdio: "inherit" });
	return r.status ?? 1;
}

function step(n: number, title: string) {
	console.log(`\n[${n}] ${title}`);
}

console.log("This will delete:");
console.log("  - the deployed Worker `amc-tracker`");
console.log(
	"  - the KV namespace AMC_TRACKER (and all watchlist + alerted state)"
);
console.log("  - the local wrangler.toml");
console.log();

if (!(await confirm("Type 'yes' to confirm: "))) {
	console.log("Aborted.");
	process.exit(0);
}

// Grab the KV namespace id from wrangler.toml before we delete the file.
let kvId: string | null = null;
if (existsSync(WRANGLER_TOML)) {
	const toml = readFileSync(WRANGLER_TOML, "utf8");
	kvId =
		toml.match(
			/binding\s*=\s*"AMC_TRACKER"[\s\S]*?id\s*=\s*"([a-f0-9]+)"/
		)?.[1] ?? null;
}

step(1, "Deleting Worker (wrangler may prompt to confirm)");
const delStatus = run(["delete"]);
if (delStatus !== 0) {
	console.log("  worker deletion exited non-zero — it may not have existed");
}

step(
	2,
	kvId
		? `Deleting KV namespace ${kvId}`
		: "Skipping KV namespace (no id in wrangler.toml)"
);
if (kvId) {
	const kvStatus = run(["kv", "namespace", "delete", `--namespace-id=${kvId}`]);
	if (kvStatus !== 0) {
		console.log(
			"  KV namespace deletion exited non-zero — it may not have existed"
		);
	}
}

step(3, "Removing local wrangler.toml");
if (existsSync(WRANGLER_TOML)) {
	unlinkSync(WRANGLER_TOML);
	console.log("  removed");
} else {
	console.log("  wrangler.toml not present, nothing to remove");
}

console.log("\nDone. Run `bun run setup` to start fresh.");
