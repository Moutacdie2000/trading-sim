import type { PnlState } from './useEngineFeed';

interface Props {
  pnl:             PnlState;
  reservedCash:    number;
  availableCash:   number;
  onRecharge:      () => void;
  onReset:         () => void;
  onClosePosition: () => void;
}

function sign(n: number): string { return n >= 0 ? '+' : ''; }

export function Pnl({
  pnl, reservedCash, availableCash,
  onRecharge, onReset, onClosePosition,
}: Props) {
  const pnlClass        = pnl.totalPnl       > 0 ? 'pos' : pnl.totalPnl       < 0 ? 'neg' : '';
  const realizedClass   = pnl.realizedPnl    > 0 ? 'pos' : pnl.realizedPnl    < 0 ? 'neg' : '';
  const unrealizedClass = pnl.unrealizedPnl  > 0 ? 'pos' : pnl.unrealizedPnl  < 0 ? 'neg' : '';
  const posClass        = pnl.position       > 0 ? 'pos' : pnl.position       < 0 ? 'neg' : '';
  const lowBalance      = pnl.balance < pnl.startingEquity * 0.1;

  const baseline  = pnl.startingEquity + pnl.totalRecharged;
  const pctReturn = baseline > 0 ? (pnl.totalPnl / baseline) * 100 : 0;

  return (
    <div className="pnl">
      <div className="pnl-row">
        <span className="lbl">Cash balance</span>
        <span className={`val ${lowBalance ? 'neg' : ''}`}>${pnl.balance.toFixed(2)}</span>
      </div>
      {reservedCash > 0 && (
        <>
          <div className="pnl-row sub">
            <span className="lbl"> · reserved (resting buys)</span>
            <span className="val muted">−${reservedCash.toFixed(2)}</span>
          </div>
          <div className="pnl-row sub">
            <span className="lbl"> · available</span>
            <span className="val">${availableCash.toFixed(2)}</span>
          </div>
        </>
      )}

      <div className="pnl-row">
        <span className="lbl">Position</span>
        <span className={`val ${posClass}`}>
          {sign(pnl.position)}{pnl.position}
        </span>
      </div>
      {pnl.position !== 0 && (
        <div className="pnl-row sub">
          <span className="lbl"> · avg cost</span>
          <span className="val">{pnl.avgCost.toFixed(2)}</span>
        </div>
      )}

      <div className="pnl-row">
        <span className="lbl">Mark price</span>
        <span className="val">{pnl.marketPrice > 0 ? pnl.marketPrice.toFixed(2) : '—'}</span>
      </div>

      <div className="pnl-row">
        <span className="lbl">Realized P&amp;L</span>
        <span className={`val ${realizedClass}`}>
          {sign(pnl.realizedPnl)}${pnl.realizedPnl.toFixed(2)}
        </span>
      </div>
      <div className="pnl-row">
        <span className="lbl">Unrealized P&amp;L</span>
        <span className={`val ${unrealizedClass}`}>
          {sign(pnl.unrealizedPnl)}${pnl.unrealizedPnl.toFixed(2)}
        </span>
      </div>

      <div className="pnl-row total">
        <span className="lbl">Total P&amp;L</span>
        <span className={`val ${pnlClass}`}>
          {sign(pnl.totalPnl)}${pnl.totalPnl.toFixed(2)}{' '}
          <small>({sign(pctReturn)}{pctReturn.toFixed(2)}%)</small>
        </span>
      </div>

      <div className="pnl-actions">
        <button
          className="close-pos-btn"
          onClick={onClosePosition}
          disabled={pnl.position === 0}
          title="Submit a market order to flatten the position"
        >
          ✕ Close position
        </button>
        <button className="recharge-btn" onClick={onRecharge} title="Add $10,000 to your cash balance">
          + Recharge $10k
        </button>
        <button className="reset-btn" onClick={onReset} title="Cancel resting orders, reset balance and P&L">
          Reset
        </button>
      </div>

      <p className="muted small">
        Total recharged: ${pnl.totalRecharged.toFixed(2)} · realized + unrealized must equal total
      </p>
    </div>
  );
}
