import { useEffect, useRef, useState } from 'react';

import type { OrderSide, OrderType } from './types.js';

interface Props {
  bestBid:     number | null;
  bestAsk:     number | null;
  disabled:    boolean;
  onSubmit:    (params: { side: OrderSide; type: OrderType; price: number; qty: number }) => void;
}

export function OrderEntry({ bestBid, bestAsk, disabled, onSubmit }: Props) {
  const [side,  setSide]  = useState<OrderSide>('buy');
  const [type,  setType]  = useState<OrderType>('limit');
  const [price, setPrice] = useState<string>('');
  const [qty,   setQty]   = useState<string>('5');
  const [flash, setFlash] = useState<'ok' | 'err' | null>(null);

  const priceRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (price === '' && type === 'limit') {
      const mid = bestBid !== null && bestAsk !== null ? (bestBid + bestAsk) / 2 : null;
      if (mid !== null) setPrice(mid.toFixed(2));
    }
  }, [bestBid, bestAsk, price, type]);

  const needsPrice = type !== 'market';

  function commit(): void {
    const q = Number.parseInt(qty, 10);
    const p = needsPrice ? Number.parseFloat(price) : 0;
    if (!Number.isFinite(q) || q <= 0)                       { setFlash('err'); return; }
    if (needsPrice && (!Number.isFinite(p) || p <= 0))       { setFlash('err'); return; }
    onSubmit({ side, type, price: p, qty: q });
    setFlash('ok');
    setQty('5');
  }

  useEffect(() => {
    if (flash === null) return;
    const t = setTimeout(() => setFlash(null), 600);
    return () => clearTimeout(t);
  }, [flash]);

  // Keyboard: B/S to switch side, Enter (from any field) submits.
  function onKeyDown(e: React.KeyboardEvent<HTMLFormElement>): void {
    if (e.key === 'Enter') { e.preventDefault(); commit(); }
  }

  return (
    <form
      className={`order-entry ${flash ?? ''}`}
      onKeyDown={onKeyDown}
      onSubmit={(e) => { e.preventDefault(); commit(); }}
    >
      <div className="row">
        <button
          type="button"
          className={`side-btn buy  ${side === 'buy'  ? 'active' : ''}`}
          onClick={() => setSide('buy')}
        >Buy</button>
        <button
          type="button"
          className={`side-btn sell ${side === 'sell' ? 'active' : ''}`}
          onClick={() => setSide('sell')}
        >Sell</button>
      </div>

      <label className="field">
        <span>Type</span>
        <select value={type} onChange={(e) => setType(e.target.value as OrderType)}>
          <option value="limit">Limit (rests on book)</option>
          <option value="market">Market (any price)</option>
          <option value="ioc">IOC (fill what you can, cancel rest)</option>
          <option value="fok">FOK (all or nothing)</option>
        </select>
      </label>

      <label className="field">
        <span>Price {!needsPrice && <em>(ignored)</em>}</span>
        <input
          ref={priceRef}
          type="number"
          step="0.01"
          min="0"
          value={price}
          disabled={!needsPrice}
          onChange={(e) => setPrice(e.target.value)}
        />
      </label>

      <label className="field">
        <span>Quantity</span>
        <input
          type="number"
          step="1"
          min="1"
          value={qty}
          onChange={(e) => setQty(e.target.value)}
        />
      </label>

      <button type="submit" className="submit-btn" disabled={disabled}>
        {disabled ? 'Disconnected' : `Send ${side.toUpperCase()} (Enter)`}
      </button>

      <div className="hint">
        Tip: best bid {bestBid?.toFixed(2) ?? '—'} · best ask {bestAsk?.toFixed(2) ?? '—'}
      </div>
    </form>
  );
}
