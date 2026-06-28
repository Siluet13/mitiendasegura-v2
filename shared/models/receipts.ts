import { sql } from "drizzle-orm";
import { boolean, integer, pgTable, text, timestamp, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";

export const receiptSettings = pgTable("receipt_settings", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: uuid("tenant_id").notNull(),
  ownerId: varchar("owner_id").notNull(),
  habilitado: boolean("habilitado").notNull().default(false),
  mostrarDialogo: boolean("mostrar_dialogo").notNull().default(true),
  impresionAutomatica: boolean("impresion_automatica").notNull().default(false),
  descargaAutomatica: boolean("descarga_automatica").notNull().default(false),
  tipoComprobante: text("tipo_comprobante").notNull().default("ticket_80mm"),
  prefijoNumeracion: text("prefijo_numeracion").notNull().default("V"),
  proximoNumero: integer("proximo_numero").notNull().default(1),
  logoUrl: text("logo_url"),
  nombreComercial: text("nombre_comercial"),
  razonSocial: text("razon_social"),
  cuit: text("cuit"),
  domicilio: text("domicilio"),
  telefono: text("telefono"),
  email: text("email"),
  sitioWeb: text("sitio_web"),
  mensajePie: text("mensaje_pie"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => [
  uniqueIndex("receipt_settings_tenant_id_idx").on(t.tenantId),
]);

export type ReceiptSettings = typeof receiptSettings.$inferSelect;
