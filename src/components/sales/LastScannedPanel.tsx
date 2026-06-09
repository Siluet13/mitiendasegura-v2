import { CheckCircle2, AlertTriangle, XCircle, ScanBarcode } from "lucide-react";
import type { Product } from "@/lib/api/inventory";

const fmt = (n: number) =>
  new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" }).format(n);

// ─── Types ────────────────────────────────────────────────────────────────────

export interface LastScannedPanelProps {
  product: Product;
  currentQty: number;
  remainingStock: number;
}

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * LastScannedPanel
 *
 * Displays the last product added via the POS scanner.
 * Mount with key={timestamp} to replay the entry animation on every new scan.
 *
 * Props are all derived from the parent's state; this component is stateless.
 */
export function LastScannedPanel({
  product,
  currentQty,
  remainingStock,
}: LastScannedPanelProps) {
  const subtotal = Number(product.precio) * currentQty;

  const stockStatus: "ok" | "low" | "none" =
    remainingStock === 0 ? "none" : remainingStock <= 3 ? "low" : "ok";

  const identifier = product.codigo_barras ?? product.sku ?? null;

  return (
    <div
      className={[
        "animate-in fade-in-0 slide-in-from-top-1 duration-200",
        "rounded-lg border-2 p-3 transition-colors",
        stockStatus === "none"
          ? "border-destructive/40 bg-destructive/5"
          : stockStatus === "low"
            ? "border-amber-400/50 bg-amber-50/60 dark:bg-amber-950/20"
            : "border-green-400/50 bg-green-50/60 dark:bg-green-950/20",
      ].join(" ")}
    >
      {/* ── Header row ─────────────────────────────────────────────────── */}
      <div className="mb-2 flex items-center gap-1.5">
        <CheckCircle2
          className={[
            "h-3.5 w-3.5 shrink-0",
            stockStatus === "none" ? "text-destructive" : "text-green-600 dark:text-green-400",
          ].join(" ")}
        />
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Último escaneado
        </span>

        {stockStatus === "low" && (
          <span className="ml-auto flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:bg-amber-900/40 dark:text-amber-400">
            <AlertTriangle className="h-3 w-3" />
            Stock bajo
          </span>
        )}
        {stockStatus === "none" && (
          <span className="ml-auto flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] font-medium text-destructive">
            <XCircle className="h-3 w-3" />
            Sin stock
          </span>
        )}
      </div>

      {/* ── Product name + identifier ──────────────────────────────────── */}
      <p className="truncate text-sm font-semibold leading-snug">{product.nombre}</p>
      {identifier && (
        <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
          <ScanBarcode className="h-3 w-3 shrink-0" />
          <span className="font-mono">{identifier}</span>
          {product.codigo_barras && product.sku && (
            <span className="text-muted-foreground/60">· {product.sku}</span>
          )}
        </p>
      )}

      {/* ── Price / Qty / Subtotal grid ────────────────────────────────── */}
      <div className="mt-2.5 grid grid-cols-3 divide-x divide-border/60 rounded-md border border-border/60 bg-background/60">
        <div className="flex flex-col items-center px-2 py-1.5">
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Precio unit.
          </span>
          <span className="mt-0.5 text-sm font-medium tabular-nums">
            {fmt(Number(product.precio))}
          </span>
        </div>
        <div className="flex flex-col items-center px-2 py-1.5">
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
            En venta
          </span>
          <span className="mt-0.5 text-sm font-bold tabular-nums">× {currentQty}</span>
        </div>
        <div className="flex flex-col items-center px-2 py-1.5">
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Subtotal
          </span>
          <span className="mt-0.5 text-sm font-semibold tabular-nums text-primary">
            {fmt(subtotal)}
          </span>
        </div>
      </div>

      {/* ── Stock remaining ────────────────────────────────────────────── */}
      {stockStatus !== "ok" && (
        <p
          className={[
            "mt-1.5 text-xs font-medium",
            stockStatus === "none" ? "text-destructive" : "text-amber-700 dark:text-amber-400",
          ].join(" ")}
        >
          {stockStatus === "none"
            ? "Sin stock restante — no se pueden agregar más unidades."
            : `Stock restante: ${remainingStock} ${remainingStock === 1 ? "unidad" : "unidades"}`}
        </p>
      )}
    </div>
  );
}
