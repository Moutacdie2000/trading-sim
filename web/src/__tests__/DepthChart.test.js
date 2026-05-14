import { describe, expect, it } from 'vitest';
import { computeDepth } from '../DepthChart.js';
describe('computeDepth', () => {
    it('returns null when either side is empty', () => {
        expect(computeDepth([], [[101, 1]], 400, 240)).toBeNull();
        expect(computeDepth([[100, 1]], [], 400, 240)).toBeNull();
    });
    it('produces deterministic SVG path data for a known input', () => {
        const bids = [[100, 5], [99, 3]];
        const asks = [[101, 4], [102, 2]];
        const computed = computeDepth(bids, asks, 400, 240);
        expect(computed).not.toBeNull();
        expect(computed.midPrice).toBe(100.5);
        expect(computed.minPrice).toBe(99);
        expect(computed.maxPrice).toBe(102);
        expect(computed.maxQty).toBe(8);
        expect(computed.bidPath).toMatchInlineSnapshot(`"M 200.00 222.00 L 200.00 222.00 L 136.00 222.00 L 136.00 88.25 L 8.00 88.25 L 8.00 8.00 L 0.00 8.00 L 0.00 222.00 Z"`);
        expect(computed.askPath).toMatchInlineSnapshot(`"M 200.00 222.00 L 200.00 222.00 L 264.00 222.00 L 264.00 115.00 L 392.00 115.00 L 392.00 61.50 L 392.00 61.50 L 392.00 222.00 Z"`);
    });
    it('cumulates quantities across multiple levels', () => {
        const bids = [[100, 1], [99, 2], [98, 3]];
        const asks = [[101, 1], [102, 2]];
        const computed = computeDepth(bids, asks, 400, 240);
        expect(computed.bidSide.maxQty).toBe(6);
        expect(computed.askSide.maxQty).toBe(3);
        expect(computed.maxQty).toBe(6);
    });
});
