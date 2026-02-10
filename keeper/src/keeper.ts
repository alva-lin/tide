import { execute } from "./execute.js";
import { buildSettleAndAdvance } from "./transactions/index.js";
import { getUpcomingRoundInfo } from "./market.js";
import { catchUpMarket } from "./catchUp.js";
import { MARKETS, PYTH_FEED_IDS } from "./config.js";

interface MarketConfig {
  marketId: string;
  feedId: string;
}

const POLL_INTERVAL_MS = 5_000;

const markets: MarketConfig[] = [
  { marketId: MARKETS.SUI_1M, feedId: PYTH_FEED_IDS.SUI_USD },
];

async function trySettle(mc: MarketConfig): Promise<void> {
  // First: catch up if behind
  const catchUpResult = await catchUpMarket(mc.marketId, mc.feedId);
  if (catchUpResult.settledRounds > 0 || catchUpResult.didReset) return;

  // Normal path: check if upcoming round is due
  const info = await getUpcomingRoundInfo(mc.marketId);
  if (!info) return;

  const now = Date.now();
  if (now < info.startTimeMs) {
    const diff = ((info.startTimeMs - now) / 1000).toFixed(1);
    console.log(
      `[keeper] market=${mc.marketId.slice(0, 10)}... round=${info.upcomingRound} starts in ${diff}s`,
    );
    return;
  }

  console.log(
    `[keeper] settling market=${mc.marketId.slice(0, 10)}... round=${info.upcomingRound}`,
  );

  try {
    const tx = await buildSettleAndAdvance(mc.marketId, mc.feedId);
    await execute(tx);
    console.log(`[keeper] settled round ${info.upcomingRound} successfully`);
  } catch (err) {
    console.error(`[keeper] settle failed:`, err instanceof Error ? err.message : err);
  }
}

async function loop() {
  console.log(`[keeper] started — polling every ${POLL_INTERVAL_MS / 1000}s for ${markets.length} market(s)`);

  const tick = async () => {
    for (const mc of markets) {
      await trySettle(mc);
    }
  };

  await tick();
  setInterval(tick, POLL_INTERVAL_MS);
}

loop().catch((err) => {
  console.error("[keeper] fatal:", err);
  process.exit(1);
});
