// Pure reducer logic for cash balance, P&L, candles and order state.
// Extracted from useEngineFeed so it can be tested in isolation — the cases
// we care about (debits / credits / unrealized vs realized / partial fills /
// over-commit prevention / recharge) are subtle enough that they deserve a
// dedicated test surface.

import type {
  BookEvent, Candle, MyOrder, TradeEvent,
} from './types';

export const INITIAL_BALANCE   = 10_000;
export const RECHARGE_AMOUNT   = 10_000;
export const CANDLE_BUCKET_MS  = 5_000;
export const CANDLES_KEPT      = 60;        // 5 minutes of 5s candles

// Market orders aren't guaranteed to fill at the best ask — they walk the
// book. We add this buffer when estimating cost so the user doesn't sneak
// past the available-cash check and slip into a negative balance.
export const MARKET_SLIPPAGE_BUFFER = 1.02;

export interface PnlState {
  balance:        number;
  startingEquity: number;
  cashFlow:       number;
  position:       number;
  marketPrice:    number;
  equity:         number;
  totalPnl:       number;
  totalRecharged: number;
}

export const initialPnl: PnlState = {
  balance:        INITIAL_BALANCE,
  startingEquity: INITIAL_BALANCE,
  cashFlow:       0,
  position:       0,
  marketPrice:    0,
  equity:         INITIAL_BALANCE,
  totalPnl:       0,
  totalRecharged: 0,
};

// equity = cash + position × mark.
// totalPnl = equity − (initial deposit + cumulative recharges).
// Mark is only updated on book events (mid of bid/ask). Trades do NOT
// overwrite it: the mid is "fairer" than the most recent print, and using
// the trade price for the mark would erase any immediate alpha from
// crossing inside the spread.
export function recomputeEquity(pnl: PnlState, mark: number): PnlState {
  const marketPrice = mark > 0 ? mark : pnl.marketPrice;
  const equity      = pnl.balance + pnl.position * marketPrice;
  const baseline    = pnl.startingEquity + pnl.totalRecharged;
  return {
    ...pnl,
    marketPrice,
    equity,
    totalPnl: equity - baseline,
  };
}

// Apply a single user fill to balance / cashFlow / position.
// Mark is NOT touched here — see recomputeEquity above.
export function applyUserFill(pnl: PnlState, trade: TradeEvent): PnlState {
  let { balance, cashFlow, position } = pnl;
  if (trade.user_buy) {
    const cost = trade.qty * trade.price;
    balance  -= cost;
    cashFlow -= cost;
    position += trade.qty;
  }
  if (trade.user_sell) {
    const proceeds = trade.qty * trade.price;
    balance  += proceeds;
    cashFlow += proceeds;
    position -= trade.qty;
  }
  return recomputeEquity({ ...pnl, balance, cashFlow, position }, pnl.marketPrice);
}

export function applyBook(pnl: PnlState, book: BookEvent): PnlState {
  const bestBid = book.bids[0]?.[0];
  const bestAsk = book.asks[0]?.[0];
  if (bestBid === undefined || bestAsk === undefined) return pnl;
  return recomputeEquity(pnl, (bestBid + bestAsk) / 2);
}

export function applyRecharge(pnl: PnlState): PnlState {
  return recomputeEquity({
    ...pnl,
    balance:        pnl.balance + RECHARGE_AMOUNT,
    totalRecharged: pnl.totalRecharged + RECHARGE_AMOUNT,
  }, pnl.marketPrice);
}

// Cash locked up in resting (or about-to-rest) BUY orders. Only LIMIT
// rests; market / IOC / FOK never sit on the book — they fully resolve
// before the next event is emitted, so they don't reserve cash beyond
// the moment of submission.
export function reservedCash(orders: readonly MyOrder[]): number {
  let reserved = 0;
  for (const o of orders) {
    if (o.side !== 'buy') continue;
    if (o.type !== 'limit') continue;
    if (o.status !== 'pending' && o.status !== 'accepted') continue;
    const remaining = Math.max(0, o.qty - o.filledQty);
    reserved += remaining * o.price;
  }
  return reserved;
}

export interface BuyAffordability {
  estimatedCost: number;
  available:     number;
  affordable:    boolean;
}

// Can the user afford this BUY given existing reservations?
// For market orders we estimate at best_ask * (1 + slippage_buffer) to be
// safe; for limit orders we use the limit price exactly.
export function evaluateBuy(
  type:     MyOrder['type'],
  price:    number,
  qty:      number,
  bestAsk:  number | null,
  pnl:      PnlState,
  orders:   readonly MyOrder[],
): BuyAffordability {
  const refPrice =
    type === 'market'
      ? (bestAsk !== null ? bestAsk * MARKET_SLIPPAGE_BUFFER : pnl.marketPrice)
      : price;
  const estimatedCost = refPrice * qty;
  const available     = pnl.balance - reservedCash(orders);
  return {
    estimatedCost,
    available,
    affordable: Number.isFinite(estimatedCost)
                && estimatedCost > 0
                && estimatedCost <= available,
  };
}

// ---- Candles -----------------------------------------------------------------

export function appendCandle(prev: readonly Candle[], trade: TradeEvent): Candle[] {
  const startMs = Math.floor(trade.ts / CANDLE_BUCKET_MS) * CANDLE_BUCKET_MS;
  const last    = prev[prev.length - 1];
  if (last !== undefined && last.startMs === startMs) {
    const updated: Candle = {
      ...last,
      high:   Math.max(last.high, trade.price),
      low:    Math.min(last.low,  trade.price),
      close:  trade.price,
      volume: last.volume + trade.qty,
    };
    return [...prev.slice(0, -1), updated];
  }
  const fresh: Candle = {
    startMs,
    open:   trade.price,
    high:   trade.price,
    low:    trade.price,
    close:  trade.price,
    volume: trade.qty,
  };
  return [...prev, fresh].slice(-CANDLES_KEPT);
}

// ---- MyOrders status transitions --------------------------------------------

// Apply a trade event to the order list: increment filledQty on whichever
// of the order's sides this trade matches, flip to 'filled' when complete.
export function applyTradeToOrders(
  orders: readonly MyOrder[],
  trade:  TradeEvent,
): MyOrder[] {
  const buyIndex  = trade.user_buy  ? orders.findIndex((o) => o.orderId === trade.buy)  : -1;
  const sellIndex = trade.user_sell ? orders.findIndex((o) => o.orderId === trade.sell) : -1;
  if (buyIndex === -1 && sellIndex === -1) return orders as MyOrder[];

  return orders.map((o, i) => {
    if (i !== buyIndex && i !== sellIndex) return o;
    const filledQty = o.filledQty + trade.qty;
    return {
      ...o,
      filledQty,
      status: filledQty >= o.qty ? 'filled' : o.status,
    };
  });
}
