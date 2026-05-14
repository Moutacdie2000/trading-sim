import { useEffect, useRef, useState, useCallback } from 'react';

import type {
  BookEvent, EngineEvent, MyOrder, PriceSample,
  StatsEvent, TradeEvent, ClientCommand,
} from './types.js';

const MAX_TRADES        = 50;
const PRICE_BUFFER_MS   = 60_000;
const BACKOFF_STEPS_MS  = [1_000, 2_000, 4_000, 8_000, 16_000, 30_000] as const;
const STABLE_OPEN_MS    = 10_000;

export interface PnlState {
  position:    number;
  cashFlow:    number;
  totalPnl:    number;
  marketPrice: number;
  realized:    number;
}

export interface FeedState {
  book:          BookEvent | null;
  trades:        TradeEvent[];
  stats:         StatsEvent | null;
  priceHistory:  PriceSample[];
  connected:     boolean;
  nextRetryInMs: number | null;
  paused:        boolean;
  myOrders:      MyOrder[];
  pnl:           PnlState;
}

export interface FeedApi extends FeedState {
  send:   (cmd: ClientCommand) => void;
  submit: (params: Omit<Extract<ClientCommand, { cmd: 'submit' }>, 'cmd' | 'client_id'>) => string;
  cancel: (orderId: number) => void;
  togglePause: () => void;
}

const initialPnl: PnlState = {
  position: 0, cashFlow: 0, totalPnl: 0, marketPrice: 0, realized: 0,
};

const initialState: FeedState = {
  book: null, trades: [], stats: null, priceHistory: [],
  connected: false, nextRetryInMs: null, paused: false,
  myOrders: [], pnl: initialPnl,
};

function applyTrade(state: FeedState, trade: TradeEvent): FeedState {
  const cutoff       = trade.ts - PRICE_BUFFER_MS;
  const priceHistory = [...state.priceHistory.filter((p) => p.ts >= cutoff), {
    ts: trade.ts, price: trade.price,
  }];

  let myOrders = state.myOrders;
  let pnl      = state.pnl;

  const buyIndex  = trade.user_buy  ? myOrders.findIndex((o) => o.orderId === trade.buy)  : -1;
  const sellIndex = trade.user_sell ? myOrders.findIndex((o) => o.orderId === trade.sell) : -1;

  if (buyIndex !== -1 || sellIndex !== -1) {
    myOrders = myOrders.map((o, i) => {
      if (i !== buyIndex && i !== sellIndex) return o;
      const filledQty = o.filledQty + trade.qty;
      return {
        ...o,
        filledQty,
        status: filledQty >= o.qty ? 'filled' : o.status,
      };
    });

    if (buyIndex !== -1) {
      const cashFlow = pnl.cashFlow - trade.qty * trade.price;
      const position = pnl.position + trade.qty;
      pnl = { ...pnl, cashFlow, position };
    }
    if (sellIndex !== -1) {
      const cashFlow = pnl.cashFlow + trade.qty * trade.price;
      const position = pnl.position - trade.qty;
      pnl = { ...pnl, cashFlow, position };
    }
    pnl = { ...pnl, totalPnl: pnl.cashFlow + pnl.position * (pnl.marketPrice || trade.price) };
  }

  return {
    ...state,
    trades: [trade, ...state.trades].slice(0, MAX_TRADES),
    priceHistory, myOrders, pnl,
  };
}

function applyBook(state: FeedState, book: BookEvent): FeedState {
  const bestBid = book.bids[0]?.[0];
  const bestAsk = book.asks[0]?.[0];
  const mid     = bestBid !== undefined && bestAsk !== undefined
    ? (bestBid + bestAsk) / 2
    : state.pnl.marketPrice;
  const pnl = {
    ...state.pnl,
    marketPrice: mid,
    totalPnl:    state.pnl.cashFlow + state.pnl.position * mid,
  };
  return { ...state, book, pnl };
}

