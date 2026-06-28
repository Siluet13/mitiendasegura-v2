import type { ReceiptData } from "./types";
import { fmtCurrency } from "./format";

const M = 4;
const LH = 4.5;

export async function generateReceiptPdf(data: ReceiptData): Promise<void> {
  const { default: jsPDF } = await import("jspdf");

  const isTicket = data.tipoComprobante !== "a4";
  const pw = data.tipoComprobante === "ticket_58mm" ? 58 : data.tipoComprobante === "ticket_80mm" ? 80 : 210;
  const cw = pw - M * 2;
  const cx = pw / 2;

  const estimatedHeight = isTicket
    ? M * 2 + 50 + data.items.length * 10 + 30
    : 297;

  const doc = new jsPDF({
    format: data.tipoComprobante === "a4" ? "a4" : [pw, Math.max(estimatedHeight, 80)],
    unit: "mm",
    orientation: "portrait",
  });

  const fs = (n: number) => { doc.setFontSize(n); };
  const bold = () => doc.setFont("courier", "bold");
  const normal = () => doc.setFont("courier", "normal");
  const italic = () => doc.setFont("courier", "italic");
  const right = (text: string, y: number, x = pw - M) => doc.text(text, x, y, { align: "right" });
  const center = (text: string, y: number, maxW = cw) => doc.text(text, cx, y, { align: "center", maxWidth: maxW });
  const left = (text: string, y: number, indent = 0) => doc.text(text, M + indent, y);

  const divider = (y: number): number => {
    doc.setLineWidth(0.2);
    doc.setDrawColor(0);
    doc.line(M, y, pw - M, y);
    return y + 2;
  };

  let y = M + 4;
  const BASE_FS = isTicket ? 7 : 10;
  const TITLE_FS = isTicket ? 9 : 14;
  const TOTAL_FS = isTicket ? 9 : 13;

  doc.setFont("courier", "normal");

  bold(); fs(TITLE_FS);
  center(data.nombreComercial, y); y += LH + 1;

  normal(); fs(BASE_FS);
  if (data.razonSocial) { center(data.razonSocial, y); y += LH; }
  if (data.cuit) { center(`CUIT: ${data.cuit}`, y); y += LH; }
  if (data.domicilio) { center(data.domicilio, y); y += LH; }
  if (data.telefono) { center(`Tel: ${data.telefono}`, y); y += LH; }
  if (data.email) { center(data.email, y); y += LH; }
  if (data.sitioWeb) { center(data.sitioWeb, y); y += LH; }

  y += 2; y = divider(y);

  bold(); fs(BASE_FS + 1);
  center("COMPROBANTE NO FISCAL", y); y += LH + 1;
  normal(); fs(BASE_FS);
  center(`N\u00B0 ${data.receiptNumber}`, y); y += LH;

  const fecha = data.fecha;
  const fechaStr = `${fecha.toLocaleDateString("es-AR")} ${fecha.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}`;
  center(fechaStr, y); y += LH;
  if (data.cliente) { center(`Cliente: ${data.cliente}`, y); y += LH; }

  y += 2; y = divider(y);

  if (!isTicket) {
    bold(); fs(BASE_FS);
    left("Descripci\u00F3n", y);
    doc.text("Cant.", pw * 0.6, y, { align: "right" });
    doc.text("Precio", pw * 0.77, y, { align: "right" });
    right("Subtotal", y);
    y += LH;
    y = divider(y);
    normal();
  }

  fs(BASE_FS);
  for (const item of data.items) {
    const unitStr = fmtCurrency(item.precioUnitario, data.simboloMoneda);
    const subStr = fmtCurrency(item.subtotal, data.simboloMoneda);

    if (isTicket) {
      bold();
      const nameLines = doc.splitTextToSize(item.nombre, cw) as string[];
      for (const l of nameLines) { left(l, y); y += LH; }
      normal();
      left(`${item.cantidad} x ${unitStr}`, y, 2);
      right(subStr, y);
      y += LH + 1;
    } else {
      const nameLines = doc.splitTextToSize(item.nombre, pw * 0.55) as string[];
      const lineH = nameLines.length * LH;
      doc.text(nameLines, M, y);
      doc.text(String(item.cantidad), pw * 0.6, y, { align: "right" });
      doc.text(unitStr, pw * 0.77, y, { align: "right" });
      right(subStr, y);
      y += lineH + 1;
    }
  }

  y += 1; y = divider(y);

  bold(); fs(TOTAL_FS);
  const totalStr = fmtCurrency(data.total, data.simboloMoneda);
  if (isTicket) {
    center(`TOTAL: ${totalStr}`, y); y += LH + 2;
  } else {
    doc.text("TOTAL:", pw * 0.7, y, { align: "right" });
    right(totalStr, y); y += LH + 3;
  }

  normal(); fs(BASE_FS);

  if (data.observacion) {
    const obsLines = doc.splitTextToSize(`Obs: ${data.observacion}`, cw) as string[];
    for (const l of obsLines) { left(l, y); y += LH; }
    y += 2;
  }

  if (data.mensajePie) {
    y = divider(y);
    italic(); fs(BASE_FS - 0.5);
    const pieLines = doc.splitTextToSize(data.mensajePie, cw) as string[];
    for (const l of pieLines) { center(l, y, cw); y += LH; }
  }

  const dateStr = data.fecha.toISOString().slice(0, 10).replace(/-/g, "");
  doc.save(`comprobante-${data.receiptNumber.replace(/\//g, "-")}-${dateStr}.pdf`);
}
