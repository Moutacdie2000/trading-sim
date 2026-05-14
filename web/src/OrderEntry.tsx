import { useEffect, useMemo, useState } from 'react';

import type { OrderSide, OrderType } from './types.js';

interface Props {
  bestBid:  number | null;
  bestAsk:  number | null;
  balance:  number;
  disabled: boolean;
  onSubmit: (params: { side: OrderSide; type: OrderType; price: number; qty: number }) =>
              { ok: true; clientId: string } | { ok: false; reason: string };
}

export function OrderEntry({ bestBid, bestAsk, balance, disabled, onSubmit }: Props) {
  const [side,  setSide]  = useState<OrderSide>('buy');
  const [type,  setType]  = useState<OrderType>('limit');
  const [price, setPrice] = useState<string>('');
  const [qty,   setQty]   = useState<string>('5');
  const [flash, setFlash] = useState<'ok' | 'err' | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (price === '' && type !== 'market') {
      const ref = side === 'buy' ? bestAsk : bestBid;
      if (ref !== null) setPrice(ref.toFixed(2));
    }
  }, [bestBid, bestAsk, price, type, side]);

  const needsPrice = type !== 'market';
  const numericPrice = Number.parseFloat(price);
  const numericQty   = Number.parseInt(qty, 10);

  const estCost = useMemo(() => {
    if (!Number.isFinite(numericQty) || numericQty <= 0) return null;
    if (side === 'sell') return null;
    const ref = needsPrice ? numericPrice : bestAsk;
    if (ref === null || !Number.isFinite(ref) || ref <= 0) return null;
    return ref * numericQty;
  }, [side, needsPrice, numericPrice, numericQty, bestAsk]);

  const insufficient = estCost !== null && estCost > balance;

  function commit(): void {
    setError(null);
    const q = numericQty;
    const p = needsPrice ? numericPrice : 0;
    if (!Number.isFinite(q) || q <= 0)                          { setFlash('err'); setError('Quantity must be a positive integer'); return; }
    if (needsPrice && (!Number.isFinite(p) || p <= 0))          { setFlash('err'); setError('Price must be positive'); return; }
    const res = onSubmit({ side, type, price: p, qty: q });
    if (!res.ok) {
      setFlash('err');
      setError(res.reason);
      return;
    }
    setFlash('ok');
    setQty('5');
  }

  useEffect(() => {
    if (flash === null) return;
    const t = setTimeout(() => setFlash(null), 600);
    return () => clearTimeout(t);
  }, [flash]);

  function onKeyDown(e: React.KeyboardEvent<HTMLFormElement>): void {
    if (e.key === 'Enter') { e.preventDefault(); commit(); }
  }

  const submitDisabled = disabled || insufficient;

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

      {estCost !== null && (
        <div className={`cost-line ${insufficient ? 'bad' : ''}`}>
          Est. cost: ${estCost.toFixed(2)} · balance ${balance.toFixed(2)}
          {insufficient && ' · insufficient'}
        </div>
      )}

      <button type="submit" className="submit-btn" disabled={submitDisabled}>
        {disabled
          ? 'Disconnected'
          : insufficient
              ? 'Not enough cash'
              : `Send ${side.toUpperCase()} (Enter)`}
      </button>

      {error !== null && <div className="error">{error}</div>}

      <div className="hint">
        best bid {bestBid?.toFixed(2) ?? '—'} · best ask {bestAsk?.toFixed(2) ?? '—'}
      </div>
    </form>
  );
}
