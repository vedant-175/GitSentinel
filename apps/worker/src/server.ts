import http from 'http';
import { Redis } from 'ioredis';
import { Queue } from 'bullmq';
import { metrics } from './metrics.js';
import { logger } from './logger.js';

export interface HealthServerOptions {
  port?: number;
  host?: string;
  metricsToken?: string;
  redis: Redis;
  queue?: Queue;
  isShuttingDown: () => boolean;
}

export function isLocalhostAddress(ip?: string): boolean {
  if (!ip) return false;
  return (
    ip === '127.0.0.1' ||
    ip === '::1' ||
    ip === '::ffff:127.0.0.1' ||
    ip === 'localhost'
  );
}

export function isMetricsAuthorized(
  req: http.IncomingMessage,
  expectedToken?: string
): boolean {
  const remoteIp = req.socket.remoteAddress;

  // If a metrics token is configured, enforce it regardless of caller
  if (expectedToken) {
    const authHeader = req.headers['authorization'];
    const customHeader = req.headers['x-metrics-token'];
    if (authHeader && authHeader === `Bearer ${expectedToken}`) {
      return true;
    }
    if (customHeader && customHeader === expectedToken) {
      return true;
    }
    return false;
  }

  // If no token is configured, restrict access strictly to localhost or Vercel internal environment
  return isLocalhostAddress(remoteIp) || Boolean(process.env.VERCEL);
}

export function startHealthServer(options: HealthServerOptions): http.Server {
  const isCloudPlatform = Boolean(process.env.RENDER || process.env.PORT || process.env.VERCEL);
  const port = options.port ?? (process.env.PORT ? parseInt(process.env.PORT, 10) : parseInt(process.env.WORKER_HEALTH_PORT || '3001', 10));
  const host = isCloudPlatform
    ? (options.host || process.env.HOST || '0.0.0.0')
    : (options.host || process.env.WORKER_HEALTH_HOST || process.env.HOST || '127.0.0.1');
  const metricsToken = options.metricsToken || process.env.WORKER_METRICS_TOKEN;

  const server = http.createServer(async (req, res) => {
    const rawUrl = req.url || '';
    const pathname = rawUrl.split('?')[0];

    if (
      pathname === '/health' ||
      pathname === '/healthz' ||
      pathname === '/ping' ||
      pathname === '/'
    ) {
      const shuttingDown = options.isShuttingDown();
      const redisStatus = options.redis.status;
      const isRedisHealthy = redisStatus === 'ready' || redisStatus === 'connect';

      if (shuttingDown || !isRedisHealthy) {
        // If UptimeRobot pings / or /ping as a keep-alive probe, return 200 so the container stays awake
        if (pathname === '/' || pathname === '/ping') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              status: shuttingDown ? 'draining' : 'degraded',
              service: 'ai-code-reviewer-worker',
              redis: redisStatus,
              uptime: Math.round(process.uptime()),
            })
          );
          return;
        }

        res.writeHead(503, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            status: shuttingDown ? 'draining' : 'unhealthy',
            service: 'ai-code-reviewer-worker',
            redis: redisStatus,
            uptime: Math.round(process.uptime()),
          })
        );
        return;
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          status: 'healthy',
          service: 'ai-code-reviewer-worker',
          redis: redisStatus,
          uptime: Math.round(process.uptime()),
          timestamp: new Date().toISOString(),
        })
      );
      return;
    }

    if (pathname === '/metrics') {
      if (!isMetricsAuthorized(req, metricsToken)) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            error:
              'Forbidden: /metrics is restricted to localhost or requires valid authorization token (Item 25).',
          })
        );
        return;
      }

      try {
        const snapshot = await metrics.getSnapshot(options.queue);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(snapshot, null, 2));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: (err as Error).message }));
      }
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  });

  server.listen(port, host, () => {
    logger.info({
      port,
      host,
      msg: `Worker health and metrics server listening on ${host}:${port}`,
    });
  });

  server.on('error', (err: any) => {
    if (err.code === 'EADDRINUSE') {
      logger.warn({
        port,
        host,
        msg: `Port ${port} in use on ${host}, falling back to ephemeral port`,
      });
      server.listen(0, host);
    } else {
      logger.error({ err, msg: 'Worker health server error' });
    }
  });

  return server;
}
