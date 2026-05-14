import { useState } from 'react';

export function Help() {
  const [open, setOpen] = useState(true);
  if (!open) {
    return (
      <button className="help-pill" onClick={() => setOpen(true)} title="Show explainer">
        ? What is this
      </button>
    );
  }
  return (
    <aside className="explainer">
      <button className="close" aria-label="Close" onClick={() => setOpen(false)}>×</button>
      <h3>What is this?</h3>
      <p>
        A live <strong>limit-order-book simulator</strong>. A C++ matching engine generates a
        continuous stream of synthetic orders and broadcasts every trade and book snapshot
        over WebSocket in real time.
      </p>
      <p>
        <strong>You can interact with it.</strong> Submit your own buy/sell orders with the form
        on the left — they go to the same engine, match against the synthetic flow, and update
        your live <em>position</em> and <em>mark-to-market P&amp;L</em>.
      </p>
      <p>
        Trades involving your orders are <span className="user-tag">highlighted</span>. You can
        also <em>pause</em> the synthetic flow to play with the book on your own, then resume.
      </p>
    </aside>
  );
}
