import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useRef, useState } from 'react';
function ratesFrom(prev, curr) {
    if (prev === null || curr === null)
        return { ordersPerSec: 0, tradesPerSec: 0 };
    const dt = (curr.ts - prev.ts) / 1000;
    if (dt <= 0)
        return { ordersPerSec: 0, tradesPerSec: 0 };
    return {
        ordersPerSec: Math.max(0, (curr.orders - prev.orders) / dt),
        tradesPerSec: Math.max(0, (curr.trades - prev.trades) / dt),
    };
}
function buildSparkline(history, w, h) {
    if (history.length < 2)
        return '';
    const minP = Math.min(...history.map((p) => p.price));
    const maxP = Math.max(...history.map((p) => p.price));
    const range = Math.max(1e-9, maxP - minP);
    const t0 = history[0].ts;
    const t1 = history[history.length - 1].ts;
    const dt = Math.max(1, t1 - t0);
    return history.map((p, i) => {
        const x = ((p.ts - t0) / dt) * w;
        const y = h - ((p.price - minP) / range) * h;
        return `${i === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`;
    }).join(' ');
}
function formatAge(ms) {
    if (ms < 1000)
        return `${ms}ms ago`;
    if (ms < 60_000)
        return `${Math.floor(ms / 1000)}s ago`;
    return `${Math.floor(ms / 60_000)}m ago`;
}
export function StatsPanel({ stats, priceHistory }) {
    const prevRef = useRef(null);
    const [rates, setRates] = useState({ ordersPerSec: 0, tradesPerSec: 0 });
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
        if (stats === null)
            return;
        setRates(ratesFrom(prevRef.current, stats));
        prevRef.current = stats;
    }, [stats]);
    useEffect(() => {
        const id = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(id);
    }, []);
    const ageMs = stats === null ? null : Math.max(0, now - stats.ts);
    const sparkW = 220;
    const sparkH = 36;
    const sparkD = buildSparkline(priceHistory, sparkW, sparkH);
    return (_jsxs("article", { children: [_jsx("h2", { children: "Throughput" }), _jsxs("div", { className: "stats", children: [_jsxs("div", { className: "stat", children: [_jsx("span", { className: "stat-label", children: "orders/sec" }), _jsx("span", { className: "stat-value", children: rates.ordersPerSec.toFixed(1) })] }), _jsxs("div", { className: "stat", children: [_jsx("span", { className: "stat-label", children: "trades/sec" }), _jsx("span", { className: "stat-value", children: rates.tradesPerSec.toFixed(1) })] }), _jsxs("div", { className: "stat", children: [_jsx("span", { className: "stat-label", children: "books" }), _jsx("span", { className: "stat-value", children: stats?.books ?? 0 })] }), _jsxs("div", { className: "stat", children: [_jsx("span", { className: "stat-label", children: "updated" }), _jsx("span", { className: "stat-value", children: ageMs === null ? '—' : formatAge(ageMs) })] })] }), _jsx("svg", { className: "sparkline", viewBox: `0 0 ${sparkW} ${sparkH}`, preserveAspectRatio: "none", role: "img", "aria-label": "trade price last 60s", children: sparkD === '' ? (_jsx("text", { x: sparkW / 2, y: sparkH / 2, textAnchor: "middle", fontSize: "10", fill: "var(--muted)", children: "no trades yet" })) : (_jsx("path", { d: sparkD, fill: "none", stroke: "#4ade80", strokeWidth: "1.2" })) })] }));
}
export { ratesFrom };
