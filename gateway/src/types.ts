export interface TradeEvent {
  type: 'trade';
  ts: number;
  price: number;
  qty: number;
  buy: number;
  sell: number;
  user_buy?: boolean;
  user_sell?: boolean;
}

export interface BookLevel { 0: number; 1: number }

export interface BookEvent {
  type: 'book';
  ts: number;
  bids: BookLevel[];
  asks: BookLevel[];
}

export interface StatsEvent {
  type: 'stats';
  ts: number;
  orders: number;
  trades: number;
  books: number;
}

export interface AckEvent {
  type: 'ack';
  ts: number;
  kind: 'submit' | 'cancel';
  order_id: number;
  client_id?: string;
  ok?: boolean;
}

export interface StateEvent {
  type: 'state';
  ts: number;
  paused: boolean;
}

export type EngineEvent = TradeEvent | BookEvent | StatsEvent | AckEvent | StateEvent;

export type EngineEventType = EngineEvent['type'];

export function isEngineEvent(value: unknown): value is EngineEvent {
  if (typeof value !== 'object' || value === null) return false;
  const type = (value as { type?: unknown }).type;
  return type === 'trade' || type === 'book'  || type === 'stats'
      || type === 'ack'   || type === 'state';
}

// ---- Inbound client commands (WebSocket → gateway → engine stdin) ------------

export interface SubmitCommand {
  cmd: 'submit';
  side: 'buy' | 'sell';
  type: 'limit' | 'market' | 'ioc' | 'fok';
  price: number;
  qty: number;
  client_id: string;
}

export interface CancelCommand { cmd: 'cancel'; id: number; }
export interface PauseCommand  { cmd: 'pause';  }
export interface ResumeCommand { cmd: 'resume'; }

export type ClientCommand = SubmitCommand | CancelCommand | PauseCommand | ResumeCommand;

// Validate and serialize a client command to the engine's stdin grammar.
// Returns null when the payload doesn't match a known command shape.
export function formatCommand(value: unknown): string | null {
  if (typeof value !== 'object' || value === null) return null;
  const c = value as Record<string, unknown>;

  if (c.cmd === 'pause')  return 'pause';
  if (c.cmd === 'resume') return 'resume';

  if (c.cmd === 'cancel') {
    if (typeof c.id !== 'number' || !Number.isFinite(c.id) || c.id < 0) return null;
    return `cancel ${Math.trunc(c.id)}`;
  }

  if (c.cmd === 'submit') {
    if (c.side !== 'buy' && c.side !== 'sell') return null;
    if (c.type !== 'limit' && c.type !== 'market' && c.type !== 'ioc' && c.type !== 'fok') return null;
    if (typeof c.price !== 'number' || !Number.isFinite(c.price) || c.price < 0) return null;
    if (typeof c.qty !== 'number' || !Number.isInteger(c.qty) || c.qty <= 0)     return null;
    if (typeof c.client_id !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(c.client_id)) return null;
    return `submit ${c.side} ${c.type} ${c.price} ${c.qty} ${c.client_id}`;
  }

  return null;
}
