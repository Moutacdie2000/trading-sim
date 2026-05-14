import Fastify from 'fastify';
import { WebSocketServer, type WebSocket } from 'ws';

import { EngineProcess } from './engine_process.js';
import { Hub } from './hub.js';
import { Metrics } from './metrics.js';
import { formatCommand } from './types.js';

const ENGINE_BIN          = process.env.ENGINE_BIN ?? '../engine/build/apps/sim_runner';
const PORT                = Number(process.env.PORT ?? 8080);
const STALE_FEED_MS       = 10_000;
const SHUTDOWN_TIMEOUT_MS = 5_000;

async function main(): Promise<void> {
  const app = Fastify({ logger: true });

  const engine  = new EngineProcess({ bin: ENGINE_BIN });
  const hub     = new Hub<WebSocket>();
  const metrics = new Metrics();

  let lastEventAt: number | null = null;

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

  // Bind ws.Server to Fastify's underlying http.Server. noServer + manual
  // upgrade keeps Fastify in charge of HTTP routing while ws owns /feed.
  const wss = new WebSocketServer({ noServer: true });

  wss.on('connection', (ws) => {
    hub.addClient(ws);
    metrics.setClients(hub.count());
    app.log.info({ clients: hub.count() }, 'client connected');

    ws.on('message', (raw) => {
      let parsed: unknown;
      try { parsed = JSON.parse(raw.toString()); }
      catch { return; }
      const line = formatCommand(parsed);
      if (line === null) {
        app.log.warn({ payload: raw.toString().slice(0, 200) }, 'rejected command');
        return;
      }
      if (!engine.write(line)) {
        app.log.warn({ line }, 'engine not running, command dropped');
      }
    });

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
  engine.on('exit',    (code)        => app.log.warn ({ code },          'engine exited'));
  engine.on('error',   (err)         => app.log.error({ err },           'engine error'));
  engine.on('restart', (attempt, ms) => {
    metrics.incEngineRestart();
    app.log.warn({ attempt, ms }, 'engine restart scheduled');
  });
  engine.on('giveup',  (reason)      => app.log.fatal({ reason },        'engine giving up'));

  engine.start();

  await app.listen({ port: PORT, host: '0.0.0.0' });

  app.server.on('upgrade', (req, socket, head) => {
    if (req.url !== '/feed') {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req);
    });
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
    app.close().then(() => {
      clearTimeout(fallback);
      process.exit(0);
    });
  };
  process.on('SIGINT',  shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
