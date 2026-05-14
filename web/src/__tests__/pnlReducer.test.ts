import { describe, expect, it } from 'vitest';

import {
  applyBook, applyRecharge, applyTradeToOrders, applyUserFill,
  evaluateBuy, initialPnl, recomputeEquity, reservedCash,
  INITIAL_BALANCE, RECHARGE_AMOUNT, MARKET_SLIPPAGE_BUFFER,
  type PnlState,
} from '../pnlReducer';
import type { BookEvent, MyOrder, TradeEvent } from '../types';

function trade(over: Partial<TradeEvent> = {}): TradeEvent {
  return {
    type: 'trade', ts: 1, price: 100, qty: 1, buy: 1, sell: 2,
    ...over,
  };
}

function order(over: Partial<MyOrder> = {}): MyOrder {
  return {
    clientId: 'c', orderId: null, side: 'buy', type: 'limit',
    price: 100, qty: 5, filledQty: 0, status: 'accepted', submittedAt: 0,
    ...over,
  };
}

describe('initial state', () => {
  it('starts with $10k cash, zero position, zero P&L', () => {
    expect(initialPnl.balance).toBe(INITIAL_BALANCE);
    expect(initialPnl.equity).toBe(INITIAL_BALANCE);
    expect(initialPnl.position).toBe(0);
    expect(initialPnl.totalPnl).toBe(0);
  });
});

describe('recomputeEquity', () => {
  it('equity = cash + position × mark; pnl = equity − (starting + recharges)', () => {
    const start: PnlState = { ...initialPnl, balance: 9500, position: 5 };
    const out = recomputeEquity(start, 100);
    expect(out.marketPrice).toBe(100);
    expect(out.equity).toBe(9500 + 500);   // 10,000
    expect(out.totalPnl).toBe(0);          // back to baseline
  });

  it('keeps the previous mark when the new mark is 0', () => {
    const start: PnlState = { ...initialPnl, marketPrice: 100 };
    expect(recomputeEquity(start, 0).marketPrice).toBe(100);
  });
});

describe('debit on buy / credit on sell', () => {
  it('debits cash by qty × price on a user buy', () => {
    const out = applyUserFill(initialPnl, trade({ price: 100, qty: 5, user_buy: true }));
    expect(out.balance).toBe(9500);
    expect(out.position).toBe(5);
    expect(out.cashFlow).toBe(-500);
  });

  it('credits cash by qty × price on a user sell', () => {
    const start: PnlState = { ...initialPnl, balance: 9500, position: 5 };
    const out = applyUserFill(start, trade({ price: 100, qty: 5, user_sell: true }));
    expect(out.balance).toBe(10_000);
    expect(out.position).toBe(0);
    expect(out.cashFlow).toBe(500);
  });

  it('does not touch the mark on a user fill', () => {
    const start = { ...initialPnl, marketPrice: 100 };
    const out = applyUserFill(start, trade({ price: 99, qty: 1, user_buy: true }));
    // Mark stays at 100 (the live mid). If we overwrote with trade.price 99
    // we would silently erase the alpha of buying inside the spread.
    expect(out.marketPrice).toBe(100);
    // 9,901 cash + 1 share at $100 = $10,001 equity → +$1 unrealized.
    expect(out.equity).toBe(10_001);
    expect(out.totalPnl).toBe(1);
  });
});

describe('gain and loss scenarios', () => {
  it('reflects an unrealized gain when the mark rises above the entry', () => {
    let pnl = applyUserFill(initialPnl, trade({ price: 100, qty: 5, user_buy: true }));
    pnl = applyBook(pnl, book(99, 101));   // mid 100 → no change
    expect(pnl.totalPnl).toBe(0);
    pnl = applyBook(pnl, book(101, 103));  // mid 102
    expect(pnl.balance).toBe(9500);
    expect(pnl.position).toBe(5);
    expect(pnl.equity).toBe(9500 + 5 * 102);
    expect(pnl.totalPnl).toBe(10);
  });

  it('realises the gain on exit and keeps it after the mark drops', () => {
    let pnl = applyUserFill(initialPnl, trade({ price: 100, qty: 5, user_buy: true }));
    pnl = applyBook(pnl, book(101, 103));
    pnl = applyUserFill(pnl, trade({ price: 102, qty: 5, user_sell: true }));
    expect(pnl.balance).toBe(10_010);
    expect(pnl.position).toBe(0);
    expect(pnl.totalPnl).toBe(10);

    // Mark crashes — already-realised P&L is unaffected.
    pnl = applyBook(pnl, book(80, 81));
    expect(pnl.totalPnl).toBe(10);
  });

  it('reflects an unrealized loss when the mark falls below the entry', () => {
    let pnl = applyUserFill(initialPnl, trade({ price: 100, qty: 5, user_buy: true }));
    pnl = applyBook(pnl, book(97, 99));   // mid 98
    expect(pnl.totalPnl).toBe(-10);
    expect(pnl.equity).toBe(9500 + 5 * 98);
  });

  it('short selling: position goes negative; P&L moves inversely to the mark', () => {
    let pnl: PnlState = applyBook(initialPnl, book(99, 101));        // mid 100
    pnl = applyUserFill(pnl, trade({ price: 100, qty: 5, user_sell: true }));
    expect(pnl.balance).toBe(10_500);
    expect(pnl.position).toBe(-5);
    expect(pnl.equity).toBe(10_500 - 500);                            // back to 10,000
    expect(pnl.totalPnl).toBe(0);

    // Mark rises against the short → unrealized loss.
    pnl = applyBook(pnl, book(101, 103));
    expect(pnl.totalPnl).toBe(-10);
  });

  it('two-sided position keeps cashFlow honest', () => {
    let pnl = applyUserFill(initialPnl, trade({ price: 100, qty: 5, user_buy: true }));
    pnl = applyUserFill(pnl, trade({ price: 102, qty: 5, user_sell: true }));
    expect(pnl.cashFlow).toBe(10);     // bought 500, sold 510
    expect(pnl.position).toBe(0);
  });
});

