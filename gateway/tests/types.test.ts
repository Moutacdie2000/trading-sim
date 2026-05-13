import { describe, expect, it } from 'vitest';

import { isEngineEvent } from '../src/types.js';

describe('isEngineEvent', () => {
  it('accepts a trade event', () => {
    expect(isEngineEvent({ type: 'trade', ts: 1, price: 100, qty: 5, buy: 1, sell: 2 })).toBe(true);
  });

  it('accepts a book event', () => {
    expect(isEngineEvent({ type: 'book', ts: 1, bids: [], asks: [] })).toBe(true);
  });

  it('accepts a stats event', () => {
    expect(isEngineEvent({ type: 'stats', ts: 1, orders: 100, trades: 50, books: 10 })).toBe(true);
  });

  it('rejects an unknown type', () => {
    expect(isEngineEvent({ type: 'mystery' })).toBe(false);
  });

  it('rejects non-objects', () => {
    expect(isEngineEvent(null)).toBe(false);
    expect(isEngineEvent('trade')).toBe(false);
    expect(isEngineEvent(42)).toBe(false);
  });
});
