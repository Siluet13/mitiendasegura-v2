export type ReceiptFormat = "ticket_58mm" | "ticket_80mm" | "a4";

export interface ReceiptConfig {
  habilitado: boolean;
  mostrarDialogo: boolean;
  impresionAutomatica: boolean;
  descargaAutomatica: boolean;
  tipoComprobante: ReceiptFormat;
  prefijoNumeracion: string;
  proximoNumero: number;
  logoUrl?: string | null;
  nombreComercial?: string | null;
  razonSocial?: string | null;
  cuit?: string | null;
  domicilio?: string | null;
  telefono?: string | null;
  email?: string | null;
  sitioWeb?: string | null;
  mensajePie?: string | null;
}

export interface ReceiptItem {
  nombre: string;
  cantidad: number;
  precioUnitario: number;
  subtotal: number;
}

export interface ReceiptData {
  receiptNumber: string;
  fecha: Date;
  cliente: string | null;
  items: ReceiptItem[];
  total: number;
  observacion: string | null;
  nombreComercial: string;
  razonSocial?: string | null;
  cuit?: string | null;
  domicilio?: string | null;
  telefono?: string | null;
  email?: string | null;
  sitioWeb?: string | null;
  logoUrl?: string | null;
  mensajePie?: string | null;
  tipoComprobante: ReceiptFormat;
  simboloMoneda: string;
}