export function useEngineFeed(url: string): FeedApi {
  const [state, setState] = useState<FeedState>(initialState);

  const wsRef          = useRef<WebSocket | null>(null);
  const retryTimerRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tickTimerRef   = useRef<ReturnType<typeof setInterval> | null>(null);
  const stableTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const attemptRef     = useRef(0);
  const closedRef      = useRef(false);

  const send = useCallback((cmd: ClientCommand): void => {
    const ws = wsRef.current;
    if (ws === null || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify(cmd));
  }, []);

  const submit: FeedApi['submit'] = useCallback((params) => {
    const clientId = (typeof crypto !== 'undefined' && 'randomUUID' in crypto)
      ? crypto.randomUUID()
      : `c-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const draft: MyOrder = {
      clientId,
      orderId:     null,
      side:        params.side,
      type:        params.type,
      price:       params.price,
      qty:         params.qty,
      filledQty:   0,
      status:      'pending',
      submittedAt: Date.now(),
    };
    setState((s) => ({ ...s, myOrders: [draft, ...s.myOrders].slice(0, 20) }));
    send({ cmd: 'submit', ...params, client_id: clientId });
    return clientId;
  }, [send]);

  const cancel = useCallback((orderId: number) => {
    send({ cmd: 'cancel', id: orderId });
  }, [send]);

  const togglePause = useCallback(() => {
    setState((s) => {
      send({ cmd: s.paused ? 'resume' : 'pause' });
      return s;
    });
  }, [send]);

  useEffect(() => {
    closedRef.current = false;

    const clearRetryTimer = (): void => {
      if (retryTimerRef.current !== null) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
      if (tickTimerRef.current !== null) {
        clearInterval(tickTimerRef.current);
        tickTimerRef.current = null;
      }
    };

    const clearStableTimer = (): void => {
      if (stableTimerRef.current !== null) {
        clearTimeout(stableTimerRef.current);
        stableTimerRef.current = null;
      }
    };

    const scheduleRetry = (): void => {
      const idx     = Math.min(attemptRef.current, BACKOFF_STEPS_MS.length - 1);
      const totalMs = BACKOFF_STEPS_MS[idx]!;
      attemptRef.current += 1;

      const startedAt = Date.now();
      setState((s) => ({ ...s, connected: false, nextRetryInMs: totalMs }));

      tickTimerRef.current = setInterval(() => {
        const remaining = Math.max(0, totalMs - (Date.now() - startedAt));
        setState((s) => ({ ...s, nextRetryInMs: remaining }));
      }, 250);

      retryTimerRef.current = setTimeout(() => {
        retryTimerRef.current = null;
        if (tickTimerRef.current !== null) {
          clearInterval(tickTimerRef.current);
          tickTimerRef.current = null;
        }
        if (closedRef.current) return;
        connect();
      }, totalMs);
    };

    function connect(): void {
      const Ctor = (globalThis as { WebSocket: typeof WebSocket }).WebSocket;
      const ws   = new Ctor(url);
      wsRef.current = ws;

      ws.onopen = () => {
        clearRetryTimer();
        setState((s) => ({ ...s, connected: true, nextRetryInMs: null }));
        stableTimerRef.current = setTimeout(() => {
          attemptRef.current = 0;
        }, STABLE_OPEN_MS);
      };

      ws.onclose = () => {
        clearStableTimer();
        wsRef.current = null;
        if (closedRef.current) return;
        scheduleRetry();
      };

      ws.onerror = () => { /* surface via onclose */ };

      ws.onmessage = (msg: MessageEvent<string>) => {
        try {
          const event = JSON.parse(msg.data) as EngineEvent;
          switch (event.type) {
            case 'trade':
              setState((s) => applyTrade(s, event));
              break;
            case 'book':
              setState((s) => applyBook(s, event));
              break;
            case 'stats':
              setState((s) => ({ ...s, stats: event }));
              break;
            case 'state':
              setState((s) => ({ ...s, paused: event.paused }));
              break;
            case 'ack':
              if (event.kind === 'submit' && event.client_id !== undefined) {
                const clientId = event.client_id;
                const orderId  = event.order_id;
                setState((s) => ({
                  ...s,
                  myOrders: s.myOrders.map((o) =>
                    o.clientId === clientId
                      ? { ...o, orderId, status: 'accepted' }
                      : o),
                }));
              } else if (event.kind === 'cancel') {
                const orderId = event.order_id;
                const ok      = event.ok ?? false;
                setState((s) => ({
                  ...s,
                  myOrders: s.myOrders.map((o) =>
                    o.orderId === orderId
                      ? { ...o, status: ok ? 'cancelled' : o.status }
                      : o),
                }));
              }
              break;
          }
        } catch {
          // ignore malformed frames
        }
      };
    }

    connect();

    return () => {
      closedRef.current = true;
      clearRetryTimer();
      clearStableTimer();
      const ws = wsRef.current;
      wsRef.current = null;
      if (ws !== null) ws.close();
    };
  }, [url]);

  return { ...state, send, submit, cancel, togglePause };
}
