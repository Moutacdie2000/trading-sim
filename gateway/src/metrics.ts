import type { EngineEventType } from './types.js';

export interface MetricsSnapshot {
  clients: number;
  events: Record<EngineEventType, number>;
  engineRestarts: number;
}

export class Metrics {
  private clients_ = 0;
  private engineRestarts_ = 0;
  private readonly events_: Record<EngineEventType, number> = {
    trade: 0,
    book: 0,
    stats: 0,
  };

  setClients(n: number): void { this.clients_ = n; }
  incEvent(type: EngineEventType): void { this.events_[type] += 1; }
  incEngineRestart(): void { this.engineRestarts_ += 1; }

  snapshot(): MetricsSnapshot {
    return {
      clients: this.clients_,
      events: { ...this.events_ },
      engineRestarts: this.engineRestarts_,
    };
  }

  render(): string {
    return formatPrometheus(this.snapshot());
  }
}

export function formatPrometheus(snap: MetricsSnapshot): string {
  const lines: string[] = [];

  lines.push('# HELP trading_sim_clients Currently connected WebSocket clients.');
  lines.push('# TYPE trading_sim_clients gauge');
  lines.push(`trading_sim_clients ${snap.clients}`);

  lines.push('# HELP trading_sim_events_total Engine events broadcast, by type.');
  lines.push('# TYPE trading_sim_events_total counter');
  for (const type of Object.keys(snap.events).sort() as EngineEventType[]) {
    lines.push(`trading_sim_events_total{type="${type}"} ${snap.events[type]}`);
  }

  lines.push('# HELP trading_sim_engine_restarts_total Engine process restart count.');
  lines.push('# TYPE trading_sim_engine_restarts_total counter');
  lines.push(`trading_sim_engine_restarts_total ${snap.engineRestarts}`);

  return lines.join('\n') + '\n';
}
