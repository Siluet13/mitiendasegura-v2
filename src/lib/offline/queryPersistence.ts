import { dehydrate, hydrate, type QueryClient, type DehydratedState } from "@tanstack/react-query";

const CACHE_KEY = "mts_rq_cache_v1";

const PERSISTED_KEYS: readonly string[][] = [
  ["products"],
  ["categories"],
  ["customers"],
];

function shouldPersistQuery(queryKey: readonly unknown[]): boolean {
  return PERSISTED_KEYS.some(
    (k) =>
      k.length === queryKey.length &&
      k.every((segment, i) => segment === queryKey[i]),
  );
}

export function restoreQueryCache(qc: QueryClient): void {
  if (typeof window === "undefined") return;
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return;
    const state = JSON.parse(raw) as DehydratedState;
    hydrate(qc, state);
  } catch {
    try {
      localStorage.removeItem(CACHE_KEY);
    } catch {}
  }
}

function writeCache(qc: QueryClient): void {
  try {
    const state = dehydrate(qc, {
      shouldDehydrateQuery: (query) =>
        query.state.status === "success" && shouldPersistQuery(query.queryKey),
    });
    if (state.queries.length === 0) return;
    localStorage.setItem(CACHE_KEY, JSON.stringify(state));
  } catch {}
}

export function setupQueryCachePersistence(qc: QueryClient): () => void {
  restoreQueryCache(qc);

  let saveTimer: ReturnType<typeof setTimeout> | null = null;

  const unsubscribe = qc.getQueryCache().subscribe((event) => {
    if (event.type === "updated" && event.query.state.status === "success") {
      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = setTimeout(() => {
        writeCache(qc);
        saveTimer = null;
      }, 500);
    }
  });

  return () => {
    unsubscribe();
    if (saveTimer) clearTimeout(saveTimer);
  };
}
