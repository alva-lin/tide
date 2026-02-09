import { client } from "./client.js";
import { getMarketObject } from "./execute.js";

export interface UpcomingRoundInfo {
  startTimeMs: number;
  upcomingRound: number;
  status: number;
}

export interface MarketState {
  status: number;
  currentRound: number;
  upcomingRound: number;
  roundCount: number;
  intervalMs: number;
  tableId: string;
}

export interface RoundData {
  roundNumber: number;
  status: number;
  startTimeMs: number;
  openPrice: string | null;
  openPriceExpo: string | null;
  closePrice: string | null;
  closePriceExpo: string | null;
  openTimestampMs: number | null;
  closeTimestampMs: number | null;
  upAmount: number;
  downAmount: number;
  upCount: number;
  downCount: number;
  poolValue: number;
  prizePool: number;
  result: number | null;
}

interface MarketFields {
  status: number;
  upcoming_round: string;
  current_round: string;
  interval_ms: string;
  round_count: string;
}

/**
 * Query on-chain market state and return info about the upcoming round.
 * Returns null if market is paused or has no upcoming round.
 */
export async function getUpcomingRoundInfo(
  marketId: string,
): Promise<UpcomingRoundInfo | null> {
  const obj = await getMarketObject(marketId);
  const content = obj.data?.content;
  if (content?.dataType !== "moveObject") return null;

  const fields = content.fields as unknown as MarketFields;
  const upcomingRound = Number(fields.upcoming_round);
  const status = Number(fields.status);

  if (status !== 0 || upcomingRound === 0) return null;

  const roundFields = await getTableItem(marketId, upcomingRound);
  if (!roundFields) return null;

  return {
    startTimeMs: Number(roundFields.start_time_ms),
    upcomingRound,
    status,
  };
}

async function getTableItem(
  marketId: string,
  roundNumber: number,
): Promise<Record<string, string> | null> {
  const obj = await client.getObject({
    id: marketId,
    options: { showContent: true },
  });
  const content = obj.data?.content;
  if (content?.dataType !== "moveObject") return null;

  const fields = content.fields as Record<string, unknown>;
  const roundsField = fields.rounds as { fields?: { id?: { id?: string } } };
  const tableId = roundsField?.fields?.id?.id;
  if (!tableId) return null;

  try {
    const dynamicField = await client.getDynamicFieldObject({
      parentId: tableId,
      name: { type: "u64", value: roundNumber.toString() },
    });

    const dfContent = dynamicField.data?.content;
    if (dfContent?.dataType !== "moveObject") return null;

    const dfFields = dfContent.fields as Record<string, unknown>;
    const value = dfFields.value as Record<string, unknown>;
    // value may be a raw object or { type, fields } wrapper from Sui RPC
    const rawFields = (value && typeof value === "object" && "fields" in value)
      ? (value as { fields: Record<string, unknown> }).fields
      : value;
    return rawFields as Record<string, string>;
  } catch {
    return null;
  }
}

/**
 * Read market-level state (status, round pointers, table ID).
 */
export async function getMarketState(marketId: string): Promise<MarketState | null> {
  const obj = await getMarketObject(marketId);
  const content = obj.data?.content;
  if (content?.dataType !== "moveObject") return null;

  const fields = content.fields as Record<string, unknown>;
  const roundsField = fields.rounds as { fields?: { id?: { id?: string } } };
  const tableId = roundsField?.fields?.id?.id;
  if (!tableId) return null;

  return {
    status: Number(fields.status),
    currentRound: Number(fields.current_round),
    upcomingRound: Number(fields.upcoming_round),
    roundCount: Number(fields.round_count),
    intervalMs: Number(fields.interval_ms),
    tableId,
  };
}

function parseOptionField(val: unknown): string | null {
  if (val === null || val === undefined) return null;
  if (typeof val === "object" && val !== null) {
    const obj = val as Record<string, unknown>;
    // Sui Move Option is serialized as { vec: [value] } or { vec: [] }
    if (Array.isArray(obj.vec)) {
      return obj.vec.length > 0 ? String(obj.vec[0]) : null;
    }
  }
  return String(val);
}

function parsePoolValue(pool: unknown): number {
  if (pool === null || pool === undefined) return 0;
  // Could be a plain string (e.g. "3000000000") or nested { fields: { value: "..." } }
  if (typeof pool === "string") return Number(pool);
  if (typeof pool === "number") return pool;
  if (typeof pool === "object") {
    const obj = pool as Record<string, unknown>;
    if (obj.fields && typeof obj.fields === "object") {
      return Number((obj.fields as Record<string, unknown>).value ?? 0);
    }
  }
  return 0;
}

function parseRoundFields(raw: Record<string, unknown>): RoundData {
  const pool = raw.pool;
  return {
    roundNumber: Number(raw.round_number),
    status: Number(raw.status),
    startTimeMs: Number(raw.start_time_ms),
    openPrice: parseOptionField(raw.open_price),
    openPriceExpo: parseOptionField(raw.open_price_expo),
    closePrice: parseOptionField(raw.close_price),
    closePriceExpo: parseOptionField(raw.close_price_expo),
    openTimestampMs: parseOptionField(raw.open_timestamp_ms) ? Number(parseOptionField(raw.open_timestamp_ms)) : null,
    closeTimestampMs: parseOptionField(raw.close_timestamp_ms) ? Number(parseOptionField(raw.close_timestamp_ms)) : null,
    upAmount: Number(raw.up_amount ?? 0),
    downAmount: Number(raw.down_amount ?? 0),
    upCount: Number(raw.up_count ?? 0),
    downCount: Number(raw.down_count ?? 0),
    poolValue: parsePoolValue(pool),
    prizePool: Number(raw.prize_pool ?? 0),
    result: parseOptionField(raw.result) !== null ? Number(parseOptionField(raw.result)) : null,
  };
}

/**
 * Read the most recent `count` rounds from a market (by round_number descending).
 */
export async function getRecentRounds(
  marketId: string,
  count: number = 5,
): Promise<{ market: MarketState; rounds: RoundData[] } | null> {
  const market = await getMarketState(marketId);
  if (!market) return null;

  const rounds: RoundData[] = [];
  const start = Math.max(1, market.roundCount - count + 1);

  for (let i = market.roundCount; i >= start; i--) {
    try {
      const dynamicField = await client.getDynamicFieldObject({
        parentId: market.tableId,
        name: { type: "u64", value: i.toString() },
      });

      const dfContent = dynamicField.data?.content;
      if (dfContent?.dataType !== "moveObject") continue;

      const dfFields = dfContent.fields as Record<string, unknown>;
      const value = dfFields.value as Record<string, unknown>;
      if (!value) continue;

      // value may be { type, fields } wrapper or flat object
      const rawFields = ("fields" in value)
        ? (value as { fields: Record<string, unknown> }).fields
        : value;

      rounds.push(parseRoundFields(rawFields as Record<string, unknown>));
    } catch {
      // round may not exist
    }
  }

  return { market, rounds };
}
