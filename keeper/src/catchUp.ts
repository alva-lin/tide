import { execute } from "./execute.js";
import { getMarketSnapshot, getRegistryConfig, type UpcomingRoundInfo } from "./market.js";
import { buildSettleAndAdvance } from "./transactions/index.js";
import { buildPauseMarket } from "./transactions/pauseMarket.js";
import { buildResumeMarket } from "./transactions/resumeMarket.js";
import { REGISTRY_ID } from "./config.js";

// Retry on transient failure (base delay, actual = base * 2^attempt)
const RETRY_DELAY_MS = 1_000;
const MAX_RETRIES = 3;

export interface CatchUpResult {
  settledRounds: number;
  didReset: boolean;
  failCount: number;
  retryCount: number;
  lastError: string | null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Ensure a market is up-to-date before normal settlement.
 *
 * Logic:
 *   1. If upcoming round's start_time + tolerance < now, the round is un-settleable
 *      (Pyth price outside valid window) → pause + resume to reset.
 *   2. If upcoming round's start_time <= now <= start_time + tolerance, the round
 *      is still settleable → settle it (with exponential backoff retry), then loop
 *      in case multiple rounds are due.
 *   3. If now < start_time, nothing to do.
 */
export async function catchUpMarket(
  marketId: string,
  feedId: string,
): Promise<CatchUpResult> {
  const result: CatchUpResult = {
    settledRounds: 0,
    didReset: false,
    failCount: 0,
    retryCount: 0,
    lastError: null,
  };

  // Single RPC for market object + 1 for dynamic field; config is cached after first call.
  const [snapshot, config] = await Promise.all([
    getMarketSnapshot(marketId),
    getRegistryConfig(REGISTRY_ID),
  ]);

  if (!snapshot) return result;
  const { state } = snapshot;

  // If market is paused (e.g. previous resume failed), try to resume
  if (state.status !== 0) {
    console.log(`[catch-up] market is paused (status=${state.status}), attempting resume...`);
    try {
      const newStartTimeMs = alignToNextInterval(Date.now(), state.intervalMs);
      await execute(buildResumeMarket(marketId, newStartTimeMs));
      console.log(`[catch-up] market resumed, next round at ${new Date(newStartTimeMs).toLocaleTimeString()}`);
      result.didReset = true;
    } catch (err) {
      result.failCount++;
      result.lastError = err instanceof Error ? err.message : String(err);
      console.error("[catch-up] resume failed:", result.lastError);
    }
    return result;
  }

  if (!config) {
    console.error("[catch-up] failed to read registry config");
    return result;
  }

  let info: UpcomingRoundInfo | null = snapshot.upcomingRound;
  if (!info) return result;

  const now = Date.now();
  if (now < info.startTimeMs) return result; // not due yet

  const deadline = info.startTimeMs + config.priceToleranceMs;

  if (now > deadline) {
    const staleMs = now - info.startTimeMs;
    console.log(
      `[catch-up] round ${info.upcomingRound} expired ${(staleMs / 1000).toFixed(1)}s ago (tolerance=${config.priceToleranceMs}ms), resetting market...`,
    );

    try {
      await execute(buildPauseMarket(marketId));
      const newStartTimeMs = alignToNextInterval(Date.now(), state.intervalMs);
      await execute(buildResumeMarket(marketId, newStartTimeMs));
      console.log(
        `[catch-up] market reset. next round at ${new Date(newStartTimeMs).toLocaleTimeString()}`,
      );
      result.didReset = true;
    } catch (err) {
      result.failCount++;
      result.lastError = err instanceof Error ? err.message : String(err);
      console.error("[catch-up] reset failed:", result.lastError);
    }
    return result;
  }

  // Within tolerance — settle this round, then check again
  // (multiple rounds may have become due while we were processing)
  let lastSettledRound: number | null = null;
  while (true) {
    // First iteration reuses the snapshot; subsequent iterations re-fetch.
    if (!info) {
      const snap = await getMarketSnapshot(marketId);
      if (!snap?.upcomingRound) break;
      info = snap.upcomingRound;

      // Stale-read guard: if the fullnode hasn't indexed our last settle yet,
      // upcoming_round will still point to the round we just settled.
      if (lastSettledRound !== null && info.upcomingRound <= lastSettledRound) {
        console.log(`[catch-up] stale read (upcoming still ${info.upcomingRound}), exiting loop`);
        break;
      }
    }

    const t = Date.now();
    if (t < info.startTimeMs) break; // caught up

    if (t > info.startTimeMs + config.priceToleranceMs) {
      console.log(`[catch-up] round ${info.upcomingRound} crossed tolerance during catch-up, resetting...`);
      try {
        await execute(buildPauseMarket(marketId));
        const newStartTimeMs = alignToNextInterval(Date.now(), state.intervalMs);
        await execute(buildResumeMarket(marketId, newStartTimeMs));
        result.didReset = true;
      } catch (err) {
        result.failCount++;
        result.lastError = err instanceof Error ? err.message : String(err);
        console.error("[catch-up] reset failed:", result.lastError);
      }
      break;
    }

    // Settle with exponential backoff retry
    const anchorTimeSec = Math.floor(info.startTimeMs / 1000);
    let settled = false;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const tx = await buildSettleAndAdvance(marketId, feedId, anchorTimeSec);
        await execute(tx);
        result.settledRounds++;
        lastSettledRound = info.upcomingRound;
        console.log(`[catch-up] settled round ${info.upcomingRound}`);
        settled = true;
        break;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (attempt < MAX_RETRIES) {
          result.retryCount++;
          const delay = RETRY_DELAY_MS * Math.pow(2, attempt);
          console.warn(
            `[catch-up] round ${info.upcomingRound} attempt ${attempt + 1} failed: ${msg}, retrying in ${delay}ms...`,
          );
          await sleep(delay);
        } else {
          result.failCount++;
          result.lastError = msg;
          console.error(`[catch-up] round ${info.upcomingRound} settle failed: ${msg}`);
        }
      }
    }
    if (!settled) break;

    // Next iteration needs fresh data from chain
    info = null;
  }

  if (result.settledRounds > 0) {
    console.log(`[catch-up] done, settled ${result.settledRounds} round(s)`);
  }

  return result;
}

/**
 * Align a timestamp to the next interval boundary + one extra interval.
 */
function alignToNextInterval(nowMs: number, intervalMs: number): number {
  // Contract requires: start_time >= clock.timestamp_ms() + interval_ms
  // When nowMs lands exactly on an interval boundary, the result would be
  // nowMs + intervalMs — but the on-chain clock advances by a few seconds
  // between Date.now() and transaction confirmation, causing EStartTimeTooEarly.
  // Adding a buffer before ceiling avoids this edge case.
  const bufferMs = 5_000;
  const nextBoundary = Math.ceil((nowMs + bufferMs) / intervalMs) * intervalMs;
  return nextBoundary + intervalMs;
}
