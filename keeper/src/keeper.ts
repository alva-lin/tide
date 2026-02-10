import { getMarketSnapshot } from "./market.js";
import { catchUpMarket } from "./catchUp.js";
import { MARKET_REGISTRY } from "./config.js";

interface MarketConfig {
  name: string;
  marketId: string;
  feedId: string;
}

// Delay after start_time to ensure Hermes has the price available
const SETTLE_BUFFER_MS = 500;
// Safety-net heartbeat: re-schedule any runner that lost its timer
const HEARTBEAT_MS = 10_000;
// Fallback delay when scheduleNext itself fails
const SCHEDULE_RETRY_MS = 5_000;
// Graceful shutdown timeout
const SHUTDOWN_TIMEOUT_MS = 10_000;
// Print metrics summary every N heartbeats
const METRICS_INTERVAL = 5;

interface Metrics {
  settleCount: number;
  failCount: number;
  retryCount: number;
  lastSettleTime: number | null;
  lastError: string | null;
}

interface MarketRunner {
  config: MarketConfig;
  timer: ReturnType<typeof setTimeout> | null;
  settling: boolean;
  metrics: Metrics;
}

// ---------------------------------------------------------------------------
// Market list
// ---------------------------------------------------------------------------

function loadMarkets(): MarketConfig[] {
  const filter = process.env.KEEPER_MARKETS;
  const names = filter
    ? filter.split(",").map((s) => s.trim().toUpperCase())
    : Object.keys(MARKET_REGISTRY);

  const markets: MarketConfig[] = [];
  for (const name of names) {
    const entry = MARKET_REGISTRY[name];
    if (!entry) {
      console.warn(`[keeper] unknown market "${name}", skipping`);
      continue;
    }
    markets.push({ name, marketId: entry.marketId, feedId: entry.feedId });
  }
  return markets;
}

// ---------------------------------------------------------------------------
// Per-market settle logic
// ---------------------------------------------------------------------------

