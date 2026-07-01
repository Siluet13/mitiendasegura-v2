import { sql } from "drizzle-orm";
import { index, jsonb, pgEnum, pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";

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

export const adminLogs = pgTable("admin_logs", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  tenantId: uuid("tenant_id"),
  ownerId: varchar("owner_id"),
  userId: varchar("user_id"),
  level: text("level").notNull().default("info"),
  module: varchar("module", { length: 64 }).notNull(),
  event: varchar("event", { length: 128 }).notNull(),
  message: text("message").notNull(),
  details: jsonb("details"),
}, (t) => [
  index("admin_logs_created_at_idx").on(t.createdAt),
  index("admin_logs_owner_id_idx").on(t.ownerId),
  index("admin_logs_tenant_id_idx").on(t.tenantId),
  index("admin_logs_level_idx").on(t.level),
]);

export type AdminLog = typeof adminLogs.$inferSelect;
