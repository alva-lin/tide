import { execute } from "./execute.js";
import { getUpcomingRoundInfo, getMarketState } from "./market.js";
import { buildSettleAndAdvance } from "./transactions/index.js";
import { buildPauseMarket } from "./transactions/pauseMarket.js";
import { buildResumeMarket } from "./transactions/resumeMarket.js";

const MAX_STALE_ROUNDS = 5;

export interface CatchUpResult {
  settledRounds: number;
  didReset: boolean;
}

/**
 * Settle all stale rounds for a market until caught up.
 *
 * - If behind <= MAX_STALE_ROUNDS, rapidly settle one by one.
 * - If behind > MAX_STALE_ROUNDS, pause + resume to skip dead rounds.
 *
 * @returns number of rounds settled and whether a reset was performed.
 */
export async function catchUpMarket(
  marketId: string,
  feedId: string,
): Promise<CatchUpResult> {
  const result: CatchUpResult = { settledRounds: 0, didReset: false };

  // Check how far behind we are
  const state = await getMarketState(marketId);
  if (!state || state.status !== 0) return result;

  const info = await getUpcomingRoundInfo(marketId);
  if (!info) return result;

  const now = Date.now();
  if (now < info.startTimeMs) return result; // not behind

  const staleMs = now - info.startTimeMs;
  const staleRounds = Math.floor(staleMs / state.intervalMs);

  if (staleRounds > MAX_STALE_ROUNDS) {
    // Too far behind — pause and resume with fresh start time
    console.log(
      `[catch-up] ${staleRounds} rounds behind (>${MAX_STALE_ROUNDS}), resetting market...`,
    );

    try {
      await execute(buildPauseMarket(marketId));
      const newStartTimeMs = alignToNextInterval(Date.now(), state.intervalMs);
      await execute(buildResumeMarket(marketId, newStartTimeMs));
      console.log(
        `[catch-up] market reset. new start_time=${new Date(newStartTimeMs).toLocaleTimeString()}`,
      );
      result.didReset = true;
    } catch (err) {
      console.error("[catch-up] reset failed:", err instanceof Error ? err.message : err);
    }
    return result;
  }

  // Behind by a manageable amount — settle rapidly
  if (staleRounds > 0) {
    console.log(`[catch-up] ~${staleRounds} round(s) behind, catching up...`);
  }

  while (true) {
    const roundInfo = await getUpcomingRoundInfo(marketId);
    if (!roundInfo) break;

    if (Date.now() < roundInfo.startTimeMs) break; // caught up

    try {
      const tx = await buildSettleAndAdvance(marketId, feedId);
      await execute(tx);
      result.settledRounds++;
      console.log(`[catch-up] settled round ${roundInfo.upcomingRound}`);
    } catch (err) {
      console.error(
        "[catch-up] settle failed:",
        err instanceof Error ? err.message : err,
      );
      break;
    }
  }

  if (result.settledRounds > 0) {
    console.log(`[catch-up] done, settled ${result.settledRounds} round(s)`);
  }

  return result;
}

/**
 * Align a timestamp to the next "round" boundary, then add one extra interval.
 *
 * For intervalMs=60000 (1min) at 19:37:23 → ceil to 19:38:00 → +1min → 19:39:00
 * For intervalMs=300000 (5min) at 19:37:23 → ceil to 19:40:00 → +5min → 19:45:00
 */
function alignToNextInterval(nowMs: number, intervalMs: number): number {
  const nextBoundary = Math.ceil(nowMs / intervalMs) * intervalMs;
  return nextBoundary + intervalMs;
}
