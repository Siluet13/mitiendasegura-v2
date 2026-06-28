import type { ReceiptData } from "./types";
import { fmtCurrency } from "./format";

export function printReceipt(data: ReceiptData): void {
  const html = buildPrintHtml(data);
  const win = window.open("", "_blank", "width=420,height=700,toolbar=0,scrollbars=1,status=0,menubar=0");
  if (!win) {
    alert("Permitir ventanas emergentes para imprimir el comprobante.");
    return;
  }
  win.document.open();
  win.document.write(html);
  win.document.close();
  win.addEventListener("load", () => {
    win.focus();
    win.print();
  });
}

function buildPrintHtml(data: ReceiptData): string {
  const isTicket = data.tipoComprobante !== "a4";
  const widthPx = data.tipoComprobante === "ticket_58mm" ? "220px" : data.tipoComprobante === "ticket_80mm" ? "302px" : "794px";
  const fontSizePx = isTicket ? "11px" : "13px";

  const logoHtml = data.logoUrl
    ? `<img src="${esc(data.logoUrl)}" alt="logo" style="max-height:60px;max-width:90%;margin-bottom:6px;" />`
    : "";

  const itemRows = data.items.map((item) => isTicket
    ? `<tr>
        <td colspan="3" style="padding:1px 0;font-weight:600;">${esc(item.nombre)}</td>
      </tr>
      <tr>
        <td style="padding:0 0 3px 4px;">${item.cantidad} x ${fmtCurrency(item.precioUnitario, data.simboloMoneda)}</td>
        <td></td>
        <td style="text-align:right;padding:0 0 3px;">${fmtCurrency(item.subtotal, data.simboloMoneda)}</td>
      </tr>`
    : `<tr>
        <td style="padding:3px 0;">${esc(item.nombre)}</td>
        <td style="text-align:center;padding:3px 4px;">${item.cantidad}</td>
        <td style="text-align:right;padding:3px 4px;">${fmtCurrency(item.precioUnitario, data.simboloMoneda)}</td>
        <td style="text-align:right;padding:3px 0;">${fmtCurrency(item.subtotal, data.simboloMoneda)}</td>
      </tr>`
  ).join("");

  const tableHeader = isTicket
    ? ""
    : `<tr style="border-bottom:1px solid #000;">
        <th style="text-align:left;padding:3px 0;">Descripción</th>
        <th style="text-align:center;padding:3px 4px;">Cant.</th>
        <th style="text-align:right;padding:3px 4px;">Precio</th>
        <th style="text-align:right;padding:3px 0;">Subtotal</th>
      </tr>`;

  const fecha = data.fecha;
  const fechaStr = `${fecha.toLocaleDateString("es-AR")} ${fecha.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}`;

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8" />
<title>Comprobante ${esc(data.receiptNumber)}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: monospace, 'Courier New', Courier;
    font-size: ${fontSizePx};
    color: #000;
    background: #fff;
    width: ${widthPx};
    margin: 0 auto;
    padding: 8px;
  }
  .center { text-align: center; }
  .divider { border-top: 1px dashed #000; margin: 6px 0; }
  .bold { font-weight: 700; }
  table { width: 100%; border-collapse: collapse; font-size: ${fontSizePx}; }
  .total-row { font-size: ${isTicket ? "13px" : "15px"}; font-weight: 700; }
  .footer { font-style: italic; font-size: ${isTicket ? "10px" : "11px"}; }
  @media print {
    body { width: 100%; padding: 0; }
    @page { margin: 4mm; ${isTicket ? "size: " + (data.tipoComprobante === "ticket_58mm" ? "58mm" : "80mm") + " auto;" : ""} }
  }
</style>
</head>
<body>
  <div class="center">
    ${logoHtml}
    <div class="bold" style="font-size:${isTicket ? "13px" : "16px"}">${esc(data.nombreComercial)}</div>
    ${data.razonSocial ? `<div>${esc(data.razonSocial)}</div>` : ""}
    ${data.cuit ? `<div>CUIT: ${esc(data.cuit)}</div>` : ""}
    ${data.domicilio ? `<div>${esc(data.domicilio)}</div>` : ""}
    ${data.telefono ? `<div>Tel: ${esc(data.telefono)}</div>` : ""}
    ${data.email ? `<div>${esc(data.email)}</div>` : ""}
    ${data.sitioWeb ? `<div>${esc(data.sitioWeb)}</div>` : ""}
  </div>

  <div class="divider"></div>

  <div class="center">
    <div class="bold">COMPROBANTE NO FISCAL</div>
    <div>N° ${esc(data.receiptNumber)}</div>
    <div>${esc(fechaStr)}</div>
    ${data.cliente ? `<div>Cliente: ${esc(data.cliente)}</div>` : ""}
  </div>

  <div class="divider"></div>

  <table>
    ${tableHeader}
    ${itemRows}
  </table>

  <div class="divider"></div>

  <table>
    <tr class="total-row">
      <td>TOTAL</td>
      <td style="text-align:right">${fmtCurrency(data.total, data.simboloMoneda)}</td>
    </tr>
  </table>

  ${data.observacion ? `<div class="divider"></div><div style="font-size:${isTicket ? "10px" : "11px"}">Obs: ${esc(data.observacion)}</div>` : ""}

  ${data.mensajePie
    ? `<div class="divider"></div><div class="center footer">${esc(data.mensajePie)}</div>`
    : ""}
</body>
</html>`;
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
