import { client, keypair } from "./client.js";
import { Transaction } from "@mysten/sui/transactions";

/**
 * Sign and execute a transaction, log the result.
 * Returns the transaction digest on success.
 */
export async function execute(tx: Transaction): Promise<string> {
  const result = await client.signAndExecuteTransaction({
    signer: keypair,
    transaction: tx,
    options: {
      showEffects: true,
      showEvents: true,
    },
  });

  const status = result.effects?.status?.status;
  if (status !== "success") {
    const error = result.effects?.status?.error ?? "unknown error";
    throw new Error(`Transaction failed: ${error}`);
  }

  console.log(`[tx] digest=${result.digest}  status=${status}`);

  if (result.events && result.events.length > 0) {
    for (const ev of result.events) {
      console.log(`  event: ${ev.type}`);
      console.log(`    ${JSON.stringify(ev.parsedJson)}`);
    }
  }

  return result.digest;
}

/**
 * Fetch the dynamic fields of a Market object to inspect round state.
 */
export async function getMarketObject(marketId: string) {
  return client.getObject({
    id: marketId,
    options: { showContent: true },
  });
}
