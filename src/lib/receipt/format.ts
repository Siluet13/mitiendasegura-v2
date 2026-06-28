export function formatReceiptNumber(prefijo: string, numero: number): string {
  return `${prefijo}-${numero.toString().padStart(6, "0")}`;
}

export function fmtCurrency(n: number, simbolo: string, decimals = 2): string {
  return `${simbolo} ${n.toFixed(decimals)}`;
}
