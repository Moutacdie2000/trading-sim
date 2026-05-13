export interface TradeEvent {
  type: 'trade';
  ts: number;
  price: number;
  qty: number;
  buy: number;
  sell: number;
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

export type EngineEvent = TradeEvent | BookEvent | StatsEvent;

export type EngineEventType = EngineEvent['type'];

export function isEngineEvent(value: unknown): value is EngineEvent {
  if (typeof value !== 'object' || value === null) return false;
  const type = (value as { type?: unknown }).type;
  return type === 'trade' || type === 'book' || type === 'stats';
}
