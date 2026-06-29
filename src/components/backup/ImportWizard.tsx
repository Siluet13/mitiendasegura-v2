import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Upload, CheckCircle2, XCircle, AlertTriangle, Loader2, FileSpreadsheet } from "lucide-react";
import { parseFile } from "@/lib/backup/fileParser";
import {
  validateProducts, validateCategories, validateCustomers,
} from "@/lib/backup/validator";
import type { ValidProduct, ValidCategory, ValidCustomer, ValidationError } from "@/lib/backup/validator";
import { importData } from "@/lib/api/backup";
import type { EntityImportResult } from "@/lib/api/backup";
import type { ParsedSheet } from "@/lib/backup/fileParser";
import type { EntityType, EntityField } from "@shared/importMapper";
import { toast } from "sonner";

type ManualMap = Record<string, EntityField | "ignore">;

interface SheetState {
  sheet: ParsedSheet;
  manualMaps: ManualMap;
}

type WizardStep = "idle" | "configuring" | "importing" | "done";

interface DoneState {
  step: "done";
  results: Record<string, EntityImportResult>;
}

type WizardState =
  | { step: "idle" }
  | { step: "configuring"; format: string; sheets: SheetState[] }
  | { step: "importing" }
  | DoneState;

const ENTITY_LABELS: Record<EntityType, string> = {
  products: "Productos",
  categories: "Categorías",
  customers: "Clientes",
};

const FIELD_OPTIONS: Record<EntityType, { value: EntityField | "ignore"; label: string }[]> = {
  products: [
    { value: "nombre", label: "Nombre" }, { value: "descripcion", label: "Descripción" },
    { value: "sku", label: "SKU" }, { value: "codigoBarras", label: "Código Barras" },
    { value: "precio", label: "Precio" }, { value: "costo", label: "Costo" },
    { value: "stock", label: "Stock" }, { value: "stockMinimo", label: "Stock Mínimo" },
    { value: "activo", label: "Activo" }, { value: "categoria", label: "Categoría" },
    { value: "ignore", label: "— Ignorar columna" },
  ],
  categories: [{ value: "nombre", label: "Nombre" }, { value: "ignore", label: "— Ignorar columna" }],
  customers: [
    { value: "nombre", label: "Nombre" }, { value: "telefono", label: "Teléfono" },
    { value: "email", label: "Email" }, { value: "direccion", label: "Dirección" },
    { value: "observaciones", label: "Observaciones" }, { value: "ignore", label: "— Ignorar columna" },
  ],
};

function getMappedRows(ss: SheetState): Record<string, unknown>[] {
  const { sheet: { rows, mapping }, manualMaps } = ss;
  return rows.map((row) => {
    const result: Record<string, unknown> = {};
    for (const [header, field] of mapping.mapped) {
      result[field] = row[header];
    }
    for (const [header, field] of Object.entries(manualMaps)) {
      if (field !== "ignore" && header in row) result[field] = row[header];
    }
    return result;
  });
}

interface ValidationSummary {
  entityType: EntityType;
  total: number;
  validCount: number;
  skippedCount: number;
  errors: ValidationError[];
  validData: ValidProduct[] | ValidCategory[] | ValidCustomer[];
}

function getValidation(ss: SheetState): ValidationSummary {
  const rows = getMappedRows(ss);
  const { entityType } = ss.sheet;
  if (entityType === "products") {
    const r = validateProducts(rows as any);
    return { entityType, total: rows.length, validCount: r.valid.length, skippedCount: r.skipped, errors: r.errors, validData: r.valid };
  }
  if (entityType === "categories") {
    const r = validateCategories(rows as any);
    return { entityType, total: rows.length, validCount: r.valid.length, skippedCount: r.skipped, errors: r.errors, validData: r.valid };
  }
  const r = validateCustomers(rows as any);
  return { entityType, total: rows.length, validCount: r.valid.length, skippedCount: r.skipped, errors: r.errors, validData: r.valid };
}

