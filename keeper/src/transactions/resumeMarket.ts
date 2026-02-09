import { Transaction } from "@mysten/sui/transactions";
import { PACKAGE_ID, ADMIN_CAP_ID, CLOCK_ID } from "../config.js";

/**
 * Build a `resume_market` transaction (admin only).
 * Creates a new UPCOMING round starting at `newStartTimeMs`.
 */
export function buildResumeMarket(
  marketId: string,
  newStartTimeMs: number,
): Transaction {
  const tx = new Transaction();

  tx.moveCall({
    target: `${PACKAGE_ID}::market::resume_market`,
    arguments: [
      tx.object(ADMIN_CAP_ID),
      tx.object(marketId),
      tx.pure.u64(newStartTimeMs),
      tx.object(CLOCK_ID),
    ],
  });

  return tx;
}
