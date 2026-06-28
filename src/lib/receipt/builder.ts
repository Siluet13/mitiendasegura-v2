import type { ReceiptData, ReceiptFormat, ReceiptItem } from "./types";
import type { ReceiptSettingsResponse } from "@/lib/api/receipts";
import type { BusinessSettings } from "@/lib/api/settings";
import type { SaleWithItems } from "@/lib/api/inventory";

export function buildReceiptData(
  sale: SaleWithItems,
  receiptNumber: string,
  receiptCfg: ReceiptSettingsResponse,
  businessSettings: BusinessSettings | null,
  customerName: string | null,
): ReceiptData {
  const items: ReceiptItem[] = (sale.sale_items ?? []).map((si) => ({
    nombre: si.products?.nombre ?? `Producto ${si.productId}`,
    cantidad: si.cantidad,
    precioUnitario: Number(si.precioUnitario),
    subtotal: Number(si.subtotal),
  }));

  const nombreComercial =
    receiptCfg.nombre_comercial?.trim() ||
    businessSettings?.nombre_negocio ||
    "Mi Negocio";

  const simboloMoneda = businessSettings?.simbolo_moneda ?? "$";

  return {
    receiptNumber,
    fecha: new Date(sale.createdAt),
    cliente: customerName,
    items,
    total: Number(sale.total),
    observacion: sale.observacion ?? null,
    nombreComercial,
    razonSocial: receiptCfg.razon_social ?? businessSettings?.razon_social ?? null,
    cuit: receiptCfg.cuit ?? null,
    domicilio: receiptCfg.domicilio ?? businessSettings?.direccion ?? null,
    telefono: receiptCfg.telefono ?? businessSettings?.telefono ?? null,
    email: receiptCfg.email ?? businessSettings?.email ?? null,
    sitioWeb: receiptCfg.sitio_web ?? null,
    logoUrl: receiptCfg.logo_url ?? businessSettings?.logo_url ?? null,
    mensajePie: receiptCfg.mensaje_pie ?? businessSettings?.mensaje_tickets ?? null,
    tipoComprobante: (receiptCfg.tipo_comprobante ?? "ticket_80mm") as ReceiptFormat,
    simboloMoneda,
  };
}
