import type { PnlState } from './useEngineFeed';

interface Props {
  pnl:           PnlState;
  reservedCash:  number;
  availableCash: number;
  onRecharge:    () => void;
  onReset:       () => void;
}

export function Pnl({ pnl, reservedCash, availableCash, onRecharge, onReset }: Props) {
  const pnlClass = pnl.totalPnl > 0 ? 'pos' : pnl.totalPnl < 0 ? 'neg' : '';
  const posClass = pnl.position > 0 ? 'pos' : pnl.position < 0 ? 'neg' : '';
  const lowBalance = pnl.balance < pnl.startingEquity * 0.1;

  const baseline = pnl.startingEquity + pnl.totalRecharged;
  const pctReturn = baseline > 0 ? (pnl.totalPnl / baseline) * 100 : 0;

  return (
    <div className="pnl">
      <div className="pnl-row">
        <span className="lbl">Cash balance</span>
        <span className={`val ${lowBalance ? 'neg' : ''}`}>
          ${pnl.balance.toFixed(2)}
        </span>
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
          {pnl.position > 0 ? '+' : ''}{pnl.position}
        </span>
      </div>
      <div className="pnl-row">
        <span className="lbl">Mark price</span>
        <span className="val">
          {pnl.marketPrice > 0 ? pnl.marketPrice.toFixed(2) : '—'}
        </span>
      </div>
      <div className="pnl-row">
        <span className="lbl">Equity (cash + pos × mark)</span>
        <span className="val">${pnl.equity.toFixed(2)}</span>
      </div>
      <div className="pnl-row total">
        <span className="lbl">P&amp;L</span>
        <span className={`val ${pnlClass}`}>
          {pnl.totalPnl >= 0 ? '+' : ''}${pnl.totalPnl.toFixed(2)}
          {' '}<small>({pctReturn >= 0 ? '+' : ''}{pctReturn.toFixed(2)}%)</small>
        </span>
      </div>

      <div className="pnl-actions">
        <button className="recharge-btn" onClick={onRecharge} title="Add $10,000 to your cash balance">
          + Recharge $10k
        </button>
        <button className="reset-btn" onClick={onReset} title="Reset balance, P&L, and history">
          Reset
        </button>
      </div>

      <p className="muted small">
        Total recharged: ${pnl.totalRecharged.toFixed(2)} · P&amp;L is vs. cumulative deposits
      </p>
    </div>
  );
}
