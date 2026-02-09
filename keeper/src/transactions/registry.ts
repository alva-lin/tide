import { Transaction } from "@mysten/sui/transactions";
import { PACKAGE_ID, REGISTRY_ID, ADMIN_CAP_ID } from "../config.js";

/**
 * Build an `update_config` transaction (admin only).
 */
export function buildUpdateConfig(opts: {
  feeBps: number;
  settlerRewardBps: number;
  priceToleranceMs: number;
}): Transaction {
  const tx = new Transaction();

  tx.moveCall({
    target: `${PACKAGE_ID}::registry::update_config`,
    arguments: [
      tx.object(ADMIN_CAP_ID),
      tx.object(REGISTRY_ID),
      tx.pure.u64(opts.feeBps),
      tx.pure.u64(opts.settlerRewardBps),
      tx.pure.u64(opts.priceToleranceMs),
    ],
  });

  return tx;
}

/**
 * Build a `withdraw_treasury` transaction (admin only).
 * The move call returns a Coin<SUI> which must be transferred to the caller.
 */
export function buildWithdrawTreasury(amountMist: number, recipient: string): Transaction {
  const tx = new Transaction();

  const [coin] = tx.moveCall({
    target: `${PACKAGE_ID}::registry::withdraw_treasury`,
    arguments: [
      tx.object(ADMIN_CAP_ID),
      tx.object(REGISTRY_ID),
      tx.pure.u64(amountMist),
    ],
  });

  tx.transferObjects([coin], recipient);

  return tx;
}
