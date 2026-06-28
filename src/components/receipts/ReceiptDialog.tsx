import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Printer, Download, X, Loader2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { getReceiptSettings } from "@/lib/api/receipts";
import { getBusinessSettings } from "@/lib/api/settings";
import { getSaleWithItems } from "@/lib/api/inventory";
import { buildReceiptData } from "@/lib/receipt/builder";
import { printReceipt } from "@/lib/receipt/print";
import { generateReceiptPdf } from "@/lib/receipt/pdf";
import { ReceiptTicket } from "./ReceiptTicket";
import { ReceiptA4 } from "./ReceiptA4";

interface Props {
  saleId: string | null;
  receiptNumber: string | null;
  customerName: string | null;
  onClose: () => void;
}

export function ReceiptDialog({ saleId, receiptNumber, customerName, onClose }: Props) {
  const open = !!saleId && !!receiptNumber;
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

  const receiptData =
    open && sale && receiptCfg && receiptNumber
      ? buildReceiptData(sale, receiptNumber, receiptCfg, bizSettings ?? null, customerName)
      : null;

  useEffect(() => {
    if (!receiptData || !receiptCfg || autoActioned.current) return;
    autoActioned.current = true;

    if (receiptCfg.impresion_automatica) {
      try { printReceipt(receiptData); } catch { /* silenced */ }
    }
    if (receiptCfg.descarga_automatica) {
      generateReceiptPdf(receiptData).catch(() => {
        toast.error("No se pudo generar el PDF automáticamente");
      });
    }
  }, [receiptData, receiptCfg]);

  useEffect(() => {
    if (!open) { autoActioned.current = false; }
  }, [open]);

  function handlePrint() {
    if (!receiptData) return;
    try {
      printReceipt(receiptData);
    } catch (e) {
      toast.error("Error al imprimir. Verificá que los pop-ups estén permitidos.");
    }
  }

  async function handlePdf() {
    if (!receiptData) return;
    try {
      await generateReceiptPdf(receiptData);
    } catch (e) {
      toast.error("Error al generar el PDF");
    }
  }

  const isA4 = receiptCfg?.tipo_comprobante === "a4";

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
