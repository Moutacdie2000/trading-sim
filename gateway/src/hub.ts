export interface HubSocket {
  readonly readyState: number;
  send(data: string): void;
}

export const WS_OPEN = 1;

export class Hub<S extends HubSocket = HubSocket> {
  private readonly clients = new Set<S>();

  addClient(ws: S): void {
    this.clients.add(ws);
  }

  removeClient(ws: S): void {
    this.clients.delete(ws);
  }

  broadcast(payload: string): void {
    for (const ws of this.clients) {
      if (ws.readyState === WS_OPEN) ws.send(payload);
    }
  }

  count(): number {
    return this.clients.size;
  }

  snapshot(): readonly S[] {
    return Array.from(this.clients);
  }
}
