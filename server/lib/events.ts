import type { Response } from "express";

type SseClient = Response;

const connections = new Map<string, Set<SseClient>>();

export function subscribe(tenantId: string, res: SseClient): void {
  if (!connections.has(tenantId)) {
    connections.set(tenantId, new Set());
  }
  connections.get(tenantId)!.add(res);
}

export function unsubscribe(tenantId: string, res: SseClient): void {
  const clients = connections.get(tenantId);
  if (!clients) return;
  clients.delete(res);
  if (clients.size === 0) connections.delete(tenantId);
}

export function broadcast(
  tenantId: string,
  payload: { type: string; entities: string[] }
): void {
  const clients = connections.get(tenantId);
  if (!clients || clients.size === 0) return;
  const data = `data: ${JSON.stringify(payload)}\n\n`;
  for (const client of clients) {
    try {
      client.write(data);
    } catch {
      clients.delete(client);
    }
  }
}
