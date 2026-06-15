import type { Request } from "express";

export function getCurrentUserId(req: Request): string {
  return (req as any).userId ?? (req as any).user?.claims?.sub ?? "";
}

export function getCurrentTenantId(req: Request): string | null {
  return (req as any).tenantId ?? null;
}

export function requireTenant(req: Request): { userId: string; tenantId: string | null } {
  return {
    userId: getCurrentUserId(req),
    tenantId: getCurrentTenantId(req),
  };
}
