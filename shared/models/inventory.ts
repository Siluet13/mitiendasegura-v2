import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export const stockMovementTypeEnum = pgEnum("stock_movement_type", ["entrada", "salida"]);

export const categories = pgTable("categories", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  ownerId: varchar("owner_id").notNull(),
  tenantId: uuid("tenant_id").notNull(),
  nombre: text("nombre").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => [
  index("categories_tenant_id_idx").on(t.tenantId),
]);

export const products = pgTable("products", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  ownerId: varchar("owner_id").notNull(),
  tenantId: uuid("tenant_id").notNull(),
  categoryId: uuid("category_id").references(() => categories.id, { onDelete: "set null" }),
  nombre: text("nombre").notNull(),
  descripcion: text("descripcion"),
  sku: text("sku"),
  codigoBarras: text("codigo_barras"),
  precio: numeric("precio", { precision: 12, scale: 2 }).notNull().default("0"),
  costo: numeric("costo", { precision: 12, scale: 2 }).notNull().default("0"),
  stock: integer("stock").notNull().default(0),
  initialStock: integer("initial_stock").notNull().default(0),
  stockMinimo: integer("stock_minimo").notNull().default(0),
  activo: boolean("activo").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => [
  index("products_tenant_id_idx").on(t.tenantId),
]);

