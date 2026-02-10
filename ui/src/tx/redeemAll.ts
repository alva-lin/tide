import { Transaction } from "@mysten/sui/transactions";
import { PACKAGE_ID } from "../lib/constants";

export function buildRedeemAll(
  tickets: { marketId: string; objectId: string }[],
): Transaction {
  const tx = new Transaction();
  for (const t of tickets) {
    tx.moveCall({
      target: `${PACKAGE_ID}::bet::redeem`,
      arguments: [tx.object(t.marketId), tx.object(t.objectId)],
    });
  }
  return tx;
}
