import { Transaction } from "@mysten/sui/transactions";
import { PACKAGE_ID, ADMIN_CAP_ID } from "../config.js";

/**
 * Build a `pause_market` transaction (admin only).
 * Cancels any LIVE and UPCOMING rounds.
 */
export function buildPauseMarket(marketId: string): Transaction {
  const tx = new Transaction();

  tx.moveCall({
    target: `${PACKAGE_ID}::market::pause_market`,
    arguments: [tx.object(ADMIN_CAP_ID), tx.object(marketId)],
  });

  return tx;
}
