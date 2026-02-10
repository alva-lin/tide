import { useCurrentAccount, useCurrentClient } from "@mysten/dapp-kit-react";
import { useQuery } from "@tanstack/react-query";
import type { SuiClientTypes } from "@mysten/sui/client";
import { TICKET_TYPE } from "../lib/constants";
import type { TicketData } from "../lib/types";

type ObjPage = SuiClientTypes.ListOwnedObjectsResponse<{ json: true }>;

export function useTickets() {
  const account = useCurrentAccount();
  const client = useCurrentClient();

  return useQuery({
    queryKey: ["tickets", account?.address],
    queryFn: async (): Promise<TicketData[]> => {
      if (!account) return [];

      const tickets: TicketData[] = [];
      let cursor: string | null | undefined = undefined;

      for (;;) {
        const page: ObjPage = await client.core.listOwnedObjects({
          owner: account.address,
          type: TICKET_TYPE,
          include: { json: true } as const,
          cursor: cursor ?? undefined,
        });

        for (const obj of page.objects) {
          const json = obj.json;
          if (!json) continue;
          tickets.push({
            objectId: obj.objectId,
            marketId: String(json.market_id),
            roundNumber: Number(json.round_number),
            direction: Number(json.direction),
            amount: Number(json.amount),
          });
        }

        if (!page.hasNextPage) break;
        cursor = page.cursor;
      }

      return tickets;
    },
    enabled: !!account,
    refetchInterval: 10_000,
  });
}
