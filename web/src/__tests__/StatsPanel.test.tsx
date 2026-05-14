import { describe, expect, it } from 'vitest';

import { ratesFrom } from '../StatsPanel';
import type { StatsEvent } from '../types';

function stats(ts: number, orders: number, trades: number): StatsEvent {
  return { type: 'stats', ts, orders, trades, books: 0 };
}

describe('ratesFrom', () => {
  it('returns zeros when prev is null', () => {
    expect(ratesFrom(null, stats(1000, 10, 5))).toEqual({ ordersPerSec: 0, tradesPerSec: 0 });
  });

  it('computes orders/sec ~= 20 for delta=20 across 1s', () => {
    const r = ratesFrom(stats(1_000, 100, 50), stats(2_000, 120, 53));
    expect(r.ordersPerSec).toBeCloseTo(20, 6);
    expect(r.tradesPerSec).toBeCloseTo(3, 6);
  });

  it('handles a half-second gap', () => {
    const r = ratesFrom(stats(1_000, 100, 50), stats(1_500, 110, 55));
    expect(r.ordersPerSec).toBeCloseTo(20, 6);
    expect(r.tradesPerSec).toBeCloseTo(10, 6);
  });

  it('clamps negative deltas to zero', () => {
    const r = ratesFrom(stats(1_000, 100, 50), stats(2_000, 90, 40));
    expect(r.ordersPerSec).toBe(0);
    expect(r.tradesPerSec).toBe(0);
  });

  it('returns zero when timestamps are equal', () => {
    expect(ratesFrom(stats(1_000, 100, 50), stats(1_000, 200, 60)))
      .toEqual({ ordersPerSec: 0, tradesPerSec: 0 });
  });
});
