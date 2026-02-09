import { Transaction } from "@mysten/sui/transactions";
import { PACKAGE_ID } from "../config.js";

/**
 * Build a `place_bet` transaction.
 *
 * @param marketId  shared Market object ID
 * @param direction 0 = UP, 1 = DOWN
 * @param amountMist  bet amount in MIST
 */
export function buildPlaceBet(
  marketId: string,
  direction: number,
  amountMist: number,
): Transaction {
  const tx = new Transaction();

  const [coin] = tx.splitCoins(tx.gas, [amountMist]);

  tx.moveCall({
    target: `${PACKAGE_ID}::bet::place_bet`,
    arguments: [
      tx.object(marketId),
      tx.pure.u8(direction),
      coin,
    ],
  });

  return tx;
}