describe('recharge', () => {
  it('adds RECHARGE_AMOUNT to cash without changing P&L', () => {
    const before = applyUserFill(initialPnl, trade({ price: 100, qty: 5, user_buy: true }));
    const after  = applyRecharge(before);
    expect(after.balance).toBe(before.balance + RECHARGE_AMOUNT);
    expect(after.totalRecharged).toBe(RECHARGE_AMOUNT);
    expect(after.totalPnl).toBe(before.totalPnl);  // recharges don't count as P&L
  });
});

describe('reserved cash (the over-commit fix)', () => {
  it('reserves the remaining qty × limit price of resting buy orders', () => {
    const orders = [
      order({ side: 'buy', price: 100, qty: 5, status: 'accepted' }),
      order({ side: 'buy', price: 50,  qty: 4, status: 'pending'  }),
    ];
    expect(reservedCash(orders)).toBe(500 + 200);
  });

  it('does not reserve market / IOC / FOK orders (they never rest)', () => {
    const orders = [
      order({ side: 'buy', type: 'market', qty: 100, status: 'accepted' }),
      order({ side: 'buy', type: 'ioc',    qty: 100, status: 'accepted' }),
      order({ side: 'buy', type: 'fok',    qty: 100, status: 'accepted' }),
    ];
    expect(reservedCash(orders)).toBe(0);
  });

  it('does not reserve filled, cancelled, or rejected orders', () => {
    const orders = [
      order({ side: 'buy', price: 100, qty: 5, filledQty: 5, status: 'filled'    }),
      order({ side: 'buy', price: 100, qty: 5, status: 'cancelled' }),
      order({ side: 'buy', price: 100, qty: 5, status: 'rejected'  }),
    ];
    expect(reservedCash(orders)).toBe(0);
  });

  it('reserves only the un-filled remainder of a partially filled buy', () => {
    const orders = [order({ side: 'buy', price: 100, qty: 5, filledQty: 2, status: 'accepted' })];
    expect(reservedCash(orders)).toBe(300);  // 3 remaining × 100
  });
});

describe('evaluateBuy (availability gate)', () => {
  it('allows a limit buy when limit×qty fits in available cash', () => {
    const r = evaluateBuy('limit', 100, 5, null, initialPnl, []);
    expect(r.affordable).toBe(true);
    expect(r.estimatedCost).toBe(500);
    expect(r.available).toBe(INITIAL_BALANCE);
  });

  it('refuses a limit buy that exceeds the available cash', () => {
    const r = evaluateBuy('limit', 100, 101, null, initialPnl, []);
    expect(r.affordable).toBe(false);
    expect(r.estimatedCost).toBe(10_100);
  });

  it('refuses stacking two limit buys that together exceed cash', () => {
    const first   = order({ side: 'buy', price: 100, qty: 60, status: 'accepted' });
    const r       = evaluateBuy('limit', 100, 60, null, initialPnl, [first]);
    expect(r.available).toBe(INITIAL_BALANCE - 60 * 100); // 4,000
    expect(r.affordable).toBe(false);                      // need 6,000 > 4,000
  });

  it('adds a slippage buffer for market buys', () => {
    const r = evaluateBuy('market', 0, 1, 100, initialPnl, []);
    expect(r.estimatedCost).toBeCloseTo(100 * MARKET_SLIPPAGE_BUFFER);
  });

  it('blocks a market buy whose buffered cost exceeds available cash', () => {
    // qty 99 at ask 100 with 2% buffer = 99 * 102 = 10,098 > 10,000.
    const r = evaluateBuy('market', 0, 99, 100, initialPnl, []);
    expect(r.affordable).toBe(false);
  });
});

describe('applyTradeToOrders', () => {
  it('increments filledQty on the matched side and flips to filled when complete', () => {
    const orders = [order({ orderId: 42, side: 'buy', qty: 5, filledQty: 2 })];
    const out = applyTradeToOrders(orders, trade({ buy: 42, qty: 3, user_buy: true }));
    expect(out[0]!.filledQty).toBe(5);
    expect(out[0]!.status).toBe('filled');
  });

  it('leaves unrelated orders untouched', () => {
    const a = order({ orderId: 1, side: 'buy' });
    const b = order({ orderId: 2, side: 'sell' });
    const out = applyTradeToOrders([a, b], trade({ buy: 1, qty: 1, user_buy: true }));
    expect(out[1]).toBe(b);
  });
});

// helpers ---------------------------------------------------------------------

function book(bestBid: number, bestAsk: number): BookEvent {
  return { type: 'book', ts: 1, bids: [[bestBid, 1]], asks: [[bestAsk, 1]] };
}
