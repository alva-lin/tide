import { useCurrentClient } from "@mysten/dapp-kit-react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { bcs } from "@mysten/sui/bcs";
import type { MarketState } from "../lib/types";

export function useMarket(marketId: string) {
  const client = useCurrentClient();

  return useQuery({
    queryKey: ["market", marketId],
    queryFn: async (): Promise<MarketState | null> => {
      const { object } = await client.core.getObject({
        objectId: marketId,
        include: { json: true },
      });
      const json = object.json;
      if (!json) return null;

      const rounds = json.rounds as Record<string, unknown> | undefined;
      // gRPC json: rounds.id is a flat string
      // JSON-RPC: rounds.id is { id: "0x..." }
      const rawId = rounds?.id;
      const tableId =
        typeof rawId === "string"
          ? rawId
          : (rawId as Record<string, unknown> | undefined)?.id as string | undefined;
      if (!tableId) return null;

      return {
        status: Number(json.status),
        currentRound: Number(json.current_round),
        upcomingRound: Number(json.upcoming_round),
        roundCount: Number(json.round_count),
        intervalMs: Number(json.interval_ms),
        tableId,
      };
    },
    refetchInterval: 5_000,
    placeholderData: keepPreviousData,
  });
}

export function u64BcsName(value: number) {
  return {
    type: "u64" as const,
    bcs: bcs.u64().serialize(BigInt(value)).toBytes(),
  };
}
