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

export interface RegistryConfig {
  feeBps: number;
  settlerRewardBps: number;
  priceToleranceMs: number;
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

export interface MarketSnapshot {
  state: MarketState;
  upcomingRound: UpcomingRoundInfo | null;
}

/**
 * Read the market object once and derive both MarketState and UpcomingRoundInfo.
 * Only issues 1 RPC for the market object + 1 for the dynamic field (if upcoming round exists).
 */
export async function getMarketSnapshot(marketId: string): Promise<MarketSnapshot | null> {
  const obj = await getMarketObject(marketId);
  const content = obj.data?.content;
  if (content?.dataType !== "moveObject") return null;

  const fields = content.fields as Record<string, unknown>;
  const roundsField = fields.rounds as { fields?: { id?: { id?: string } } };
  const tableId = roundsField?.fields?.id?.id;
  if (!tableId) return null;

  const state: MarketState = {
    status: Number(fields.status),
    currentRound: Number(fields.current_round),
    upcomingRound: Number(fields.upcoming_round),
    roundCount: Number(fields.round_count),
    intervalMs: Number(fields.interval_ms),
    tableId,
  };

  let upcomingRound: UpcomingRoundInfo | null = null;
  if (state.status === 0 && state.upcomingRound !== 0) {
    const roundFields = await getRoundFromTable(tableId, state.upcomingRound);
    if (roundFields) {
      upcomingRound = {
        startTimeMs: Number(roundFields.start_time_ms),
        upcomingRound: state.upcomingRound,
        status: state.status,
      };
    }
  }

  return { state, upcomingRound };
}

/**
 * Read a single round from the dynamic field table (1 RPC).
 */
async function getRoundFromTable(
  tableId: string,
  roundNumber: number,
): Promise<Record<string, string> | null> {
  try {
    const dynamicField = await client.getDynamicFieldObject({
      parentId: tableId,
      name: { type: "u64", value: roundNumber.toString() },
    });

    const dfContent = dynamicField.data?.content;
    if (dfContent?.dataType !== "moveObject") return null;

    const dfFields = dfContent.fields as Record<string, unknown>;
    const value = dfFields.value as Record<string, unknown>;
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

/**
 * Read Registry config from chain (fee_bps, settler_reward_bps, price_tolerance_ms).
 */
let _registryCache: RegistryConfig | null = null;
let _registryCacheId = "";
let _registryCacheTime = 0;

export async function getRegistryConfig(registryId: string): Promise<RegistryConfig | null> {
  // Cache for 10s — registry config rarely changes
  const now = Date.now();
  if (_registryCache && _registryCacheId === registryId && now - _registryCacheTime < 10_000) {
    return _registryCache;
  }

  const obj = await client.getObject({
    id: registryId,
    options: { showContent: true },
  });
  const content = obj.data?.content;
  if (content?.dataType !== "moveObject") return null;

  const fields = content.fields as Record<string, unknown>;
  const config: RegistryConfig = {
    feeBps: Number(fields.fee_bps),
    settlerRewardBps: Number(fields.settler_reward_bps),
    priceToleranceMs: Number(fields.price_tolerance_ms),
  };

  _registryCache = config;
  _registryCacheId = registryId;
  _registryCacheTime = now;
  return config;
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
