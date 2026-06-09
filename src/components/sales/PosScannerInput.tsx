import { forwardRef, useCallback, useImperativeHandle, useRef, useState } from "react";
import { Scan, XCircle, CheckCircle2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { usePosScanner } from "@/hooks/usePosScanner";
import type { Product } from "@/lib/api/inventory";

// ─── Public handle ────────────────────────────────────────────────────────────

export interface PosScannerInputHandle {
  focus(): void;
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface PosScannerInputProps {
  products: Product[];
  onProductFound: (product: Product) => void;
  isActive: boolean;
}

type ScanFeedback =
  | { type: "found"; name: string }
  | { type: "notfound"; code: string }
  | null;

const FEEDBACK_DURATION_MS = 2500;

// ─── Component ───────────────────────────────────────────────────────────────

/**
 * PosScannerInput
 *
 * Permanent barcode scanner input for the POS flow.
 * Compatible with USB, Bluetooth, OTG, and wireless keyboard-emulating scanners.
 *
 * - Keeps focus automatically while the sale is open.
 * - Resolves on Enter (emitted by all hardware scanners).
 * - Searches by: codigo_barras → sku → nombre (exact, case-insensitive).
 * - Shows transient found / not-found feedback without modals.
 * - Exposes `focus()` via ref for external keyboard shortcut wiring (F2).
 */
export const PosScannerInput = forwardRef<PosScannerInputHandle, PosScannerInputProps>(
  function PosScannerInput({ products, onProductFound, isActive }, ref) {
    const [feedback, setFeedback] = useState<ScanFeedback>(null);
    const feedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const showFeedback = useCallback((fb: ScanFeedback) => {
      if (feedbackTimerRef.current !== null) clearTimeout(feedbackTimerRef.current);
      setFeedback(fb);
      feedbackTimerRef.current = setTimeout(() => setFeedback(null), FEEDBACK_DURATION_MS);
    }, []);

    const handleProductFound = useCallback(
      (product: Product) => {
        showFeedback({ type: "found", name: product.nombre });
        onProductFound(product);
      },
      [onProductFound, showFeedback],
    );

    const handleNotFound = useCallback(
      (code: string) => {
        showFeedback({ type: "notfound", code });
      },
      [showFeedback],
    );

    const { inputRef, value, handleChange, handleKeyDown, handleBlur } = usePosScanner({
      products,
      onProductFound: handleProductFound,
      onNotFound: handleNotFound,
      isActive,
    });

    // Expose focus() so parent can wire keyboard shortcuts (F2)
    useImperativeHandle(ref, () => ({
      focus() {
        inputRef.current?.focus();
      },
    }));

    return (
      <div className="space-y-1.5">
        <Label htmlFor="pos-scanner-input" className="flex items-center gap-1.5">
          <Scan className="h-3.5 w-3.5 text-primary" />
          Escanear o buscar producto
          <kbd className="ml-auto rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
            F2
          </kbd>
        </Label>
        <div className="relative">
          <Scan className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            ref={inputRef}
            id="pos-scanner-input"
            data-pos-scanner="true"
            value={value}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onBlur={handleBlur}
            placeholder="Código de barras, SKU o nombre — presioná Enter"
            className="pl-9 font-mono text-sm"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            inputMode="text"
          />
        </div>

        {feedback?.type === "found" && (
          <div className="flex items-center gap-1.5 rounded-md bg-green-50 px-3 py-1.5 text-sm text-green-700 dark:bg-green-950/40 dark:text-green-400">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span>
              Agregado: <span className="font-medium">{feedback.name}</span>
            </span>
          </div>
        )}

        {feedback?.type === "notfound" && (
          <div className="flex items-center gap-1.5 rounded-md bg-destructive/10 px-3 py-1.5 text-sm text-destructive">
            <XCircle className="h-4 w-4 shrink-0" />
            <span>
              No encontrado:{" "}
              <span className="font-mono font-semibold">{feedback.code}</span>
            </span>
          </div>
        )}
      </div>
    );
  },
);
