import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

export interface MetricsSource {
  name: string;
  settling: boolean;
  hasTimer: boolean;
  metrics: {
    settleCount: number;
    failCount: number;
    retryCount: number;
    lastSettleTime: number | null;
    lastError: string | null;
  };
}

interface HealthResponse {
  status: "ok" | "degraded";
  uptime: number;
  markets: number;
}

interface MetricsResponse {
  uptime: number;
  markets: Record<
    string,
    {
      settling: boolean;
      scheduled: boolean;
      settleCount: number;
      failCount: number;
      retryCount: number;
      lastSettleTime: string | null;
      lastError: string | null;
    }
  >;
}

/**
 * Start a lightweight HTTP server for health checks and metrics.
 *
 * GET /health  → 200 { status, uptime, markets }
 * GET /metrics → 200 { uptime, markets: { ... } }
 * Everything else → 404
 */
export function startMetricsServer(
  getSources: () => MetricsSource[],
  port: number,
): void {
  const startTime = Date.now();

  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    if (req.method !== "GET") {
      res.writeHead(405).end();
      return;
    }

    const url = req.url ?? "/";

    if (url === "/health") {
      const sources = getSources();
      const body: HealthResponse = {
        status: sources.some((s) => s.metrics.failCount > s.metrics.settleCount) ? "degraded" : "ok",
        uptime: Math.floor((Date.now() - startTime) / 1000),
        markets: sources.length,
      };
      res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify(body));
      return;
    }

    if (url === "/metrics") {
      const sources = getSources();
      const markets: MetricsResponse["markets"] = {};
      for (const s of sources) {
        markets[s.name] = {
          settling: s.settling,
          scheduled: s.hasTimer,
          settleCount: s.metrics.settleCount,
          failCount: s.metrics.failCount,
          retryCount: s.metrics.retryCount,
          lastSettleTime: s.metrics.lastSettleTime
            ? new Date(s.metrics.lastSettleTime).toISOString()
            : null,
          lastError: s.metrics.lastError,
        };
      }
      const body: MetricsResponse = {
        uptime: Math.floor((Date.now() - startTime) / 1000),
        markets,
      };
      res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify(body));
      return;
    }

    res.writeHead(404).end();
  });

  server.listen(port, () => {
    console.log(`[metrics] http://0.0.0.0:${port}/health | /metrics`);
  });
}
