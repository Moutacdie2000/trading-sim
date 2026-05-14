import { useMemo } from 'react';

import type { Candle } from './types.js';

interface Props {
  candles: Candle[];
  width?:  number;
  height?: number;
}

interface Layout {
  minPrice: number;
  maxPrice: number;
  bars: {
    x:        number;
    bodyTop:  number;
    bodyBot:  number;
    wickTop:  number;
    wickBot:  number;
    width:    number;
    bullish:  boolean;
    candle:   Candle;
  }[];
  midPrice: number | null;
  axisTicks: { y: number; label: string }[];
}

export function computeLayout(candles: Candle[], width: number, height: number): Layout | null {
  if (candles.length === 0) return null;

  const minPrice = Math.min(...candles.map((c) => c.low));
  const maxPrice = Math.max(...candles.map((c) => c.high));
  if (!Number.isFinite(minPrice) || !Number.isFinite(maxPrice) || maxPrice === minPrice) {
    // Degenerate (single trade): widen by 0.1% to draw a visible body
    const pad = Math.max(0.5, minPrice * 0.001);
    return computeLayout(
      candles.map((c) => ({ ...c, high: c.high + pad, low: c.low - pad })),
      width, height,
    );
  }

  const padLeft   = 8;
  const padRight  = 56;   // room for the price scale + last-price label
  const padTop    = 8;
  const padBottom = 18;

  const x0 = padLeft;
  const x1 = width - padRight;
  const y0 = padTop;
  const y1 = height - padBottom;

  const range = maxPrice - minPrice;
  const scaleY = (price: number): number =>
    y1 - ((price - minPrice) / range) * (y1 - y0);

  const slot   = (x1 - x0) / candles.length;
  const barW   = Math.max(2, slot * 0.7);

  const bars = candles.map((c, i) => {
    const cx       = x0 + slot * (i + 0.5);
    const openY    = scaleY(c.open);
    const closeY   = scaleY(c.close);
    const bullish  = c.close >= c.open;
    return {
      x:        cx - barW / 2,
      bodyTop:  Math.min(openY, closeY),
      bodyBot:  Math.max(openY, closeY),
      wickTop:  scaleY(c.high),
      wickBot:  scaleY(c.low),
      width:    barW,
      bullish,
      candle:   c,
    };
  });

  // 4 price ticks evenly distributed across the price range
  const axisTicks = [0, 1, 2, 3].map((k) => {
    const price = minPrice + (range * k) / 3;
    return { y: scaleY(price), label: price.toFixed(2) };
  });

  return {
    minPrice, maxPrice, bars,
    midPrice: candles[candles.length - 1]?.close ?? null,
    axisTicks,
  };
}

export function Candlestick({ candles, width = 800, height = 260 }: Props) {
  const layout = useMemo(() => computeLayout(candles, width, height), [candles, width, height]);

  if (layout === null) {
    return (
      <svg
        className="candle-chart"
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label="candlestick chart, no data"
      >
        <text x={width / 2} y={height / 2}
              textAnchor="middle" fill="var(--muted)" fontSize="11">
          waiting for trades…
        </text>
      </svg>
    );
  }

  return (
    <svg
      className="candle-chart"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label="candlestick chart"
    >
      {layout.axisTicks.map((t, i) => (
        <g key={i}>
          <line x1={8} x2={width - 56} y1={t.y} y2={t.y}
                stroke="#1f2531" strokeDasharray="2 4" />
          <text x={width - 50} y={t.y + 4} fontSize="10" fill="var(--muted)">
            {t.label}
          </text>
        </g>
      ))}

      {layout.bars.map((b, i) => {
        const color = b.bullish ? 'var(--bid)' : 'var(--ask)';
        return (
          <g key={i}>
            <line
              x1={b.x + b.width / 2} x2={b.x + b.width / 2}
              y1={b.wickTop} y2={b.wickBot}
              stroke={color} strokeWidth={1}
            />
            <rect
              x={b.x} y={b.bodyTop}
              width={b.width}
              height={Math.max(1, b.bodyBot - b.bodyTop)}
              fill={color} opacity={0.85}
            >
              <title>
                {new Date(b.candle.startMs).toISOString().slice(11, 19)}{'\n'}
                O {b.candle.open.toFixed(2)} · H {b.candle.high.toFixed(2)}{'\n'}
                L {b.candle.low.toFixed(2)} · C {b.candle.close.toFixed(2)}{'\n'}
                vol {b.candle.volume}
              </title>
            </rect>
          </g>
        );
      })}

      {layout.midPrice !== null && (() => {
        const lastBar = layout.bars[layout.bars.length - 1]!;
        const y       = (lastBar.bodyTop + lastBar.bodyBot) / 2;
        return (
          <g>
            <line x1={8} x2={width - 56} y1={y} y2={y}
                  stroke="var(--accent)" strokeDasharray="3 3" strokeOpacity={0.5} />
            <rect x={width - 54} y={y - 8} width={48} height={16}
                  rx={3} fill="var(--accent)" />
            <text x={width - 30} y={y + 4} textAnchor="middle"
                  fontSize="10" fill="#0b0d12" fontWeight={600}>
              {layout.midPrice.toFixed(2)}
            </text>
          </g>
        );
      })()}
    </svg>
  );
}
