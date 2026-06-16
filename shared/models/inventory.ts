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
}, (t) => [
  index("customers_tenant_id_idx").on(t.tenantId),
]);

export const sales = pgTable("sales", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  ownerId: varchar("owner_id").notNull(),
  tenantId: uuid("tenant_id").notNull(),
  userId: varchar("user_id").notNull(),
  customerId: uuid("customer_id").references(() => customers.id, { onDelete: "set null" }),
  total: numeric("total", { precision: 12, scale: 2 }).notNull().default("0"),
  observacion: text("observacion"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [
  index("sales_tenant_id_idx").on(t.tenantId),
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
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type Category = typeof categories.$inferSelect;
export type Product = typeof products.$inferSelect;
export type Customer = typeof customers.$inferSelect;
export type Sale = typeof sales.$inferSelect;
export type SaleItem = typeof saleItems.$inferSelect;
export type StockMovement = typeof stockMovements.$inferSelect;
export type BusinessSettings = typeof businessSettings.$inferSelect;
