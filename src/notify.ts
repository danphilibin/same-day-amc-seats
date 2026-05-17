export type Notification = {
  title?: string;
  subtitle?: string;
  message: string;
  open_url?: string;
  thread_id?: string;
  sound?: string;
  interruption_level?: "passive" | "active" | "time-sensitive" | "critical";
};

export async function notify(webhookUrl: string | undefined, payload: Notification): Promise<void> {
  if (!webhookUrl) {
    console.log(`[notify dryrun] ${payload.title ?? "(no title)"} :: ${payload.message}`);
    return;
  }
  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error(`brrr notify failed: HTTP ${res.status} ${body}`);
  }
}
