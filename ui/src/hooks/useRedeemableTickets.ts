import { useTickets } from "./useTickets";
import { useMemo } from "react";
import type { TicketData, RoundData } from "../lib/types";
import { ROUND_SETTLED, ROUND_CANCELLED, RESULT_DRAW } from "../lib/types";

export interface ClassifiedTicket extends TicketData {
  round: RoundData | null;
  category: "redeemable" | "inProgress" | "lost";
}

export function useRedeemableTickets(marketId?: string) {
  const { data: tickets, ...rest } = useTickets();

  const filtered = useMemo(
    () =>
      marketId
        ? (tickets ?? []).filter((t) => t.marketId === marketId)
        : (tickets ?? []),
    [tickets, marketId],
  );

  return { tickets: filtered, ...rest };
}

export function classifyTicket(
  ticket: TicketData,
  round: RoundData | null,
): ClassifiedTicket["category"] {
  if (!round) return "inProgress";

  if (round.status === ROUND_CANCELLED) return "redeemable";

  if (round.status === ROUND_SETTLED) {
    if (round.result === RESULT_DRAW) return "redeemable";
    if (round.result === ticket.direction) return "redeemable";
    return "lost";
  }

  return "inProgress";
}
