import { Transaction } from "@mysten/sui/transactions";
import { PACKAGE_ID, REGISTRY_ID, CLOCK_ID } from "../config.js";
import { addPriceUpdates } from "../pyth.js";

/**
 * Build a `settle_and_advance` transaction.
 *
 * @param marketId     shared Market object ID
 * @param feedId       Pyth price feed ID (hex with 0x)
 * @param anchorTimeSec  round start_time in unix seconds (for Hermes price lookup)
 */
export async function buildSettleAndAdvance(
  marketId: string,
  feedId: string,
  anchorTimeSec: number,
): Promise<Transaction> {
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
