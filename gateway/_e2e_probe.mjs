import { WebSocket } from 'ws';

const ws = new WebSocket('ws://localhost:8090/feed');
const events = { trade: 0, book: 0, stats: 0, ack: 0, state: 0 };
const samples = { ack: null, user_trade: null, state: null };
let bestBid = null, bestAsk = null;

ws.on('open', async () => {
  // Wait briefly for the first book snapshot so we know a realistic price.
  await new Promise((r) => setTimeout(r, 700));

  // Pause synthetic flow so my orders are easier to inspect deterministically.
  ws.send(JSON.stringify({ cmd: 'pause' }));
  await new Promise((r) => setTimeout(r, 300));

  // Submit a market BUY for 3 — should match against the resting asks immediately.
  ws.send(JSON.stringify({
    cmd: 'submit', side: 'buy', type: 'market', price: 0, qty: 3, client_id: 'probe-1',
  }));

  // Submit a limit SELL well above the spread that should rest.
  ws.send(JSON.stringify({
    cmd: 'submit', side: 'sell', type: 'limit', price: 999.99, qty: 2, client_id: 'probe-2',
  }));

  await new Promise((r) => setTimeout(r, 600));

  ws.send(JSON.stringify({ cmd: 'resume' }));
  await new Promise((r) => setTimeout(r, 400));

  ws.close();
  console.log('events:', JSON.stringify(events));
  for (const [k, v] of Object.entries(samples)) {
    if (v) console.log(`sample ${k}:`, JSON.stringify(v).slice(0, 200));
  }
  process.exit(0);
});

ws.on('message', (raw) => {
  const ev = JSON.parse(raw.toString());
  if (events[ev.type] !== undefined) events[ev.type] += 1;
  if (ev.type === 'book') {
    bestBid = ev.bids[0]?.[0] ?? bestBid;
    bestAsk = ev.asks[0]?.[0] ?? bestAsk;
  }
  if (ev.type === 'ack'   && !samples.ack)        samples.ack = ev;
  if (ev.type === 'state' && !samples.state)      samples.state = ev;
  if (ev.type === 'trade' && (ev.user_buy || ev.user_sell) && !samples.user_trade) {
    samples.user_trade = ev;
  }
});

ws.on('error', (err) => { console.error('ws error:', err.message); process.exit(1); });
