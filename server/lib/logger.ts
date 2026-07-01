import { db } from "../db";
import { adminLogs } from "@shared/schema";

export type LogLevel = "info" | "warning" | "error";

export interface LogEventParams {
  level?: LogLevel;
  module: string;
  event: string;
  message: string;
  userId?: string | null;
  tenantId?: string | null;
  ownerId?: string | null;
  details?: Record<string, unknown> | null;
}

export function logEvent(params: LogEventParams): void {
  db.insert(adminLogs)
    .values({
      level: params.level ?? "info",
      module: params.module,
      event: params.event,
      message: params.message,
      userId: params.userId ?? null,
      tenantId: params.tenantId ?? null,
      ownerId: params.ownerId ?? null,
      details: (params.details ?? null) as Record<string, unknown> | null,
    })
    .catch(() => {});
}
