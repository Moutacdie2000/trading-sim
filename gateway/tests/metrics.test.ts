import { describe, expect, it } from 'vitest';

import { Metrics, formatPrometheus } from '../src/metrics.js';

describe('Metrics', () => {
  it('renders all three families with HELP and TYPE', () => {
    const m = new Metrics();
    m.setClients(3);
    m.incEvent('trade');
    m.incEvent('trade');
    m.incEvent('book');
    m.incEngineRestart();

    const out = m.render();

    expect(out).toContain('# HELP trading_sim_clients');
    expect(out).toContain('# TYPE trading_sim_clients gauge');
    expect(out).toContain('trading_sim_clients 3');

    expect(out).toContain('# TYPE trading_sim_events_total counter');
    expect(out).toMatch(/trading_sim_events_total\{type="trade"\} 2/);
    expect(out).toMatch(/trading_sim_events_total\{type="book"\} 1/);
    expect(out).toMatch(/trading_sim_events_total\{type="stats"\} 0/);

    expect(out).toContain('# TYPE trading_sim_engine_restarts_total counter');
    expect(out).toMatch(/trading_sim_engine_restarts_total 1/);
  });

  it('output is well-formed: ends with newline, no blank lines, each line valid', () => {
    const out = formatPrometheus({
      clients: 0,
      events: { trade: 0, book: 0, stats: 0 },
      engineRestarts: 0,
    });
    expect(out.endsWith('\n')).toBe(true);
    const lines = out.split('\n').slice(0, -1);
    for (const line of lines) {
      expect(line.length).toBeGreaterThan(0);
      expect(line.startsWith('#') || /^[a-z_]+(\{[^}]*\})? [0-9]+$/.test(line)).toBe(true);
    }
  });
});
