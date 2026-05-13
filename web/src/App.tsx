import { DepthChart } from './DepthChart.js';
import { StatsPanel } from './StatsPanel.js';
import { useEngineFeed } from './useEngineFeed.js';

const FEED_URL = import.meta.env.VITE_FEED_URL ?? 'ws://localhost:8080/feed';

export function App() {
  const { book, trades, stats, priceHistory, connected, nextRetryInMs } =
    useEngineFeed(FEED_URL);

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
      </header>

      <section className="grid">
        <article>
          <h2>Depth</h2>
          <DepthChart bids={book?.bids ?? []} asks={book?.asks ?? []} />
        </article>

        <article>
          <h2>Recent trades</h2>
          <ol className="tape">
            {trades.map((t) => (
              <li key={`${t.ts}-${t.buy}-${t.sell}`}>
                <code>{new Date(t.ts).toISOString().slice(11, 19)}</code>
                <span>{t.qty} @ {t.price.toFixed(2)}</span>
              </li>
            ))}
          </ol>
        </article>

        <article>
          <h2>Order book</h2>
          {book === null ? (
            <p>Waiting for snapshot…</p>
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
      </section>
    </main>
  );
}
