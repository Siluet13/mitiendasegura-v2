import type { RequestHandler } from "express";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { licenses } from "@shared/schema";
import { isLicenseActive } from "@shared/licensing";

export const checkLicense: RequestHandler = async (req, res, next) => {
  const userId = (req as any).userId as string | undefined;
  if (!userId) return next();

  // ── BYPASS TOTAL: MASTER_ADMIN_ID nunca es bloqueado por checkLicense ──────
  if (userId === process.env.MASTER_ADMIN_ID) return next();

  try {
    const [lic] = await db.select().from(licenses).where(eq(licenses.ownerId, userId));
    if (!isLicenseActive(lic?.status)) {
      return res.status(403).json({
        message: "Licencia no activa",
        licenseStatus: lic?.status ?? "pendiente",
      });
    }
    next();
  } catch {
    // En caso de error de DB, permitir el acceso para no bloquear al usuario
    next();
  }
};
