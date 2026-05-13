import { useMemo } from 'react';

export interface DepthChartProps {
  bids: [number, number][];
  asks: [number, number][];
  width?:  number;
  height?: number;
}

interface Side {
  steps: { price: number; cumQty: number }[];
  maxQty: number;
}

interface Computed {
  bidSide: Side;
  askSide: Side;
  midPrice: number;
  minPrice: number;
  maxPrice: number;
  maxQty:   number;
  bidPath:  string;
  askPath:  string;
}

function cumulate(levels: [number, number][], direction: 'down' | 'up'): Side {
  const sorted = [...levels].sort((a, b) =>
    direction === 'down' ? b[0] - a[0] : a[0] - b[0]);
  let cum = 0;
  const steps = sorted.map(([price, qty]) => {
    cum += qty;
    return { price, cumQty: cum };
  });
  return { steps, maxQty: cum };
}

function buildPath(
  side: Side,
  midPrice: number,
  scaleX: (p: number) => number,
  scaleY: (q: number) => number,
  baselineY: number,
  bound: 'left' | 'right',
): string {
  if (side.steps.length === 0) return '';
  const startX = scaleX(midPrice);
  const segments: string[] = [`M ${startX.toFixed(2)} ${baselineY.toFixed(2)}`];
  segments.push(`L ${startX.toFixed(2)} ${scaleY(0).toFixed(2)}`);

  let prevQty = 0;
  for (const step of side.steps) {
    const x = scaleX(step.price);
    segments.push(`L ${x.toFixed(2)} ${scaleY(prevQty).toFixed(2)}`);
    segments.push(`L ${x.toFixed(2)} ${scaleY(step.cumQty).toFixed(2)}`);
    prevQty = step.cumQty;
  }
  const lastStep = side.steps[side.steps.length - 1]!;
  const boundX   = bound === 'left' ? 0 : scaleX(Infinity);
  segments.push(`L ${boundX.toFixed(2)} ${scaleY(lastStep.cumQty).toFixed(2)}`);
  segments.push(`L ${boundX.toFixed(2)} ${baselineY.toFixed(2)}`);
  segments.push('Z');
  return segments.join(' ');
}

export function computeDepth(
  bids: [number, number][],
  asks: [number, number][],
  width: number,
  height: number,
): Computed | null {
  const bidSide = cumulate(bids, 'down');
  const askSide = cumulate(asks, 'up');
  if (bidSide.steps.length === 0 || askSide.steps.length === 0) return null;

  const bestBid = bidSide.steps[0]!.price;
  const bestAsk = askSide.steps[0]!.price;
  const midPrice = (bestBid + bestAsk) / 2;

  const minPrice = bidSide.steps[bidSide.steps.length - 1]!.price;
  const maxPrice = askSide.steps[askSide.steps.length - 1]!.price;
  const maxQty   = Math.max(bidSide.maxQty, askSide.maxQty);

  const padLeft   = 8;
  const padRight  = 8;
  const padTop    = 8;
  const padBottom = 18;

  const x0 = padLeft;
  const x1 = width - padRight;
  const y0 = padTop;
  const y1 = height - padBottom;

  const priceRange = Math.max(1e-9, maxPrice - minPrice);
  const qtyRange   = Math.max(1, maxQty);

  const scaleX = (p: number): number => {
    if (p === Infinity) return x1;
    return x0 + ((p - minPrice) / priceRange) * (x1 - x0);
  };
  const scaleY = (q: number): number => y1 - (q / qtyRange) * (y1 - y0);

  const bidPath = buildPath(bidSide, midPrice, scaleX, scaleY, y1, 'left');
  const askPath = buildPath(askSide, midPrice, scaleX, scaleY, y1, 'right');

  return { bidSide, askSide, midPrice, minPrice, maxPrice, maxQty, bidPath, askPath };
}

export function DepthChart({ bids, asks, width = 400, height = 240 }: DepthChartProps) {
  const computed = useMemo(
    () => computeDepth(bids, asks, width, height),
    [bids, asks, width, height],
  );

  if (computed === null) {
    return (
      <svg
        className="depth-chart"
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label="depth chart, no data"
      >
        <text x={width / 2} y={height / 2}
              textAnchor="middle" fill="var(--muted)" fontSize="11">
          waiting for book…
        </text>
      </svg>
    );
  }

  const midX = 8 + ((computed.midPrice - computed.minPrice) /
    Math.max(1e-9, computed.maxPrice - computed.minPrice)) * (width - 16);

  return (
    <svg
      className="depth-chart"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label="market depth"
    >
      <path d={computed.bidPath} fill="rgba(74,222,128,0.20)"  stroke="#4ade80" strokeWidth="1" />
      <path d={computed.askPath} fill="rgba(248,113,113,0.20)" stroke="#f87171" strokeWidth="1" />
      <line x1={midX} x2={midX} y1={8} y2={height - 18}
            stroke="#e7eaf0" strokeOpacity="0.4" strokeDasharray="3 3" />
      <text x={midX} y={12} textAnchor="middle" fontSize="10" fill="#e7eaf0">
        {computed.midPrice.toFixed(2)}
      </text>
      <text x={8} y={height - 4} fontSize="10" fill="var(--muted)">
        {computed.minPrice.toFixed(2)}
      </text>
      <text x={width - 8} y={height - 4} textAnchor="end" fontSize="10" fill="var(--muted)">
        {computed.maxPrice.toFixed(2)}
      </text>
      <text x={width - 8} y={16} textAnchor="end" fontSize="10" fill="var(--muted)">
        max {computed.maxQty}
      </text>
    </svg>
  );
}
