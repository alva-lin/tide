import { useCurrentClient } from "@mysten/dapp-kit-react";
import { useQuery } from "@tanstack/react-query";
import type { RoundData } from "../lib/types";
import { u64BcsName } from "./useMarket";

function optField(val: unknown): string | null {
  if (val === null || val === undefined) return null;
  return String(val);
}

function parsePoolValue(pool: unknown): number {
  if (pool === null || pool === undefined) return 0;
  if (typeof pool === "string") return Number(pool);
  if (typeof pool === "number") return pool;
  if (typeof pool === "object" && pool !== null) {
    const obj = pool as Record<string, unknown>;
    if (typeof obj.value === "string" || typeof obj.value === "number")
      return Number(obj.value);
  }
  return 0;
}

function parseRoundJson(json: Record<string, unknown>): RoundData {
  return {
    roundNumber: Number(json.round_number),
    status: Number(json.status),
    startTimeMs: Number(json.start_time_ms),
    openPrice: optField(json.open_price),
    openPriceExpo: optField(json.open_price_expo),
    closePrice: optField(json.close_price),
    closePriceExpo: optField(json.close_price_expo),
    openTimestampMs: json.open_timestamp_ms != null ? Number(json.open_timestamp_ms) : null,
    closeTimestampMs: json.close_timestamp_ms != null ? Number(json.close_timestamp_ms) : null,
    upAmount: Number(json.up_amount ?? 0),
    downAmount: Number(json.down_amount ?? 0),
    upCount: Number(json.up_count ?? 0),
    downCount: Number(json.down_count ?? 0),
    poolValue: parsePoolValue(json.pool),
    prizePool: Number(json.prize_pool ?? 0),
    result: json.result != null ? Number(json.result) : null,
  };
}

// Table<u64, Round> uses dynamic_field (not dynamic_object_field).
// getDynamicField returns only BCS, so we resolve fieldId then getObject for JSON.
// The JSON of a Field<u64, Round> is { id, name, value: { ...roundFields } }.

async function fetchRound(
  client: ReturnType<typeof useCurrentClient>,
  tableId: string,
  roundNumber: number,
): Promise<RoundData | null> {
  const { dynamicField } = await client.core.getDynamicField({
    parentId: tableId,
    name: u64BcsName(roundNumber),
  });
  const { object } = await client.core.getObject({
    objectId: dynamicField.fieldId,
    include: { json: true },
  });
  const json = object.json;
  if (!json) return null;
  // Field<u64, Round> → round fields live under json.value
  const roundJson = (json.value ?? json) as Record<string, unknown>;
  return parseRoundJson(roundJson);
}

export function useRound(tableId: string | undefined, roundNumber: number) {
  const client = useCurrentClient();

  return useQuery({
    queryKey: ["round", tableId, roundNumber],
    queryFn: async (): Promise<RoundData | null> => {
      if (!tableId || roundNumber === 0) return null;
      return fetchRound(client, tableId, roundNumber);
    },
    enabled: !!tableId && roundNumber > 0,
    refetchInterval: 5_000,
  });
}

export function useRounds(
  tableId: string | undefined,
  roundNumbers: number[],
) {
  const client = useCurrentClient();

  return useQuery({
    queryKey: ["rounds", tableId, roundNumbers],
    queryFn: async (): Promise<RoundData[]> => {
      if (!tableId || roundNumbers.length === 0) return [];

      const results: RoundData[] = [];
      for (const num of roundNumbers) {
        try {
          const round = await fetchRound(client, tableId, num);
          if (round) results.push(round);
        } catch {
          // round may not exist
        }
      }
      return results;
    },
    enabled: !!tableId && roundNumbers.length > 0,
    refetchInterval: 10_000,
  });
}
