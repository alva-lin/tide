import { Transaction } from "@mysten/sui/transactions";
import { PACKAGE_ID, REGISTRY_ID, CLOCK_ID } from "../config.js";
import { addPriceUpdates } from "../pyth.js";
import { getUpcomingRoundInfo } from "../market.js";

/**
 * Build a `settle_and_advance` transaction.
 *
 * 1. Reads the market on-chain to find upcoming round's start_time
 * 2. Fetches the Pyth price at that anchor timestamp from Hermes
 * 3. Composes updatePriceFeeds + settle_and_advance into a single PTB
 *
 * @param marketId  shared Market object ID
 * @param feedId    Pyth price feed ID (hex with 0x)
 */
export async function buildSettleAndAdvance(
  marketId: string,
  feedId: string,
): Promise<Transaction> {
  // Read on-chain state to get the anchor time
  const info = await getUpcomingRoundInfo(marketId);
  if (!info) {
    throw new Error("Market has no upcoming round (paused or not created?)");
  }

  // Convert ms → seconds for Hermes API
  const anchorTimeSec = Math.floor(info.startTimeMs / 1000);

  const tx = new Transaction();

  // Fetch price at the anchor timestamp and add updatePriceFeeds to PTB
  const priceInfoObjectIds = await addPriceUpdates(tx, [feedId], anchorTimeSec);
  const priceInfoObjectId = priceInfoObjectIds[0];
  if (!priceInfoObjectId) throw new Error("Failed to get PriceInfoObject ID");

  tx.moveCall({
    target: `${PACKAGE_ID}::market::settle_and_advance`,
    arguments: [
      tx.object(REGISTRY_ID),
      tx.object(marketId),
      tx.object(priceInfoObjectId),
      tx.object(CLOCK_ID),
    ],
  });

  return tx;
}
