import type { RequestHandler } from "express";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { licenses } from "@shared/schema";

export const checkLicense: RequestHandler = async (req, res, next) => {
  const user = req.user as any;
  const ownerId = user?.claims?.sub;
  if (!ownerId) return next();

  if (ownerId === process.env.MASTER_ADMIN_ID) return next();

  try {
    const [lic] = await db.select().from(licenses).where(eq(licenses.ownerId, ownerId));
    if (!lic || lic.status !== "activa") {
      return res.status(403).json({
        message: "Licencia no activa",
        licenseStatus: lic?.status ?? "pendiente",
      });
    }
    next();
  } catch {
    next();
  }
};
