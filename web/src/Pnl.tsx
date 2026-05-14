import type { PnlState } from './useEngineFeed.js';

interface Props { pnl: PnlState; }

export function Pnl({ pnl }: Props) {
  const pnlClass = pnl.totalPnl > 0 ? 'pos' : pnl.totalPnl < 0 ? 'neg' : '';
  const posClass = pnl.position > 0 ? 'pos' : pnl.position < 0 ? 'neg' : '';

  return (
    <div className="pnl">
      <div className="pnl-row">
        <span className="lbl">Position</span>
        <span className={`val ${posClass}`}>
          {pnl.position > 0 ? '+' : ''}{pnl.position}
        </span>
      </div>
      <div className="pnl-row">
        <span className="lbl">Mark price</span>
        <span className="val">{pnl.marketPrice > 0 ? pnl.marketPrice.toFixed(2) : '—'}</span>
      </div>
      <div className="pnl-row">
        <span className="lbl">Cash flow</span>
        <span className="val">{pnl.cashFlow.toFixed(2)}</span>
      </div>
      <div className="pnl-row total">
        <span className="lbl">Mark-to-market P&amp;L</span>
        <span className={`val ${pnlClass}`}>
          {pnl.totalPnl > 0 ? '+' : ''}{pnl.totalPnl.toFixed(2)}
        </span>
      </div>
      <p className="muted small">
        cash + position × mark · resets if you reload the page
      </p>
    </div>
  );
}
