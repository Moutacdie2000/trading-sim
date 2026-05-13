import { EventEmitter, Readable } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';

import {
  BACKOFF_STEPS_MS,
  EngineProcess,
  MAX_RESTARTS_IN_WINDOW,
  STABLE_UPTIME_MS,
  type SpawnFn,
} from '../src/engine_process.js';

interface FakeChild extends EventEmitter {
  stdout: Readable;
  stderr: Readable;
  kill: (sig: string) => void;
  exit: (code: number | null) => void;
}

function makeFakeChild(): FakeChild {
  const ee = new EventEmitter() as FakeChild;
  ee.stdout = new Readable({ read() { /* noop */ } });
  ee.stderr = new Readable({ read() { /* noop */ } });
  ee.kill = vi.fn();
  ee.exit = (code: number | null) => ee.emit('exit', code);
  return ee;
}

function makeClock(): {
  setTimeoutFn: (cb: () => void, ms: number) => { id: number };
  clearTimeoutFn: (h: { id: number }) => void;
  nowFn: () => number;
  advance: (ms: number) => void;
} {
  let now = 0;
  let nextId = 1;
  let pending: { at: number; cb: () => void; id: number }[] = [];

  return {
    setTimeoutFn: (cb, ms) => {
      const id = nextId++;
      pending.push({ at: now + ms, cb, id });
      return { id };
    },
    clearTimeoutFn: (h) => {
      pending = pending.filter((p) => p.id !== h.id);
    },
    nowFn: () => now,
    advance: (ms) => {
      const target = now + ms;
      while (true) {
        pending.sort((a, b) => a.at - b.at);
        const next = pending[0];
        if (next === undefined || next.at > target) break;
        pending.shift();
        now = next.at;
        next.cb();
      }
      now = target;
    },
  };
}

function makeHarness(): {
  proc: EngineProcess;
  children: FakeChild[];
  advance: (ms: number) => void;
  restarts: { attempt: number; delay: number }[];
  gaveUp: string[];
  errs: Error[];
  current: () => FakeChild | undefined;
} {
  const children: FakeChild[] = [];
  const spawnFn: SpawnFn = () => {
    const c = makeFakeChild();
    children.push(c);
    return c as unknown as ReturnType<SpawnFn>;
  };
  const { setTimeoutFn, clearTimeoutFn, nowFn, advance } = makeClock();
  const proc = new EngineProcess({
    bin: 'fake',
    spawnFn,
    setTimeoutFn: setTimeoutFn as never,
    clearTimeoutFn: clearTimeoutFn as never,
    nowFn,
  });
  const restarts: { attempt: number; delay: number }[] = [];
  const gaveUp:   string[] = [];
  const errs:     Error[]  = [];
  proc.on('restart', (a, d) => restarts.push({ attempt: a, delay: d }));
  proc.on('giveup',  (r)    => gaveUp.push(r));
  proc.on('error',   (e)    => errs.push(e));
  return {
    proc, children, advance, restarts, gaveUp, errs,
    current: () => children[children.length - 1],
  };
}

describe('EngineProcess', () => {
  it('uses exponential backoff for sequential crashes within the window', () => {
    const h = makeHarness();
    h.proc.start();
    expect(h.children).toHaveLength(1);

    for (let i = 0; i < MAX_RESTARTS_IN_WINDOW; i++) {
      h.current()!.exit(1);
      expect(h.restarts[i]!.delay).toBe(BACKOFF_STEPS_MS[i]);
      h.advance(BACKOFF_STEPS_MS[i]!);
    }
    expect(h.children.length).toBe(MAX_RESTARTS_IN_WINDOW + 1);
    expect(h.gaveUp).toEqual([]);
  });

  it('bails after exceeding MAX_RESTARTS_IN_WINDOW restarts within the window', () => {
    const h = makeHarness();
    h.proc.start();

    for (let i = 0; i < MAX_RESTARTS_IN_WINDOW; i++) {
      h.current()!.exit(1);
      h.advance(100);
    }
    expect(h.gaveUp).toEqual([]);
    h.current()!.exit(1);
    expect(h.gaveUp.length).toBe(1);
    expect(h.errs.length).toBeGreaterThanOrEqual(1);
  });

  it('caps the backoff at 30s when more attempts occur after window clears', () => {
    const h = makeHarness();
    h.proc.start();
    h.current()!.exit(1);
    h.advance(BACKOFF_STEPS_MS[0]!);
    h.current()!.exit(1);
    h.advance(BACKOFF_STEPS_MS[1]!);
    h.advance(STABLE_UPTIME_MS + 1_000);
    h.current()!.exit(1);
    expect(h.restarts.length).toBeGreaterThanOrEqual(3);
    expect(h.restarts[2]!.delay).toBe(BACKOFF_STEPS_MS[0]);
  });

  it('resets backoff after a stable uptime', () => {
    const h = makeHarness();
    h.proc.start();
    h.current()!.exit(1);
    h.advance(BACKOFF_STEPS_MS[0]!);
    h.advance(STABLE_UPTIME_MS + 1_000);
    h.current()!.exit(1);
    expect(h.restarts[1]!.delay).toBe(BACKOFF_STEPS_MS[0]);
  });

  it('does not restart after stop()', () => {
    const h = makeHarness();
    h.proc.start();
    const child = h.current()!;
    h.proc.stop();
    child.exit(0);
    h.advance(60_000);
    expect(h.restarts).toEqual([]);
  });
});
