import { sql } from "drizzle-orm";
import { index, numeric, pgTable, text, timestamp, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";

export const cashRegisterSessions = pgTable("cash_register_sessions", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: uuid("tenant_id").notNull(),
  userId: varchar("user_id").notNull(),
  openedAt: timestamp("opened_at").notNull().defaultNow(),
  closedAt: timestamp("closed_at"),
  initialAmount: numeric("initial_amount", { precision: 12, scale: 2 }).notNull().default("0"),
  finalAmount: numeric("final_amount", { precision: 12, scale: 2 }),
  totalSales: numeric("total_sales", { precision: 12, scale: 2 }),
  status: text("status").notNull().default("open"),
}, (t) => [
  index("cash_register_sessions_tenant_id_idx").on(t.tenantId),
  uniqueIndex("cash_sessions_one_open_per_user").on(t.tenantId, t.userId).where(sql`status = 'open'`),
]);

export type CashRegisterSession = typeof cashRegisterSessions.$inferSelect;
