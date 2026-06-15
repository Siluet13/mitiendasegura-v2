import type { RequestHandler } from "express";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { profiles } from "@shared/schema";

export const resolveTenant: RequestHandler = async (req, _res, next) => {
  const user = (req as any).user;
  if (!req.isAuthenticated() || !user?.claims?.sub) {
    return next();
  }
  const userId: string = user.claims.sub;
  (req as any).userId = userId;
  try {
    const [profile] = await db
      .select({ tenantId: profiles.tenantId })
      .from(profiles)
      .where(eq(profiles.id, userId));
    (req as any).tenantId = profile?.tenantId ?? null;
  } catch {
    (req as any).tenantId = null;
  }
  next();
};
