import type { ReceiptData } from "@/lib/receipt/types";
import { fmtCurrency } from "@/lib/receipt/format";

interface Props {
  data: ReceiptData;
}

export function ReceiptA4({ data }: Props) {
  const fecha = data.fecha;
  const fechaStr = `${fecha.toLocaleDateString("es-AR")} ${fecha.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}`;

  return (
    <div className="w-[794px] min-h-[600px] bg-white text-black text-[13px] p-8 select-text" style={{ fontFamily: "Arial, sans-serif" }}>

      {/* Encabezado */}
      <div className="flex items-start justify-between mb-6">
        <div className="space-y-0.5">
          {data.logoUrl && (
            <img src={data.logoUrl} alt="logo" className="max-h-16 max-w-[200px] mb-2 object-contain" />
          )}
          <div className="text-xl font-bold">{data.nombreComercial}</div>
          {data.razonSocial && <div className="text-gray-600">{data.razonSocial}</div>}
          {data.cuit && <div>CUIT: {data.cuit}</div>}
          {data.domicilio && <div>{data.domicilio}</div>}
          {data.telefono && <div>Tel: {data.telefono}</div>}
          {data.email && <div>{data.email}</div>}
          {data.sitioWeb && <div>{data.sitioWeb}</div>}
        </div>

        <div className="text-right border border-gray-300 rounded p-4 min-w-[200px]">
          <div className="font-bold text-base">COMPROBANTE NO FISCAL</div>
          <div className="text-gray-500 text-xs mt-0.5">Comprobante interno</div>
          <div className="text-2xl font-mono font-bold mt-2">{data.receiptNumber}</div>
          <div className="text-sm mt-1">{fechaStr}</div>
        </div>
      </div>

      {/* Cliente */}
      {data.cliente && (
        <div className="mb-4 p-3 bg-gray-50 rounded border border-gray-200">
          <span className="text-gray-500 text-xs uppercase tracking-wider">Cliente</span>
          <div className="font-medium">{data.cliente}</div>
        </div>
      )}

      {/* Tabla de items */}
      <table className="w-full border-collapse mb-4">
        <thead>
          <tr className="border-b-2 border-black">
            <th className="text-left py-2 font-semibold">Descripción</th>
            <th className="text-center py-2 font-semibold w-16">Cant.</th>
            <th className="text-right py-2 font-semibold w-28">Precio unit.</th>
            <th className="text-right py-2 font-semibold w-28">Subtotal</th>
          </tr>
        </thead>
        <tbody>
          {data.items.map((item, i) => (
            <tr key={i} className="border-b border-gray-200">
              <td className="py-2">{item.nombre}</td>
              <td className="py-2 text-center">{item.cantidad}</td>
              <td className="py-2 text-right">{fmtCurrency(item.precioUnitario, data.simboloMoneda)}</td>
              <td className="py-2 text-right font-medium">{fmtCurrency(item.subtotal, data.simboloMoneda)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-black">
            <td colSpan={3} className="py-3 text-right font-bold text-base">TOTAL</td>
            <td className="py-3 text-right font-bold text-base">{fmtCurrency(data.total, data.simboloMoneda)}</td>
          </tr>
        </tfoot>
      </table>

      {/* Observaciones */}
      {data.observacion && (
        <div className="mb-4 p-3 bg-gray-50 rounded border border-gray-200">
          <span className="text-gray-500 text-xs uppercase tracking-wider">Observaciones</span>
          <div className="mt-1">{data.observacion}</div>
        </div>
      )}

      {/* Pie */}
      {data.mensajePie && (
        <div className="mt-8 pt-4 border-t border-gray-300 text-center text-gray-500 text-xs italic">
          {data.mensajePie}
        </div>
      )}

      <div className="mt-8 pt-4 border-t border-gray-200 text-center text-gray-400 text-[10px]">
        Este comprobante no tiene validez fiscal.
      </div>
    </div>
  );
}
