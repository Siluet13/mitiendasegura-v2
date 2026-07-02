export type SyncLogLevel = "info" | "warning" | "error";

export async function logSyncEvent(
  event: string,
  message: string,
  level: SyncLogLevel = "info",
  details?: Record<string, unknown>,
): Promise<void> {
  try {
    await fetch("/api/log/event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event, module: "sync", message, level, details }),
    });
  } catch {}
}
