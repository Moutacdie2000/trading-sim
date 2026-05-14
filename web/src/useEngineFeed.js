import { useEffect, useRef, useState } from 'react';
const MAX_TRADES = 50;
const PRICE_BUFFER_MS = 60_000;
const BACKOFF_STEPS_MS = [1_000, 2_000, 4_000, 8_000, 16_000, 30_000];
const STABLE_OPEN_MS = 10_000;
function applyTrade(state, trade) {
    const cutoff = trade.ts - PRICE_BUFFER_MS;
    const history = [...state.priceHistory.filter((p) => p.ts >= cutoff), {
            ts: trade.ts,
            price: trade.price,
        }];
    return {
        ...state,
        trades: [trade, ...state.trades].slice(0, MAX_TRADES),
        priceHistory: history,
    };
}
export function useEngineFeed(url) {
    const [state, setState] = useState({
        book: null,
        trades: [],
        stats: null,
        priceHistory: [],
        connected: false,
        nextRetryInMs: null,
    });
    const wsRef = useRef(null);
    const retryTimerRef = useRef(null);
    const tickTimerRef = useRef(null);
    const stableTimerRef = useRef(null);
    const attemptRef = useRef(0);
    const closedRef = useRef(false);
    useEffect(() => {
        closedRef.current = false;
        const clearRetryTimer = () => {
            if (retryTimerRef.current !== null) {
                clearTimeout(retryTimerRef.current);
                retryTimerRef.current = null;
            }
            if (tickTimerRef.current !== null) {
                clearInterval(tickTimerRef.current);
                tickTimerRef.current = null;
            }
        };
        const clearStableTimer = () => {
            if (stableTimerRef.current !== null) {
                clearTimeout(stableTimerRef.current);
                stableTimerRef.current = null;
            }
        };
        const scheduleRetry = () => {
            const idx = Math.min(attemptRef.current, BACKOFF_STEPS_MS.length - 1);
            const totalMs = BACKOFF_STEPS_MS[idx];
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
                if (closedRef.current)
                    return;
                connect();
            }, totalMs);
        };
        function connect() {
            const Ctor = globalThis.WebSocket;
            const ws = new Ctor(url);
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
                if (closedRef.current)
                    return;
                scheduleRetry();
            };
            ws.onerror = () => { };
            ws.onmessage = (msg) => {
                try {
                    const event = JSON.parse(msg.data);
                    if (event.type === 'trade') {
                        setState((s) => applyTrade(s, event));
                    }
                    else if (event.type === 'book') {
                        setState((s) => ({ ...s, book: event }));
                    }
                    else if (event.type === 'stats') {
                        setState((s) => ({ ...s, stats: event }));
                    }
                }
                catch {
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
            if (ws !== null)
                ws.close();
        };
    }, [url]);
    return state;
}
