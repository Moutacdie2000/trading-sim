import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type {
  BookEvent, EngineEvent, MyOrder, PriceSample,
  StatsEvent, TradeEvent, TradeSample, ClientCommand,
} from './types';
import {
  applyBook, applyRecharge, applyTradeToOrders, applyUserFill, appendTradeSample,
  evaluateBuy, initialPnl, reservedCash,
  type PnlState,
} from './pnlReducer';

const MAX_TRADES        = 50;
const PRICE_BUFFER_MS   = 60_000;
const BACKOFF_STEPS_MS  = [1_000, 2_000, 4_000, 8_000, 16_000, 30_000] as const;
const STABLE_OPEN_MS    = 10_000;

export type { PnlState } from './pnlReducer';

export interface FeedState {
  book:          BookEvent | null;
  trades:        TradeEvent[];
  tradeSamples:  TradeSample[];
  stats:         StatsEvent | null;
  priceHistory:  PriceSample[];
  connected:     boolean;
  nextRetryInMs: number | null;
  paused:        boolean;
  myOrders:      MyOrder[];
  pnl:           PnlState;
}

export interface FeedApi extends FeedState {
  reservedCash:   number;
  availableCash:  number;
  send:           (cmd: ClientCommand) => void;
  submit:         (params: Omit<Extract<ClientCommand, { cmd: 'submit' }>, 'cmd' | 'client_id'>) =>
                    { ok: true; clientId: string } | { ok: false; reason: string };
  cancel:         (orderId: number) => void;
  togglePause:    () => void;
  recharge:       () => void;
  reset:          () => void;
}

const initialState: FeedState = {
  book: null, trades: [], tradeSamples: [], stats: null, priceHistory: [],
  connected: false, nextRetryInMs: null, paused: false,
  myOrders: [], pnl: initialPnl,
};

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

    let blocked: string | null = null;
    setState((s) => {
      if (params.side === 'buy') {
        const bestAsk = s.book?.asks[0]?.[0] ?? null;
        const result  = evaluateBuy(params.type, params.price, params.qty, bestAsk, s.pnl, s.myOrders);
        if (!result.affordable) {
          blocked = result.estimatedCost <= 0 || !Number.isFinite(result.estimatedCost)
            ? 'Cannot price this order'
            : `Insufficient available cash: need $${result.estimatedCost.toFixed(2)}, available $${result.available.toFixed(2)}`;
          return s;
        }
      } else if (params.type !== 'limit' && s.pnl.marketPrice <= 0) {
        blocked = 'Waiting for market price';
        return s;
      }

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
      return { ...s, myOrders: [draft, ...s.myOrders].slice(0, 20) };
    });

    if (blocked !== null) return { ok: false, reason: blocked };
    send({ cmd: 'submit', ...params, client_id: clientId });
    return { ok: true, clientId };
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

  const recharge = useCallback(() => {
    setState((s) => ({ ...s, pnl: applyRecharge(s.pnl) }));
  }, []);

  const reset = useCallback(() => {
    setState((s) => ({
      ...s,
      myOrders: [], pnl: initialPnl, tradeSamples: [], priceHistory: [], trades: [],
    }));
  }, []);

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
            case 'trade': {
              const trade = event;
              setState((s) => {
                const cutoff       = trade.ts - PRICE_BUFFER_MS;
                const priceHistory = [...s.priceHistory.filter((p) => p.ts >= cutoff), {
                  ts: trade.ts, price: trade.price,
                }];
                const isUserFill = (trade.user_buy === true && s.myOrders.some((o) => o.orderId === trade.buy))
                                || (trade.user_sell === true && s.myOrders.some((o) => o.orderId === trade.sell));
                return {
                  ...s,
                  trades:       [trade, ...s.trades].slice(0, MAX_TRADES),
                  tradeSamples: appendTradeSample(s.tradeSamples, trade),
                  priceHistory,
                  myOrders:     isUserFill ? applyTradeToOrders(s.myOrders, trade) : s.myOrders,
                  pnl:          isUserFill ? applyUserFill(s.pnl, trade) : s.pnl,
                };
              });
              break;
            }
            case 'book': {
              const book = event;
              setState((s) => ({ ...s, book, pnl: applyBook(s.pnl, book) }));
              break;
            }
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

  const reserved  = useMemo(() => reservedCash(state.myOrders), [state.myOrders]);
  const available = state.pnl.balance - reserved;

  return {
    ...state,
    reservedCash:  reserved,
    availableCash: available,
    send, submit, cancel, togglePause, recharge, reset,
  };
}
