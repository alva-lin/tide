import { Transaction } from "@mysten/sui/transactions";
import { PACKAGE_ID, REGISTRY_ID, ADMIN_CAP_ID, CLOCK_ID } from "../config.js";

/**
 * Build a `create_market` transaction.
 *
 * Requires AdminCap — must be signed by admin.
 */
export function buildCreateMarket(opts: {
  pythFeedId: string; // hex with 0x prefix
  intervalMs: number;
  minBet: number; // in MIST
  startTimeMs: number;
}): Transaction {
  const tx = new Transaction();

  // Convert hex feed ID to vector<u8>
  const feedBytes = hexToBytes(opts.pythFeedId);

  tx.moveCall({
    target: `${PACKAGE_ID}::market::create_market`,
    arguments: [
      tx.object(ADMIN_CAP_ID),
      tx.object(REGISTRY_ID),
      tx.pure.vector("u8", feedBytes),
      tx.pure.u64(opts.intervalMs),
      tx.pure.u64(opts.minBet),
      tx.pure.u64(opts.startTimeMs),
      tx.object(CLOCK_ID),
    ],
  });

  return tx;
}

function hexToBytes(hex: string): number[] {
  const h = hex.startsWith("0x") ? hex.slice(2) : hex;
  const bytes: number[] = [];
  for (let i = 0; i < h.length; i += 2) {
    bytes.push(parseInt(h.substring(i, i + 2), 16));
  }
  return bytes;
}
