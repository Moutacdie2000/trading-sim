import { useEngineFeed } from './useEngineFeed.js';
import { DepthChart }   from './DepthChart.js';
import { Candlestick }  from './Candlestick.js';
import { StatsPanel }   from './StatsPanel.js';
import { OrderEntry }   from './OrderEntry.js';
import { MyOrders }     from './MyOrders.js';
import { Pnl }          from './Pnl.js';
import { Help }         from './Help.js';

const FEED_URL = import.meta.env.VITE_FEED_URL ?? 'ws://localhost:8080/feed';

export function App() {
  const feed = useEngineFeed(FEED_URL);
  const {
    book, trades, candles, stats, priceHistory,
    connected, nextRetryInMs, paused,
    myOrders, pnl,
    submit, cancel, togglePause, recharge, reset,
  } = feed;

  const bestBid = book?.bids[0]?.[0] ?? null;
  const bestAsk = book?.asks[0]?.[0] ?? null;

  return (
    <main>
      <header>
        <h1>trading-sim</h1>
        <span className={connected ? 'pill ok' : 'pill ko'}>
          {connected ? 'live' : 'disconnected'}
        </span>
        {!connected && nextRetryInMs !== null && (
          <span className="banner">
            Reconnecting in {Math.max(1, Math.ceil(nextRetryInMs / 1000))}s…
          </span>
        )}
        <span className="spacer" />
        <span className="balance-chip" title="Available cash">
          💰 ${pnl.balance.toFixed(2)}
        </span>
        <button
          className={`pause-btn ${paused ? 'paused' : ''}`}
          onClick={togglePause}
          disabled={!connected}
          title="Pause/resume the synthetic order flow"
        >
          {paused ? '▶ Resume flow' : '⏸ Pause flow'}
        </button>
        <Help />
      </header>

      <section className="grid">
        <article className="entry-panel">
          <h2>Submit order</h2>
          <OrderEntry
            bestBid={bestBid}
            bestAsk={bestAsk}
            balance={pnl.balance}
            disabled={!connected}
            onSubmit={submit}
          />
        </article>

        <article className="candles-panel">
          <h2>Price (5s candles)</h2>
          <Candlestick candles={candles} />
        </article>

        <article>
          <h2>P&amp;L</h2>
          <Pnl pnl={pnl} onRecharge={recharge} onReset={reset} />
        </article>

        <article>
          <h2>Depth</h2>
          <DepthChart bids={book?.bids ?? []} asks={book?.asks ?? []} />
        </article>

        <article className="trades-panel">
          <h2>Recent trades</h2>
          <ol className="tape">
            {trades.map((t) => {
              const isUser = t.user_buy || t.user_sell;
              return (
                <li key={`${t.ts}-${t.buy}-${t.sell}`} className={isUser ? 'user-trade' : ''}>
                  <code>{new Date(t.ts).toISOString().slice(11, 19)}</code>
                  <span>
                    {isUser && <span className="user-tag">{t.user_buy ? 'YOU BUY' : 'YOU SELL'}</span>}
                    {t.qty} @ {t.price.toFixed(2)}
                  </span>
                </li>
              );
            })}
          </ol>
        </article>

        <article>
          <h2>Order book</h2>
          {book === null ? (
            <p className="muted">Waiting for snapshot…</p>
          ) : (
            <div className="book">
              <table>
                <thead><tr><th>Bid qty</th><th>Bid</th></tr></thead>
                <tbody>
                  {book.bids.map(([price, qty]) => (
                    <tr key={`b-${price}`}>
                      <td>{qty}</td>
                      <td className="bid">{price.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <table>
                <thead><tr><th>Ask</th><th>Ask qty</th></tr></thead>
                <tbody>
                  {book.asks.map(([price, qty]) => (
                    <tr key={`a-${price}`}>
                      <td className="ask">{price.toFixed(2)}</td>
                      <td>{qty}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </article>

        <StatsPanel stats={stats} priceHistory={priceHistory} />

        <article className="orders-panel">
          <h2>My orders</h2>
          <MyOrders orders={myOrders} onCancel={cancel} />
        </article>
      </section>
    </main>
  );
}
