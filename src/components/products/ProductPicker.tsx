import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronsUpDown, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { searchProducts, type ProductSearchResult } from "@/lib/api/inventory";

export type { ProductSearchResult };

interface ProductPickerProps {
  /** product_id del producto seleccionado (controlado externamente) */
  value?: string;
  /** Callback cuando el usuario selecciona un producto */
  onSelect: (product: ProductSearchResult) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

/**
 * ProductPicker
 *
 * Buscador inteligente de productos reutilizable.
 * Busca server-side por: nombre, SKU, código de barras, categoría.
 *
 * Flujo lector de barras:
 *   1. El lector emite los caracteres rápidamente y presiona Enter.
 *   2. El debounce dispara la búsqueda al servidor.
 *   3. Si hay exactamente 1 resultado con barras/SKU exacto → autoselecciona.
 *   4. Si hay 1 resultado y el usuario presiona Enter → selecciona.
 *   5. Si hay múltiples resultados → muestra la lista para elegir.
 *
 * Reutilizable en: Movimientos, Compras, Lotes, Ajustes de stock.
 */
export function ProductPicker({
  value,
  onSelect,
  placeholder = "Buscar producto…",
  disabled,
  className,
}: ProductPickerProps) {
  const [open, setOpen] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [selected, setSelected] = useState<ProductSearchResult | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Evita doble auto-selección para el mismo query
  const autoSelectedRef = useRef(false);

  // Sincronizar: si el valor externo se limpia (form.reset) → limpiar selección interna
  useEffect(() => {
    if (!value) {
      setSelected(null);
      autoSelectedRef.current = false;
    }
  }, [value]);

  // Debounce del input: 300ms
  useEffect(() => {
    autoSelectedRef.current = false;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedQ(inputValue.trim());
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [inputValue]);

  const { data: results = [], isFetching } = useQuery({
    queryKey: ["product_search", debouncedQ],
    queryFn: () => searchProducts(debouncedQ),
    enabled: debouncedQ.length >= 1,
    staleTime: 30_000,
  });

  /**
   * Auto-selección para lectores de código de barras:
   * Si hay exactamente 1 resultado y coincide exacto con barras o SKU → selecciona sin intervención.
   */
  useEffect(() => {
    if (autoSelectedRef.current) return;
    if (!debouncedQ || results.length !== 1) return;

    const r = results[0];
    const q = debouncedQ.trim();
    const isExactBarcode = !!r.codigoBarras && r.codigoBarras.trim() === q;
    const isExactSku = !!r.sku && r.sku.trim().toLowerCase() === q.toLowerCase();

    if (isExactBarcode || isExactSku) {
      autoSelectedRef.current = true;
      handleSelect(r);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [results, debouncedQ]);

  function handleSelect(p: ProductSearchResult) {
    setSelected(p);
    onSelect(p);
    setOpen(false);
    setInputValue("");
    // Reset debounce para no re-disparar la búsqueda
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setDebouncedQ("");
  }

  /** Enter con exactamente 1 resultado visible → selecciona */
  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && results.length === 1 && !isFetching) {
      e.preventDefault();
      handleSelect(results[0]);
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("w-full justify-between font-normal", className)}
          disabled={disabled}
        >
          {selected ? (
            <span className="flex min-w-0 items-center gap-1.5">
              <span className="truncate">{selected.nombre}</span>
              {selected.sku && (
                <span className="shrink-0 text-xs text-muted-foreground">
                  · {selected.sku}
                </span>
              )}
            </span>
          ) : (
            <span className="text-muted-foreground">{placeholder}</span>
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>

      <PopoverContent
        className="w-[var(--radix-popover-trigger-width)] p-0"
        align="start"
        side="bottom"
      >
        <Command shouldFilter={false}>
          <CommandInput
            value={inputValue}
            onValueChange={setInputValue}
            onKeyDown={handleKeyDown}
            placeholder="Nombre, SKU, código de barras…"
            autoComplete="off"
          />
          <CommandList>
            {/* Estado: buscando */}
            {isFetching && (
              <div className="flex items-center justify-center gap-2 py-5 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Buscando…
              </div>
            )}

            {/* Estado: sin query */}
            {!isFetching && debouncedQ.length === 0 && (
              <div className="py-5 text-center text-sm text-muted-foreground">
                Escribí para buscar por nombre, SKU,
                <br />
                código de barras o categoría
              </div>
            )}

            {/* Estado: sin resultados */}
            {!isFetching && debouncedQ.length > 0 && results.length === 0 && (
              <CommandEmpty>Sin resultados para &quot;{debouncedQ}&quot;</CommandEmpty>
            )}

            {/* Resultados */}
            {!isFetching && results.length > 0 && (
              <CommandGroup>
                {results.map((p) => (
                  <CommandItem
                    key={p.id}
                    value={p.id}
                    onSelect={() => handleSelect(p)}
                    className="cursor-pointer py-2"
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4 shrink-0",
                        selected?.id === p.id ? "opacity-100" : "opacity-0",
                      )}
                    />
                    <div className="flex min-w-0 flex-col">
                      <span className="truncate font-medium">{p.nombre}</span>
                      <span className="truncate text-xs text-muted-foreground">
                        {[
                          p.categoryNombre,
                          p.sku ? `SKU: ${p.sku}` : null,
                          `Stock: ${p.stock}`,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
