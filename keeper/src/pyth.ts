import { SuiPythClient, SuiPriceServiceConnection } from "@pythnetwork/pyth-sui-js";
import { Buffer } from "node:buffer";
import { Transaction } from "@mysten/sui/transactions";
import { client } from "./client.js";
import { PYTH_STATE_ID, WORMHOLE_STATE_ID } from "./config.js";

const HERMES_TESTNET = "https://hermes-beta.pyth.network";
const HERMES_MAINNET = "https://hermes.pyth.network";

const network = process.env.SUI_NETWORK ?? "testnet";
const hermesUrl = network === "mainnet" ? HERMES_MAINNET : HERMES_TESTNET;

const connection = new SuiPriceServiceConnection(hermesUrl);

export const pythClient = new SuiPythClient(client, PYTH_STATE_ID, WORMHOLE_STATE_ID);

/**
 * Fetch latest price update data from Hermes for the given feed IDs.
 */
export async function fetchPriceUpdateData(feedIds: string[]): Promise<Buffer[]> {
  return connection.getPriceFeedsUpdateData(feedIds);
}

/**
 * Fetch price update data at a specific publish_time (unix seconds) from Hermes.
 * Uses the REST endpoint: GET /v2/updates/price/{publish_time}?ids[]=...
 *
 * This returns the earliest price with timestamp >= publish_time,
 * which is exactly what settle_and_advance needs (anchor_time <= price_ts <= anchor_time + tolerance).
 */
export async function fetchPriceUpdateAtTime(
  feedIds: string[],
  publishTimeSec: number,
): Promise<Buffer[]> {
  const params = new URLSearchParams();
  for (const id of feedIds) {
    params.append("ids[]", id);
  }
  params.append("encoding", "hex");
  params.append("parsed", "false");

  const url = `${hermesUrl}/v2/updates/price/${publishTimeSec}?${params.toString()}`;
  const resp = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!resp.ok) {
    throw new Error(`Hermes fetch failed: ${resp.status} ${await resp.text()}`);
  }

  const json = (await resp.json()) as { binary?: { data?: string[] } };
  const hexData = json.binary?.data;
  if (!hexData || hexData.length === 0) {
    throw new Error(`No price data returned for publish_time=${publishTimeSec}`);
  }

  return hexData.map((hex) => Buffer.from(hex, "hex"));
}

/**
 * Add Pyth updatePriceFeeds calls to a transaction block.
 * Returns the PriceInfoObject IDs that can be passed to settle_and_advance.
 *
 * @param anchorTimeSec  If provided, fetch price at this specific unix timestamp (seconds).
 *                       If omitted, fetch latest price.
 */
export async function addPriceUpdates(
  tx: Transaction,
  feedIds: string[],
  anchorTimeSec?: number,
): Promise<string[]> {
  const updateData = anchorTimeSec
    ? await fetchPriceUpdateAtTime(feedIds, anchorTimeSec)
    : await fetchPriceUpdateData(feedIds);
  return pythClient.updatePriceFeeds(tx, updateData, feedIds);
}
