export interface TradeEvent {
  type: 'trade';
  ts: number;
  price: number;
  qty: number;
  buy: number;
  sell: number;
}

export interface BookEvent {
  type: 'book';
  ts: number;
  bids: [number, number][];
  asks: [number, number][];
}

export interface StatsEvent {
  type: 'stats';
  ts: number;
  orders: number;
  trades: number;
  books: number;
}

export type EngineEvent = TradeEvent | BookEvent | StatsEvent;

export interface PriceSample {
  ts: number;
  price: number;
}
