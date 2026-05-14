export interface TradeEvent {
  type: 'trade';
  ts: number;
  price: number;
  qty: number;
  buy: number;
  sell: number;
  user_buy?:  boolean;
  user_sell?: boolean;
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

export interface PriceSample { ts: number; price: number; }

export interface Candle {
  startMs: number;
  open:    number;
  high:    number;
  low:     number;
  close:   number;
  volume:  number;
}

// ---- My orders ---------------------------------------------------------------

export type OrderSide = 'buy' | 'sell';
export type OrderType = 'limit' | 'market' | 'ioc' | 'fok';
export type OrderStatus = 'pending' | 'accepted' | 'filled' | 'cancelled' | 'rejected';

export interface MyOrder {
  clientId:    string;
  orderId:     number | null;
  side:        OrderSide;
  type:        OrderType;
  price:       number;
  qty:         number;
  filledQty:   number;
  status:      OrderStatus;
  submittedAt: number;
}

// ---- Outbound commands -------------------------------------------------------

export type ClientCommand =
  | { cmd: 'submit'; side: OrderSide; type: OrderType; price: number; qty: number; client_id: string }
  | { cmd: 'cancel'; id: number }
  | { cmd: 'pause' }
  | { cmd: 'resume' };
