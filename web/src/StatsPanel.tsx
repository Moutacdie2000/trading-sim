import { useEffect, useRef, useState } from 'react';

import type { PriceSample, StatsEvent } from './types.js';

export interface StatsPanelProps {
  stats: StatsEvent | null;
  priceHistory: PriceSample[];
}

interface Rates {
  ordersPerSec: number;
  tradesPerSec: number;
}

function ratesFrom(prev: StatsEvent | null, curr: StatsEvent | null): Rates {
  if (prev === null || curr === null) return { ordersPerSec: 0, tradesPerSec: 0 };
  const dt = (curr.ts - prev.ts) / 1000;
  if (dt <= 0) return { ordersPerSec: 0, tradesPerSec: 0 };
  return {
    ordersPerSec: Math.max(0, (curr.orders - prev.orders) / dt),
    tradesPerSec: Math.max(0, (curr.trades - prev.trades) / dt),
  };
}

function buildSparkline(history: PriceSample[], w: number, h: number): string {
  if (history.length < 2) return '';
  const minP = Math.min(...history.map((p) => p.price));
  const maxP = Math.max(...history.map((p) => p.price));
  const range = Math.max(1e-9, maxP - minP);
  const t0 = history[0]!.ts;
  const t1 = history[history.length - 1]!.ts;
  const dt = Math.max(1, t1 - t0);

  return history.map((p, i) => {
    const x = ((p.ts - t0) / dt) * w;
    const y = h - ((p.price - minP) / range) * h;
    return `${i === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`;
  }).join(' ');
}

function formatAge(ms: number): string {
  if (ms < 1000)    return `${ms}ms ago`;
  if (ms < 60_000)  return `${Math.floor(ms / 1000)}s ago`;
  return `${Math.floor(ms / 60_000)}m ago`;
}

export function StatsPanel({ stats, priceHistory }: StatsPanelProps) {
  const prevRef            = useRef<StatsEvent | null>(null);
  const [rates, setRates]  = useState<Rates>({ ordersPerSec: 0, tradesPerSec: 0 });
  const [now, setNow]      = useState(() => Date.now());

  useEffect(() => {
    if (stats === null) return;
    setRates(ratesFrom(prevRef.current, stats));
    prevRef.current = stats;
  }, [stats]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const ageMs   = stats === null ? null : Math.max(0, now - stats.ts);
  const sparkW  = 220;
  const sparkH  = 36;
  const sparkD  = buildSparkline(priceHistory, sparkW, sparkH);

  return (
    <article>
      <h2>Throughput</h2>
      <div className="stats">
        <div className="stat">
          <span className="stat-label">orders/sec</span>
          <span className="stat-value">{rates.ordersPerSec.toFixed(1)}</span>
        </div>
        <div className="stat">
          <span className="stat-label">trades/sec</span>
          <span className="stat-value">{rates.tradesPerSec.toFixed(1)}</span>
        </div>
        <div className="stat">
          <span className="stat-label">books</span>
          <span className="stat-value">{stats?.books ?? 0}</span>
        </div>
        <div className="stat">
          <span className="stat-label">updated</span>
          <span className="stat-value">{ageMs === null ? '—' : formatAge(ageMs)}</span>
        </div>
      </div>
      <svg
        className="sparkline"
        viewBox={`0 0 ${sparkW} ${sparkH}`}
        preserveAspectRatio="none"
        role="img"
        aria-label="trade price last 60s"
      >
        {sparkD === '' ? (
          <text x={sparkW / 2} y={sparkH / 2} textAnchor="middle"
                fontSize="10" fill="var(--muted)">no trades yet</text>
        ) : (
          <path d={sparkD} fill="none" stroke="#4ade80" strokeWidth="1.2" />
        )}
      </svg>
    </article>
  );
}

export { ratesFrom };
