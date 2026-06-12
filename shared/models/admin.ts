import { sql } from "drizzle-orm";
import { pgEnum, pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";

export const licenseStatusEnum = pgEnum("license_status", [
  "activa",
  "pendiente",
  "suspendida",
  "vencida",
]);

export const licenses = pgTable("licenses", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  ownerId: varchar("owner_id").notNull().unique(),
  status: licenseStatusEnum("status").notNull().default("pendiente"),
  activatedAt: timestamp("activated_at"),
  expiresAt: timestamp("expires_at"),
  suspendedAt: timestamp("suspended_at"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type License = typeof licenses.$inferSelect;
export type LicenseStatus = "activa" | "pendiente" | "suspendida" | "vencida";
