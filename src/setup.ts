// One-time bootstrap: makes sure wrangler.toml exists, the KV namespace is
// created and wired up, the brrr secret is set, and the Worker is deployed.
// Idempotent — safe to re-run; skips steps that are already done.
//   bun run setup

import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { createInterface } from "node:readline";

import { KV_BINDING } from "./config";

const BRRR_URL_PREFIX = "https://api.brrr.now/v1/";

async function prompt(question: string): Promise<string> {
	const rl = createInterface({ input: process.stdin, output: process.stdout });
	try {
		return await new Promise<string>((resolve) => {
			rl.question(question, (answer) => resolve(answer.trim()));
		});
	} finally {
		rl.close();
	}
}

function normalizeBrrrInput(input: string): { url: string; warning?: string } {
	const trimmed = input.trim();
	if (trimmed.startsWith(BRRR_URL_PREFIX)) return { url: trimmed };
	if (/^br_[a-z]+_[a-f0-9]+$/.test(trimmed))
		return { url: `${BRRR_URL_PREFIX}${trimmed}` };
	return {
		url: `${BRRR_URL_PREFIX}${trimmed}`,
		warning:
			"That doesn't look like a typical brrr.now key (expected `br_usr_<hex>`). Using it anyway.",
	};
}

function pipeSecret(name: string, value: string): Promise<number> {
	return new Promise((resolve) => {
		const child = spawn("bun", ["wrangler", "secret", "put", name], {
			stdio: ["pipe", "inherit", "inherit"],
		});
		child.stdin.write(value);
		child.stdin.end();
		child.on("close", (code) => resolve(code ?? 1));
	});
}

const WRANGLER_TOML = "wrangler.toml";
const WRANGLER_EXAMPLE = "wrangler.toml.example";
const PLACEHOLDER = "REPLACE_WITH_KV_NAMESPACE_ID";

function run(
	args: string[],
	opts: { capture?: boolean } = {}
): { status: number; stdout: string; stderr: string } {
	const r = spawnSync("bun", ["wrangler", ...args], {
		encoding: "utf8",
		stdio: opts.capture ? "pipe" : "inherit",
	});
	return {
		status: r.status ?? 1,
		stdout: r.stdout ?? "",
		stderr: r.stderr ?? "",
	};
}

function step(n: number, title: string) {
	console.log(`\n[${n}] ${title}`);
}

// Step 1: preflight — fail fast before any local file changes.
step(1, "preflight: wrangler + Cloudflare auth");
const wranglerVersion = run(["--version"], { capture: true });
if (wranglerVersion.status !== 0) {
	console.error("  wrangler isn't available. Did you run `bun install`?");
	process.exit(1);
}
const version = wranglerVersion.stdout.trim().split("\n")[0]?.trim() ?? "ok";
console.log(`  wrangler ${version}`);

const whoami = run(["whoami"], { capture: true });
if (whoami.status === 0 && /[\w.-]+@[\w.-]+/.test(whoami.stdout)) {
	const email = whoami.stdout.match(/[\w.-]+@[\w.-]+/)?.[0];
	console.log(`  logged in to Cloudflare as ${email}`);
} else {
	console.log("  not logged in. Opening browser for `wrangler login`...");
	const login = run(["login"]);
	if (login.status !== 0) {
		console.error("  login failed or was cancelled");
		process.exit(1);
	}
}

// Step 2: wrangler.toml from example.
step(2, "wrangler.toml");
if (!existsSync(WRANGLER_TOML)) {
	if (!existsSync(WRANGLER_EXAMPLE)) {
		console.error(`Missing ${WRANGLER_EXAMPLE}. Are you in the project root?`);
		process.exit(1);
	}
	copyFileSync(WRANGLER_EXAMPLE, WRANGLER_TOML);
	console.log(`  created ${WRANGLER_TOML} from ${WRANGLER_EXAMPLE}`);
} else {
	console.log(`  ${WRANGLER_TOML} already exists`);
}

// Step 3: KV namespace.
step(3, `KV namespace "${KV_BINDING}"`);
let toml = readFileSync(WRANGLER_TOML, "utf8");
if (toml.includes(PLACEHOLDER)) {
	console.log("  creating namespace...");
	const create = run(["kv", "namespace", "create", KV_BINDING], {
		capture: true,
	});
	if (create.status !== 0) {
		console.error(create.stderr || create.stdout);
		process.exit(1);
	}
	const idMatch = create.stdout.match(/(?:^|\s)id\s*[=:]\s*"([a-f0-9]+)"/);
	if (!idMatch) {
		console.error("Couldn't parse namespace id from wrangler output:");
		console.error(create.stdout);
		process.exit(1);
	}
	const id = idMatch[1]!;
	toml = toml.replace(PLACEHOLDER, id);
	writeFileSync(WRANGLER_TOML, toml);
	console.log(`  created namespace (id=${id}) and patched ${WRANGLER_TOML}`);
} else {
	const existingId = toml.match(
		/binding\s*=\s*"AMC_TRACKER"[\s\S]*?id\s*=\s*"([a-f0-9]+)"/
	)?.[1];
	console.log(`  already configured (id=${existingId ?? "?"})`);
}

// Step 4: brrr secret.
step(4, "BRRR_WEBHOOK_URL secret");
const secrets = run(["secret", "list"], { capture: true });
const secretsBody = secrets.stdout + secrets.stderr;
if (secrets.status === 0 && secretsBody.includes("BRRR_WEBHOOK_URL")) {
	console.log("  already set");
} else {
	console.log(
		"  Get your brrr.now webhook key from the iOS app (it looks like `br_usr_<hex>`)."
	);
	console.log("  Paste either the key or the full webhook URL — either works.");
	const input = await prompt("  > ");
	if (!input) {
		console.error("  no input given; aborting");
		process.exit(1);
	}
	const { url, warning } = normalizeBrrrInput(input);
	if (warning) console.log(`  ${warning}`);
	const code = await pipeSecret("BRRR_WEBHOOK_URL", url);
	if (code !== 0) {
		console.error("  setting secret failed");
		process.exit(1);
	}
}

// Step 5: deploy.
step(5, "deploy");
const deploy = run(["deploy"]);
if (deploy.status !== 0) {
	console.error("  deploy failed");
	process.exit(1);
}

console.log("\nDone. Next steps:");
console.log(
	"  bun run pick <showtimeId>     # add a showtime to your watchlist"
);
console.log("  bun run watchlist             # see what you're watching");
console.log(
	"  bun run check                 # dry-run check against live data"
);