function SheetCard({
  ss,
  index,
  onChange,
}: {
  ss: SheetState;
  index: number;
  onChange: (updated: SheetState) => void;
}) {
  const { sheet, manualMaps } = ss;
  const { entityType, mapping } = sheet;
  const rawUnmapped: string[] = mapping.unmapped;
  const unmapped = rawUnmapped.filter((h: string) => !(h in manualMaps));
  const hasUnmapped = unmapped.length > 0;
  const validation = getValidation(ss);
  const opts = FIELD_OPTIONS[entityType];

  function setManualMap(header: string, value: EntityField | "ignore") {
    onChange({ ...ss, manualMaps: { ...manualMaps, [header]: value } });
  }

  return (
    <div className="border rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium">{ENTITY_LABELS[entityType]}</span>
          <Badge variant="secondary">{sheet.rows.length} registros</Badge>
        </div>
        <div className="flex items-center gap-1 text-xs">
          {validation.validCount > 0 && (
            <span className="text-green-600 font-medium">✓ {validation.validCount} válidos</span>
          )}
          {validation.skippedCount > 0 && (
            <span className="text-yellow-600 font-medium ml-2">⚠ {validation.skippedCount} duplicados</span>
          )}
          {validation.errors.length > 0 && (
            <span className="text-red-600 font-medium ml-2">✗ {validation.errors.length} errores</span>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-1">
        {[...mapping.mapped.values()].map((f, i) => (
          <Badge key={i} variant="outline" className="text-xs bg-green-50 border-green-200 text-green-700">
            {f}
          </Badge>
        ))}
        {rawUnmapped.filter((h: string) => manualMaps[h] && manualMaps[h] !== "ignore").map((h: string, i: number) => (
          <Badge key={i} variant="outline" className="text-xs bg-blue-50 border-blue-200 text-blue-700">
            {manualMaps[h]}
          </Badge>
        ))}
      </div>

      {hasUnmapped && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground font-medium">Columnas sin detectar — asigná o ignorá:</p>
          {unmapped.map((header) => (
            <div key={header} className="flex items-center gap-2 text-sm">
              <span className="text-yellow-700 bg-yellow-50 border border-yellow-200 rounded px-2 py-0.5 text-xs font-mono min-w-0 truncate max-w-[160px]">
                {header}
              </span>
              <span className="text-muted-foreground text-xs">→</span>
              <Select onValueChange={(v) => setManualMap(header, v as EntityField | "ignore")}>
                <SelectTrigger className="h-7 text-xs flex-1 max-w-[180px]">
                  <SelectValue placeholder="Seleccionar..." />
                </SelectTrigger>
                <SelectContent>
                  {opts.map((o) => (
                    <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ))}
        </div>
      )}

      {validation.errors.length > 0 && (
        <div className="text-xs space-y-0.5">
          <p className="font-medium text-red-600">Errores encontrados:</p>
          {validation.errors.slice(0, 8).map((e, i) => (
            <p key={i} className="text-red-500">Fila {e.row}: {e.reason}</p>
          ))}
          {validation.errors.length > 8 && (
            <p className="text-muted-foreground">... y {validation.errors.length - 8} más</p>
          )}
        </div>
      )}
    </div>
  );
}

function ResultsView({ results }: { results: Record<string, EntityImportResult> }) {
  const entries = Object.entries(results) as [EntityType, EntityImportResult][];
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <CheckCircle2 className="h-5 w-5 text-green-600" />
        <span className="font-medium">Importación completada</span>
      </div>
      {entries.map(([entity, r]) => (
        <div key={entity} className="border rounded-lg p-3 space-y-1">
          <p className="font-medium text-sm">{ENTITY_LABELS[entity] ?? entity}</p>
          <div className="flex gap-4 text-sm">
            {r.imported > 0 && <span className="text-green-600">✔ {r.imported} importados</span>}
            {r.skipped > 0 && <span className="text-yellow-600">⚠ {r.skipped} omitidos</span>}
            {r.errors.length > 0 && <span className="text-red-600">✗ {r.errors.length} errores</span>}
          </div>
          {r.errors.length > 0 && (
            <div className="text-xs space-y-0.5 pt-1">
              {r.errors.slice(0, 5).map((e, i) => (
                <p key={i} className="text-red-500">Fila {e.row}: {e.reason}</p>
              ))}
              {r.errors.length > 5 && <p className="text-muted-foreground">... y {r.errors.length - 5} más</p>}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export function ImportWizard() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<WizardState>({ step: "idle" });
  const [parsing, setParsing] = useState(false);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (fileRef.current) fileRef.current.value = "";
    setParsing(true);
    try {
      const parsed = await parseFile(file);
      setState({
        step: "configuring",
        format: parsed.format,
        sheets: parsed.sheets.map((sheet) => ({ sheet, manualMaps: {} })),
      });
    } catch (err: any) {
      toast.error(err.message ?? "Error al leer el archivo");
    } finally {
      setParsing(false);
    }
  }

  function updateSheet(index: number, updated: SheetState) {
    if (state.step !== "configuring") return;
    const newSheets = [...state.sheets];
    newSheets[index] = updated;
    setState({ ...state, sheets: newSheets });
  }

  async function handleImport() {
    if (state.step !== "configuring") return;

    const byEntity: Record<EntityType, unknown[]> = { products: [], categories: [], customers: [] };

    for (const ss of state.sheets) {
      const v = getValidation(ss);
      if (v.validData.length > 0) {
        byEntity[ss.sheet.entityType].push(...v.validData);
      }
    }

    const totalValid = byEntity.products.length + byEntity.categories.length + byEntity.customers.length;
    if (totalValid === 0) {
      toast.error("No hay registros válidos para importar");
      return;
    }

    setState({ step: "importing" });
    try {
      const payload: Record<string, unknown[]> = {};
      if (byEntity.categories.length > 0) payload.categories = byEntity.categories;
      if (byEntity.products.length > 0) payload.products = byEntity.products;
      if (byEntity.customers.length > 0) payload.customers = byEntity.customers;

      const { results } = await importData(payload as any);
      setState({ step: "done", results: results as any });
      toast.success("Importación completada");
    } catch (err: any) {
      toast.error(err.message ?? "Error al importar");
      setState({ step: "idle" });
    }
  }

  function reset() {
    setState({ step: "idle" });
  }

  if (state.step === "importing") {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
        <Loader2 className="h-4 w-4 animate-spin" />
        Importando datos...
      </div>
    );
  }

  if (state.step === "done") {
    return (
      <div className="space-y-4">
        <ResultsView results={state.results} />
        <Button variant="outline" size="sm" onClick={reset}>Importar otro archivo</Button>
      </div>
    );
  }

  if (state.step === "configuring") {
    const allValidations = state.sheets.map(getValidation);
    const totalValid = allValidations.reduce((acc, v) => acc + v.validCount, 0);
    const totalErrors = allValidations.reduce((acc, v) => acc + v.errors.length, 0);

    const importLabel = state.sheets
      .map((ss) => {
        const v = getValidation(ss);
        if (v.validCount === 0) return null;
        return `${v.validCount} ${ENTITY_LABELS[ss.sheet.entityType].toLowerCase()}`;
      })
      .filter(Boolean)
      .join(", ");

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Formato detectado: <span className="font-medium uppercase">{state.format}</span>
            {" · "}Entidades detectadas: {state.sheets.length}
          </p>
          <Button variant="ghost" size="sm" onClick={reset}>Cancelar</Button>
        </div>

        {state.sheets.map((ss, i) => (
          <SheetCard key={i} ss={ss} index={i} onChange={(updated) => updateSheet(i, updated)} />
        ))}

        {totalErrors > 0 && (
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription className="text-sm">
              {totalErrors} {totalErrors === 1 ? "registro tiene error" : "registros tienen errores"} y no serán importados.
            </AlertDescription>
          </Alert>
        )}

        <Button
          onClick={handleImport}
          disabled={totalValid === 0}
          className="w-full"
        >
          {totalValid > 0 ? `Importar ${importLabel}` : "Sin registros válidos"}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <input
        ref={fileRef}
        type="file"
        accept=".json,.xlsx,.xls,.csv"
        className="hidden"
        onChange={handleFileChange}
      />
      <Button
        variant="outline"
        onClick={() => fileRef.current?.click()}
        disabled={parsing}
        className="w-full"
      >
        {parsing ? (
          <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Leyendo archivo...</>
        ) : (
          <><Upload className="h-4 w-4 mr-2" />Seleccionar archivo (.json, .xlsx, .csv)</>
        )}
      </Button>
      <p className="text-xs text-muted-foreground">
        Soporta archivos JSON de backup, Excel (.xlsx) y CSV. Los datos se agregan sin reemplazar los existentes.
      </p>
    </div>
  );
}
