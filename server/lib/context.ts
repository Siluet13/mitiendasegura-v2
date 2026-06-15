import type { Request } from "express";

export function getCurrentUserId(req: Request): string {
  return (req as any).user?.claims?.sub ?? "";
}

export function getCurrentTenantId(req: Request): string | null {
  return (req as any).user?.claims?.sub ?? null;
}
