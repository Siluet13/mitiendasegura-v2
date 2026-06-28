import type { ReceiptData } from "@/lib/receipt/types";
import { fmtCurrency } from "@/lib/receipt/format";

interface Props {
  data: ReceiptData;
}

export function ReceiptTicket({ data }: Props) {
  const widthClass = data.tipoComprobante === "ticket_58mm" ? "w-[220px]" : "w-[302px]";
  const fecha = data.fecha;
  const fechaStr = `${fecha.toLocaleDateString("es-AR")} ${fecha.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}`;

  return (
    <div
      className={`${widthClass} font-mono text-[11px] leading-snug bg-white text-black p-2 select-text`}
      style={{ fontFamily: "'Courier New', Courier, monospace" }}
    >
      {/* Encabezado */}
      <div className="text-center space-y-0.5">
        {data.logoUrl && (
          <img src={data.logoUrl} alt="logo" className="max-h-12 max-w-[80%] mx-auto mb-1 object-contain" />
        )}
        <div className="text-[13px] font-bold">{data.nombreComercial}</div>
        {data.razonSocial && <div>{data.razonSocial}</div>}
        {data.cuit && <div>CUIT: {data.cuit}</div>}
        {data.domicilio && <div>{data.domicilio}</div>}
        {data.telefono && <div>Tel: {data.telefono}</div>}
        {data.email && <div>{data.email}</div>}
        {data.sitioWeb && <div>{data.sitioWeb}</div>}
      </div>

      <Divider />

      {/* Número y fecha */}
      <div className="text-center space-y-0.5">
        <div className="font-bold text-[12px]">COMPROBANTE NO FISCAL</div>
        <div>N° {data.receiptNumber}</div>
        <div>{fechaStr}</div>
        {data.cliente && <div>Cliente: {data.cliente}</div>}
      </div>

      <Divider />

      {/* Items */}
      <div className="space-y-1">
        {data.items.map((item, i) => (
          <div key={i}>
            <div className="font-semibold truncate">{item.nombre}</div>
            <div className="flex justify-between pl-2">
              <span>{item.cantidad} x {fmtCurrency(item.precioUnitario, data.simboloMoneda)}</span>
              <span>{fmtCurrency(item.subtotal, data.simboloMoneda)}</span>
            </div>
          </div>
        ))}
      </div>

      <Divider />

      {/* Total */}
      <div className="flex justify-between font-bold text-[13px]">
        <span>TOTAL</span>
        <span>{fmtCurrency(data.total, data.simboloMoneda)}</span>
      </div>

      {/* Observaciones */}
      {data.observacion && (
        <>
          <Divider />
          <div className="text-[10px]">Obs: {data.observacion}</div>
        </>
      )}

      {/* Pie */}
      {data.mensajePie && (
        <>
          <Divider />
          <div className="text-center italic text-[10px]">{data.mensajePie}</div>
        </>
      )}
    </div>
  );
}

function Divider() {
  return <div className="border-t border-dashed border-black my-1.5" />;
}
