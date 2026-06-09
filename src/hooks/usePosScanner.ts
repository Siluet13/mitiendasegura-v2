import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Product } from "@/lib/api/inventory";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface UsePosScannerOptions {
  products: Product[];
  onProductFound: (product: Product) => void;
  onNotFound: (code: string) => void;
  isActive: boolean;
}

export interface UsePosScannerReturn {
  inputRef: React.RefObject<HTMLInputElement | null>;
  value: string;
  handleChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  handleBlur: () => void;
  barcodeMap: Map<string, Product>;
}

// ─── Hook ────────────────────────────────────────────────────────────────────

/**
 * usePosScanner
 *
 * Manages a barcode scanner input field compatible with:
 * - USB HID keyboard-emulating scanners
 * - Bluetooth scanners
 * - OTG Android scanners
 * - Wireless scanners (keyboard emulation)
 *
 * Scanners emit the barcode characters followed by Enter (\n or \r).
 * This hook listens for the Enter key and resolves the product using a
 * three-level lookup in priority order:
 *
 *   1. codigo_barras — exact match (primary scanner flow)
 *   2. sku           — exact match, case-insensitive (manual typing fallback)
 *   3. nombre        — exact match, case-insensitive (quick manual search)
 *
 * Future extensions: partial name search, QR, industrial scanners, shortcuts.
 */
export function usePosScanner({
  products,
  onProductFound,
  onNotFound,
  isActive,
}: UsePosScannerOptions): UsePosScannerReturn {
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState("");

  // ── Lookup maps (active products only) ────────────────────────────────────

  // O(1) by codigo_barras
  const barcodeMap = useMemo(() => {
    const m = new Map<string, Product>();
    for (const p of products) {
      if (p.activo && p.codigo_barras) {
        m.set(p.codigo_barras.trim(), p);
      }
    }
    return m;
  }, [products]);

  // O(1) by sku (lowercased)
  const skuMap = useMemo(() => {
    const m = new Map<string, Product>();
    for (const p of products) {
      if (p.activo && p.sku) {
        m.set(p.sku.trim().toLowerCase(), p);
      }
    }
    return m;
  }, [products]);

  // O(1) by nombre (lowercased)
  const nameMap = useMemo(() => {
    const m = new Map<string, Product>();
    for (const p of products) {
      if (p.activo) {
        m.set(p.nombre.trim().toLowerCase(), p);
      }
    }
    return m;
  }, [products]);

  // ── Auto-focus when dialog opens ──────────────────────────────────────────

  useEffect(() => {
    if (!isActive) return;
    const t = setTimeout(() => inputRef.current?.focus(), 120);
    return () => clearTimeout(t);
  }, [isActive]);

  // ── Resolve code → product (barcode → sku → nombre) ──────────────────────

  const resolve = useCallback(
    (raw: string): Product | undefined => {
      const trimmed = raw.trim();
      if (!trimmed) return undefined;

      // 1. Exact barcode match
      const byBarcode = barcodeMap.get(trimmed);
      if (byBarcode) return byBarcode;

      // 2. Exact SKU match (case-insensitive)
      const bySku = skuMap.get(trimmed.toLowerCase());
      if (bySku) return bySku;

      // 3. Exact name match (case-insensitive)
      const byName = nameMap.get(trimmed.toLowerCase());
      if (byName) return byName;

      return undefined;
    },
    [barcodeMap, skuMap, nameMap],
  );

  // ── Process on Enter ──────────────────────────────────────────────────────

  const processCode = useCallback(
    (raw: string) => {
      const code = raw.trim();
      if (!code) return;

      const product = resolve(code);
      if (product) {
        onProductFound(product);
      } else {
        onNotFound(code);
      }

      setValue("");
      // Return focus after a microtask so the state update settles first
      setTimeout(() => inputRef.current?.focus(), 60);
    },
    [resolve, onProductFound, onNotFound],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        e.preventDefault();
        e.stopPropagation();
        processCode(value);
      }
    },
    [value, processCode],
  );

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setValue(e.target.value);
  }, []);

  // ── Restore focus when field loses it ────────────────────────────────────
  // Guards against fighting with Select dropdowns, buttons, textarea, etc.
  const handleBlur = useCallback(() => {
    if (!isActive) return;
    setTimeout(() => {
      if (!isActive) return;
      const active = document.activeElement;
      if (active === inputRef.current) return;

      // Don't steal focus from interactive elements inside the dialog
      const interactiveSelectors = [
        "[role='dialog'] button",
        "[role='listbox']",
        "[role='option']",
        "[data-radix-select-content]",
        "[data-radix-popper-content-wrapper]",
        "textarea",
        "input:not([data-pos-scanner])",
        "select",
      ];
      if (interactiveSelectors.some((sel) => active?.closest(sel))) return;

      inputRef.current?.focus();
    }, 200);
  }, [isActive]);

  return { inputRef, value, handleChange, handleKeyDown, handleBlur, barcodeMap };
}
