import { Transaction } from "@mysten/sui/transactions";
import { PACKAGE_ID } from "../config.js";

/**
 * Build a `redeem` transaction for a single ticket.
 */
export function buildRedeem(marketId: string, ticketId: string): Transaction {
  const tx = new Transaction();

  tx.moveCall({
    target: `${PACKAGE_ID}::bet::redeem`,
    arguments: [tx.object(marketId), tx.object(ticketId)],
  });

  return tx;
}

/**
 * Build a `redeem` transaction for multiple tickets in a single PTB.
 */
export function buildRedeemAll(marketId: string, ticketIds: string[]): Transaction {
  const tx = new Transaction();

  for (const ticketId of ticketIds) {
    tx.moveCall({
      target: `${PACKAGE_ID}::bet::redeem`,
      arguments: [tx.object(marketId), tx.object(ticketId)],
    });
  }

  return tx;
}