export const customers = pgTable("customers", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  ownerId: varchar("owner_id").notNull(),
  tenantId: uuid("tenant_id").notNull(),
  nombre: text("nombre").notNull(),
  telefono: text("telefono"),
  email: text("email"),
  direccion: text("direccion"),
  observaciones: text("observaciones"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => [
  index("customers_tenant_id_idx").on(t.tenantId),
]);

export const sales = pgTable("sales", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  ownerId: varchar("owner_id").notNull(),
  tenantId: uuid("tenant_id").notNull(),
  userId: varchar("user_id").notNull(),
  customerId: uuid("customer_id").references(() => customers.id, { onDelete: "set null" }),
  clientId: text("client_id"),
  receiptNumber: text("receipt_number"),
  total: numeric("total", { precision: 12, scale: 2 }).notNull().default("0"),
  // Método de pago: null = legado (tratado como cash para compatibilidad)
  paymentMethod: text("payment_method"), // "cash" | "transfer" | "account" | "mixed"
  paidAmount: numeric("paid_amount", { precision: 12, scale: 2 }),   // porción efectivo
  creditAmount: numeric("credit_amount", { precision: 12, scale: 2 }), // cuenta corriente
  transferAmount: numeric("transfer_amount", { precision: 12, scale: 2 }), // transferencia
  cashAmount: numeric("cash_amount", { precision: 12, scale: 2 }),   // impacto en caja (computado)
  observacion: text("observacion"),
  cashSessionId: uuid("cash_session_id"),
  status: text("status").notNull().default("active"),
  deletedAt: timestamp("deleted_at"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [
  index("sales_tenant_id_idx").on(t.tenantId),
  index("sales_cash_session_id_idx").on(t.cashSessionId),
  uniqueIndex("sales_tenant_client_id_idx").on(t.tenantId, t.clientId),
]);

export const saleItems = pgTable("sale_items", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  saleId: uuid("sale_id").notNull().references(() => sales.id, { onDelete: "cascade" }),
  productId: uuid("product_id").notNull().references(() => products.id),
  cantidad: integer("cantidad").notNull(),
  precioUnitario: numeric("precio_unitario", { precision: 12, scale: 2 }).notNull(),
  subtotal: numeric("subtotal", { precision: 12, scale: 2 }).notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const stockMovements = pgTable("stock_movements", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  ownerId: varchar("owner_id").notNull(),
  tenantId: uuid("tenant_id").notNull(),
  userId: varchar("user_id").notNull(),
  productId: uuid("product_id").notNull().references(() => products.id, { onDelete: "restrict" }),
  tipo: stockMovementTypeEnum("tipo").notNull(),
  cantidad: integer("cantidad").notNull(),
  observacion: text("observacion"),
  referenciaTipo: text("referencia_tipo"),
  referenciaId: uuid("referencia_id"),
  // Soft delete / anulación
  voidedAt: timestamp("voided_at"),
  voidedBy: varchar("voided_by"),
  voidReason: text("void_reason"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [
  index("stock_movements_tenant_id_idx").on(t.tenantId),
]);

export const businessSettings = pgTable("business_settings", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  ownerId: varchar("owner_id").notNull().unique(),
  nombreNegocio: text("nombre_negocio").notNull(),
  razonSocial: text("razon_social"),
  telefono: text("telefono"),
  email: text("email"),
  direccion: text("direccion"),
  ciudad: text("ciudad"),
  provincia: text("provincia"),
  pais: text("pais"),
  moneda: text("moneda").notNull().default("ARS"),
  simboloMoneda: text("simbolo_moneda").notNull().default("$"),
  decimales: integer("decimales").notNull().default(2),
  logoUrl: text("logo_url"),
  mensajeTickets: text("mensaje_tickets"),
  observaciones: text("observaciones"),
  subscriptionStatus: text("subscription_status").notNull().default("active"),
  billingCycleStart: timestamp("billing_cycle_start").notNull().defaultNow(),
  billingCycleEnd: timestamp("billing_cycle_end").notNull().default(sql`now() + INTERVAL '30 days'`),
  lastPaymentDate: timestamp("last_payment_date"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ── Cuenta Corriente ──────────────────────────────────────────────────────────
// Una fila por cliente por tenant. balance > 0 = el cliente debe dinero.
// Se incrementa al crear una venta con payment_method='account' y
// se decrementa al anular/editar dicha venta. Los pagos (Fase 2) la decrementarán.
export const customerAccounts = pgTable("customer_accounts", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: uuid("tenant_id").notNull(),
  customerId: uuid("customer_id").notNull().references(() => customers.id, { onDelete: "cascade" }),
  balance: numeric("balance", { precision: 12, scale: 2 }).notNull().default("0"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => [
  index("customer_accounts_tenant_id_idx").on(t.tenantId),
  uniqueIndex("customer_accounts_tenant_customer_idx").on(t.tenantId, t.customerId),
]);

// ── Historial de movimientos de cuenta corriente ─────────────────────────────
// Registra cada débito (venta fiada) y crédito (pago) para trazabilidad.
// amount > 0 = deuda nueva; amount < 0 = saldo reducido.
export const customerAccountMovements = pgTable("customer_account_movements", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: uuid("tenant_id").notNull(),
  customerId: uuid("customer_id").notNull().references(() => customers.id, { onDelete: "cascade" }),
  // 'sale' | 'payment' | 'sale_void' | 'sale_edit' | 'adjustment'
  type: text("type").notNull(),
  referenceId: uuid("reference_id"),
  referenceType: text("reference_type"),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  balanceAfter: numeric("balance_after", { precision: 12, scale: 2 }).notNull(),
  observacion: text("observacion"),
  // Forma de pago del cobro: "cash" | "transfer". Solo para type="payment".
  paymentMethod: text("payment_method"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [
  index("cam_tenant_id_idx").on(t.tenantId),
  index("cam_customer_id_idx").on(t.customerId),
]);

export type Category = typeof categories.$inferSelect;
export type Product = typeof products.$inferSelect;
export type Customer = typeof customers.$inferSelect;
export type CustomerAccount = typeof customerAccounts.$inferSelect;
export type CustomerAccountMovement = typeof customerAccountMovements.$inferSelect;
export type Sale = typeof sales.$inferSelect;
export type SaleItem = typeof saleItems.$inferSelect;
export type StockMovement = typeof stockMovements.$inferSelect;
export type BusinessSettings = typeof businessSettings.$inferSelect;
