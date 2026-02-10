import { Transaction } from "@mysten/sui/transactions";
import { PACKAGE_ID, CLOCK_ID } from "../lib/constants";

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
      tx.object(CLOCK_ID),
    ],
  });
  return tx;
}
