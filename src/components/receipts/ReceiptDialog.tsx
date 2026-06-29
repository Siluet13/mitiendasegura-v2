import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Printer, Download, X, Loader2, AlertTriangle, Info } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { getReceiptSettings, type ReceiptSettingsResponse } from "@/lib/api/receipts";
import { getBusinessSettings } from "@/lib/api/settings";
import { getSaleWithItems } from "@/lib/api/inventory";
import { buildReceiptData } from "@/lib/receipt/builder";
import { printReceipt } from "@/lib/receipt/print";
import { generateReceiptPdf } from "@/lib/receipt/pdf";
import { ReceiptTicket } from "./ReceiptTicket";
import { ReceiptA4 } from "./ReceiptA4";

const FALLBACK_RECEIPT_CFG: ReceiptSettingsResponse = {
  id: "",
  tenant_id: "",
  habilitado: false,
  mostrar_dialogo: true,
  impresion_automatica: false,
  descarga_automatica: false,
  tipo_comprobante: "ticket_80mm",
  prefijo_numeracion: "V",
  proximo_numero: 1,
  logo_url: null,
  nombre_comercial: null,
  razon_social: null,
  cuit: null,
  domicilio: null,
  telefono: null,
  email: null,
  sitio_web: null,
  mensaje_pie: null,
  created_at: "",
  updated_at: "",
};

interface Props {
  saleId: string | null;
  receiptNumber: string | null;
  customerName: string | null;
  onClose: () => void;
  skipAutoActions?: boolean;
}

export function ReceiptDialog({ saleId, receiptNumber, customerName, onClose, skipAutoActions }: Props) {
  const open = !!saleId;
  const autoActioned = useRef(false);

  const { data: receiptCfg, isLoading: loadingCfg } = useQuery({
    queryKey: ["receipt_settings"],
    queryFn: getReceiptSettings,
    staleTime: 300_000,
    enabled: open,
  });

  const { data: bizSettings } = useQuery({
    queryKey: ["business_settings"],
    queryFn: getBusinessSettings,
    staleTime: 300_000,
    enabled: open,
  });

  const { data: sale, isLoading: loadingSale, isError: saleError } = useQuery({
    queryKey: ["sales", saleId],
    queryFn: () => (saleId ? getSaleWithItems(saleId) : Promise.resolve(null)),
    enabled: open,
    staleTime: 0,
  });

  const isLoading = loadingCfg || loadingSale;

  const effectiveCfg = receiptCfg ?? FALLBACK_RECEIPT_CFG;

  const receiptData =
    open && sale
      ? buildReceiptData(sale, receiptNumber ?? "", effectiveCfg, bizSettings ?? null, customerName)
      : null;

  useEffect(() => {
    if (!receiptData || !receiptCfg || autoActioned.current || skipAutoActions) return;
    autoActioned.current = true;

    if (receiptCfg.impresion_automatica) {
      try { printReceipt(receiptData); } catch { /* silenced */ }
    }
    if (receiptCfg.descarga_automatica) {
      generateReceiptPdf(receiptData).catch(() => {
        toast.error("No se pudo generar el PDF automáticamente");
      });
    }
  }, [receiptData, receiptCfg, skipAutoActions]);

  useEffect(() => {
    if (!open) { autoActioned.current = false; }
  }, [open]);

  function handlePrint() {
    if (!receiptData) return;
    try {
      printReceipt(receiptData);
    } catch {
      toast.error("Error al imprimir. Verificá que los pop-ups estén permitidos.");
    }
  }

  async function handlePdf() {
    if (!receiptData) return;
    try {
      await generateReceiptPdf(receiptData);
    } catch {
      toast.error("Error al generar el PDF");
    }
  }

  const isA4 = effectiveCfg.tipo_comprobante === "a4";
  const noReceiptNumber = open && !receiptNumber;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className={isA4 ? "max-w-3xl" : "max-w-sm"}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span>Comprobante</span>
            {receiptNumber && (
              <span className="text-sm font-mono font-normal text-muted-foreground">
                {receiptNumber}
              </span>
            )}
          </DialogTitle>
        </DialogHeader>

        {noReceiptNumber && (
          <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              Esta venta no tiene número de comprobante asignado (la emisión estaba deshabilitada
              cuando se realizó). Podés imprimirla igualmente.
            </p>
          </div>
        )}

        <ScrollArea className="max-h-[65vh]">
          <div className="flex justify-center py-2">
            {isLoading ? (
              <div className="flex items-center gap-2 py-12 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
                <span className="text-sm">Cargando comprobante...</span>
              </div>
            ) : saleError ? (
              <div className="flex flex-col items-center gap-2 py-12 text-muted-foreground">
                <AlertTriangle className="h-8 w-8 text-yellow-500" />
                <p className="text-sm">No se pudo cargar el detalle de la venta.</p>
                <p className="text-xs">La venta fue registrada correctamente.</p>
              </div>
            ) : receiptData ? (
              receiptData.tipoComprobante === "a4"
                ? <ReceiptA4 data={receiptData} />
                : <ReceiptTicket data={receiptData} />
            ) : null}
          </div>
        </ScrollArea>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={onClose} className="gap-2">
            <X className="h-4 w-4" />
            Cerrar
          </Button>
          <Button
            variant="outline"
            onClick={handlePrint}
            disabled={!receiptData}
            className="gap-2"
          >
            <Printer className="h-4 w-4" />
            Imprimir
          </Button>
          <Button
            onClick={handlePdf}
            disabled={!receiptData}
            className="gap-2"
          >
            <Download className="h-4 w-4" />
            Descargar PDF
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