async function settleMarket(runner: MarketRunner): Promise<void> {
  runner.settling = true;

  try {
    const { config } = runner;
    const result = await catchUpMarket(config.marketId, config.feedId);

    // Merge catchUp metrics into runner
    runner.metrics.settleCount += result.settledRounds;
    runner.metrics.failCount += result.failCount;
    runner.metrics.retryCount += result.retryCount;
    if (result.settledRounds > 0) {
      runner.metrics.lastSettleTime = Date.now();
    }
    if (result.lastError) {
      runner.metrics.lastError = result.lastError;
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    runner.metrics.failCount++;
    runner.metrics.lastError = msg;
    console.error(`[keeper] ${runner.config.name} unexpected error:`, msg);
  } finally {
    runner.settling = false;
  }
}

// ---------------------------------------------------------------------------
// Settle queue — serialises all on-chain transactions to avoid gas-coin
// contention when multiple markets are due at the same moment.
// ---------------------------------------------------------------------------

const settleQueue: MarketRunner[] = [];
let queueProcessing = false;

function enqueueSettle(runner: MarketRunner): void {
  if (runner.settling || settleQueue.includes(runner)) return;
  settleQueue.push(runner);
  if (!queueProcessing) processQueue();
}

async function processQueue(): Promise<void> {
  if (queueProcessing) return;
  queueProcessing = true;

  while (settleQueue.length > 0) {
    const runner = settleQueue.shift()!;
    await settleMarket(runner);
    scheduleNext(runner).catch((err) => {
      console.error(
        `[keeper] ${runner.config.name} scheduleNext failed after settle:`,
        err instanceof Error ? err.message : err,
      );
    });
  }

  queueProcessing = false;
}

// ---------------------------------------------------------------------------
// Scheduling
// ---------------------------------------------------------------------------

async function scheduleNext(runner: MarketRunner): Promise<void> {
  if (runner.timer) {
    clearTimeout(runner.timer);
    runner.timer = null;
  }

  try {
    const snapshot = await getMarketSnapshot(runner.config.marketId);
    if (!snapshot) {
      console.log(`[keeper] ${runner.config.name} failed to read market, waiting for heartbeat`);
      return;
    }

    if (snapshot.state.status !== 0) {
      console.log(`[keeper] ${runner.config.name} market is paused, enqueuing for recovery`);
      enqueueSettle(runner);
      return;
    }

    if (!snapshot.upcomingRound) {
      console.log(`[keeper] ${runner.config.name} no upcoming round, waiting for heartbeat`);
      return;
    }

    const delay = Math.max(0, snapshot.upcomingRound.startTimeMs + SETTLE_BUFFER_MS - Date.now());

    runner.timer = setTimeout(() => {
      runner.timer = null;
      enqueueSettle(runner);
    }, delay);

    if (delay > 0) {
      console.log(
        `[keeper] ${runner.config.name} round=${snapshot.upcomingRound.upcomingRound} in ${(delay / 1000).toFixed(1)}s`,
      );
    }
  } catch (err) {
    console.error(
      `[keeper] ${runner.config.name} schedule error:`,
      err instanceof Error ? err.message : err,
    );
    runner.timer = setTimeout(() => scheduleNext(runner).catch(() => {}), SCHEDULE_RETRY_MS);
    console.log(`[keeper] ${runner.config.name} will retry scheduling in ${SCHEDULE_RETRY_MS / 1000}s`);
  }
}

// ---------------------------------------------------------------------------
// Entry
// ---------------------------------------------------------------------------

function formatMetrics(runner: MarketRunner): string {
  const m = runner.metrics;
  const lastSettle = m.lastSettleTime ? new Date(m.lastSettleTime).toISOString() : "never";
  return `${runner.config.name}: settled=${m.settleCount} failed=${m.failCount} retries=${m.retryCount} last=${lastSettle}${m.lastError ? ` err="${m.lastError}"` : ""}`;
}

function startKeeper() {
  const markets = loadMarkets();
  if (markets.length === 0) {
    console.error("[keeper] no markets configured");
    process.exit(1);
  }

  const runners: MarketRunner[] = markets.map((config) => ({
    config,
    timer: null,
    settling: false,
    metrics: {
      settleCount: 0,
      failCount: 0,
      retryCount: 0,
      lastSettleTime: null,
      lastError: null,
    },
  }));

  console.log(
    `[keeper] started — ${runners.length} market(s): ${markets.map((m) => m.name).join(", ")}`,
  );

  for (const runner of runners) {
    scheduleNext(runner);
  }

  let heartbeatTick = 0;
  const heartbeat = setInterval(() => {
    heartbeatTick++;
    for (const runner of runners) {
      if (!runner.timer && !runner.settling && !settleQueue.includes(runner)) {
        scheduleNext(runner);
      }
    }
    if (heartbeatTick % METRICS_INTERVAL === 0) {
      console.log(`[keeper] metrics: ${runners.map(formatMetrics).join(" | ")}`);
    }
  }, HEARTBEAT_MS);

  // Graceful shutdown
  let stopping = false;
  const shutdown = () => {
    if (stopping) return;
    stopping = true;
    console.log("\n[keeper] shutting down...");
    clearInterval(heartbeat);
    settleQueue.length = 0;
    for (const runner of runners) {
      if (runner.timer) {
        clearTimeout(runner.timer);
        runner.timer = null;
      }
    }
    const shutdownStart = Date.now();
    const waitForSettle = () => {
      if (runners.every((r) => !r.settling)) process.exit(0);
      if (Date.now() - shutdownStart > SHUTDOWN_TIMEOUT_MS) {
        console.warn(`[keeper] shutdown timeout (${SHUTDOWN_TIMEOUT_MS / 1000}s), forcing exit`);
        process.exit(1);
      }
      setTimeout(waitForSettle, 200);
    };
    waitForSettle();
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

startKeeper();
