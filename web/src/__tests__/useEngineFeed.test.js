import { jsx as _jsx } from "react/jsx-runtime";
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useEngineFeed } from '../useEngineFeed.js';
const sockets = [];
function makeFakeSocket(url) {
    const ws = {
        readyState: 0,
        url,
        onopen: null,
        onclose: null,
        onerror: null,
        onmessage: null,
        send: vi.fn(),
        close: vi.fn(() => { ws.readyState = 3; }),
    };
    sockets.push(ws);
    return ws;
}
const FakeWebSocketCtor = function (url) {
    const s = makeFakeSocket(url);
    Object.assign(this, s);
    sockets[sockets.length - 1] = this;
};
let container;
let root;
let captured = null;
function Probe({ url }) {
    captured = useEngineFeed(url);
    return null;
}
beforeEach(() => {
    sockets.length = 0;
    captured = null;
    vi.stubGlobal('WebSocket', FakeWebSocketCtor);
    vi.useFakeTimers();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
});
afterEach(() => {
    act(() => { root.unmount(); });
    container.remove();
    vi.useRealTimers();
    vi.unstubAllGlobals();
});
describe('useEngineFeed', () => {
    it('reconnects with exponential backoff after a forced close', () => {
        act(() => { root.render(_jsx(Probe, { url: "ws://x/feed" })); });
        expect(sockets.length).toBe(1);
        const first = sockets[0];
        act(() => {
            first.readyState = 1;
            first.onopen?.(new Event('open'));
        });
        expect(captured.connected).toBe(true);
        act(() => {
            first.readyState = 3;
            first.onclose?.(new CloseEvent('close'));
        });
        expect(captured.connected).toBe(false);
        expect(captured.nextRetryInMs).toBe(1_000);
        act(() => { vi.advanceTimersByTime(1_000); });
        expect(sockets.length).toBe(2);
        const second = sockets[1];
        act(() => {
            second.readyState = 3;
            second.onclose?.(new CloseEvent('close'));
        });
        expect(captured.nextRetryInMs).toBe(2_000);
        act(() => { vi.advanceTimersByTime(2_000); });
        expect(sockets.length).toBe(3);
    });
    it('updates state on a trade message', () => {
        act(() => { root.render(_jsx(Probe, { url: "ws://x/feed" })); });
        const ws = sockets[0];
        act(() => {
            ws.readyState = 1;
            ws.onopen?.(new Event('open'));
            ws.onmessage?.(new MessageEvent('message', {
                data: JSON.stringify({
                    type: 'trade', ts: 1000, price: 100, qty: 5, buy: 1, sell: 2,
                }),
            }));
        });
        expect(captured.trades).toHaveLength(1);
        expect(captured.trades[0].price).toBe(100);
        expect(captured.priceHistory).toHaveLength(1);
    });
    it('updates state on a stats message', () => {
        act(() => { root.render(_jsx(Probe, { url: "ws://x/feed" })); });
        const ws = sockets[0];
        act(() => {
            ws.readyState = 1;
            ws.onopen?.(new Event('open'));
            ws.onmessage?.(new MessageEvent('message', {
                data: JSON.stringify({
                    type: 'stats', ts: 2000, orders: 10, trades: 5, books: 2,
                }),
            }));
        });
        expect(captured.stats).not.toBeNull();
        expect(captured.stats.orders).toBe(10);
    });
});
