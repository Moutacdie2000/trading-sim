import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createInterface } from 'node:readline';
import { EventEmitter } from 'node:events';

import { isEngineEvent, type EngineEvent } from './types.js';

export interface EngineProcessOptions {
  bin: string;
  args?: readonly string[];
  spawnFn?: SpawnFn;
  setTimeoutFn?: SetTimeoutFn;
  clearTimeoutFn?: ClearTimeoutFn;
  nowFn?: () => number;
}

export type SpawnFn = (
  bin: string,
  args: readonly string[],
) => ChildProcessWithoutNullStreams;

export type SetTimeoutFn = (cb: () => void, ms: number) => ReturnType<typeof setTimeout>;
export type ClearTimeoutFn = (handle: ReturnType<typeof setTimeout>) => void;

export const BACKOFF_STEPS_MS = [1_000, 2_000, 4_000, 8_000, 16_000, 30_000] as const;
export const STABLE_UPTIME_MS = 60_000;
export const RESTART_WINDOW_MS = 60_000;
export const MAX_RESTARTS_IN_WINDOW = 5;

/* eslint-disable @typescript-eslint/no-unsafe-declaration-merging */
export declare interface EngineProcess {
  on(event: 'event', listener: (e: EngineEvent) => void): this;
  on(event: 'exit', listener: (code: number | null) => void): this;
  on(event: 'error', listener: (err: Error) => void): this;
  on(event: 'restart', listener: (attempt: number, delayMs: number) => void): this;
  on(event: 'giveup', listener: (reason: string) => void): this;
}

export class EngineProcess extends EventEmitter {
  private child?: ChildProcessWithoutNullStreams;
  private stopping = false;
  private restartTimer?: ReturnType<typeof setTimeout>;
  private restartAttempt = 0;
  private startedAt = 0;
  private readonly recentRestarts: number[] = [];
  private restartCount = 0;

  private readonly spawnFn: SpawnFn;
  private readonly setTimeoutFn: SetTimeoutFn;
  private readonly clearTimeoutFn: ClearTimeoutFn;
  private readonly nowFn: () => number;

  constructor(private readonly opts: EngineProcessOptions) {
    super();
    this.spawnFn = opts.spawnFn ?? ((bin, args) =>
      spawn(bin, [...args], { stdio: 'pipe' }) as ChildProcessWithoutNullStreams);
    this.setTimeoutFn = opts.setTimeoutFn ?? ((cb, ms) => setTimeout(cb, ms));
    this.clearTimeoutFn = opts.clearTimeoutFn ?? ((h) => clearTimeout(h));
    this.nowFn = opts.nowFn ?? (() => Date.now());
  }

  get restarts(): number {
    return this.restartCount;
  }

  get isRunning(): boolean {
    return this.child !== undefined;
  }

  start(): void {
    if (this.child || this.stopping) return;
    this.spawnChild();
  }

  stop(): void {
    this.stopping = true;
    if (this.restartTimer) {
      this.clearTimeoutFn(this.restartTimer);
      this.restartTimer = undefined;
    }
    if (this.child) this.child.kill('SIGTERM');
  }

  private spawnChild(): void {
    const child = this.spawnFn(this.opts.bin, this.opts.args ?? []);
    this.child = child;
    this.startedAt = this.nowFn();

    const lines = createInterface({ input: child.stdout });
    lines.on('line', (line) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      try {
        const parsed: unknown = JSON.parse(trimmed);
        if (isEngineEvent(parsed)) this.emit('event', parsed);
      } catch {
        // ignore malformed lines (e.g. partial flushes during shutdown)
      }
    });

    child.stderr.on('data', (chunk: Buffer) => {
      process.stderr.write(`[engine] ${chunk.toString()}`);
    });

    child.on('error', (err) => this.emit('error', err));
    child.on('exit', (code) => {
      this.child = undefined;
      this.emit('exit', code);
      this.scheduleRestartIfNeeded();
    });
  }

  private scheduleRestartIfNeeded(): void {
    if (this.stopping) return;

    const now = this.nowFn();
    const uptimeMs = now - this.startedAt;
    if (uptimeMs >= STABLE_UPTIME_MS) {
      this.restartAttempt = 0;
      this.recentRestarts.length = 0;
    }

    while (this.recentRestarts.length > 0 &&
           now - this.recentRestarts[0]! > RESTART_WINDOW_MS) {
      this.recentRestarts.shift();
    }
    this.recentRestarts.push(now);

    if (this.recentRestarts.length > MAX_RESTARTS_IN_WINDOW) {
      const msg = `engine restarted ${this.recentRestarts.length} times within ${RESTART_WINDOW_MS}ms; giving up`;
      this.emit('giveup', msg);
      this.emit('error', new Error(msg));
      return;
    }

    const delay = BACKOFF_STEPS_MS[Math.min(this.restartAttempt, BACKOFF_STEPS_MS.length - 1)]!;
    this.restartAttempt += 1;
    this.restartCount += 1;
    this.emit('restart', this.restartAttempt, delay);

    this.restartTimer = this.setTimeoutFn(() => {
      this.restartTimer = undefined;
      if (this.stopping) return;
      this.spawnChild();
    }, delay);
  }
}
