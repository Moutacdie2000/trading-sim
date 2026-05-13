import { createServer } from 'node:http';

import Fastify from 'fastify';
import { WebSocketServer, type WebSocket } from 'ws';

import { EngineProcess } from './engine_process.js';
import { Hub } from './hub.js';
import { Metrics } from './metrics.js';

const ENGINE_BIN     = process.env.ENGINE_BIN ?? '../engine/build/apps/sim_runner';
const PORT           = Number(process.env.PORT ?? 8080);
const STALE_FEED_MS  = 10_000;
const SHUTDOWN_TIMEOUT_MS = 5_000;

async function main(): Promise<void> {
  const app    = Fastify({ logger: true });
  const server = createServer(app as never);
  const wss    = new WebSocketServer({ server, path: '/feed' });

  const engine  = new EngineProcess({ bin: ENGINE_BIN });
  const hub     = new Hub<WebSocket>();
  const metrics = new Metrics();

  let lastEventAt: number | null = null;

  wss.on('connection', (ws) => {
    hub.addClient(ws);
    metrics.setClients(hub.count());
    app.log.info({ clients: hub.count() }, 'client connected');
    ws.on('close', () => {
      hub.removeClient(ws);
      metrics.setClients(hub.count());
      app.log.info({ clients: hub.count() }, 'client disconnected');
    });
  });

  engine.on('event', (event) => {
    lastEventAt = Date.now();
    metrics.incEvent(event.type);
    hub.broadcast(JSON.stringify(event));
  });

  engine.on('exit',    (code)         => app.log.warn({ code }, 'engine exited'));
  engine.on('error',   (err)          => app.log.error({ err }, 'engine error'));
  engine.on('restart', (attempt, ms)  => {
    metrics.incEngineRestart();
    app.log.warn({ attempt, ms }, 'engine restart scheduled');
  });
  engine.on('giveup',  (reason)       => app.log.fatal({ reason }, 'engine giving up'));

  app.get('/healthz', async (_req, reply) => {
    const engineAlive = engine.isRunning;
    const ageMs       = lastEventAt === null ? Infinity : Date.now() - lastEventAt;
    const feedFresh   = ageMs <= STALE_FEED_MS;
    if (engineAlive && feedFresh) {
      return { ok: true };
    }
    return reply.code(503).send({
      ok: false,
      engineAlive,
      feedFresh,
      lastEventAgeMs: lastEventAt === null ? null : ageMs,
    });
  });

  app.get('/metrics', async (_req, reply) => {
    reply.header('content-type', 'text/plain; version=0.0.4; charset=utf-8');
    return metrics.render();
  });

  engine.start();

  await app.ready();
  server.listen(PORT, () => {
    app.log.info(`gateway listening on http://localhost:${PORT}`);
  });

  let shuttingDown = false;
  const shutdown = (): void => {
    if (shuttingDown) return;
    shuttingDown = true;
    app.log.info('shutting down');

    const fallback = setTimeout(() => {
      app.log.warn('shutdown timeout, forcing exit');
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);
    fallback.unref();

    for (const ws of hub.snapshot()) {
      try { ws.close(1001, 'gateway shutting down'); } catch { /* ignore */ }
    }
    engine.stop();
    server.close(() => {
      clearTimeout(fallback);
      process.exit(0);
    });
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
