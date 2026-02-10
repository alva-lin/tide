import type { TicketData, RoundData } from "../../lib/types";
import { DIRECTION_UP, ROUND_SETTLED, ROUND_CANCELLED, RESULT_DRAW } from "../../lib/types";
import { mistToSui } from "../../lib/format";
import { MARKETS } from "../../lib/constants";
import { ArrowUp, ArrowDown } from "lucide-react";
import { cn } from "../../lib/utils";

function getMarketLabel(marketId: string): string {
  return MARKETS.find((m) => m.marketId === marketId)?.label ?? "Unknown";
}

function getStatusLabel(
  ticket: TicketData,
  round: RoundData | null,
): { text: string; color: string } {
  if (!round) return { text: "Pending", color: "text-muted-foreground" };

  if (round.status === ROUND_CANCELLED)
    return { text: "Cancelled", color: "text-muted-foreground" };

  if (round.status === ROUND_SETTLED) {
    if (round.result === RESULT_DRAW)
      return { text: "Draw", color: "text-muted-foreground" };
    if (round.result === ticket.direction)
      return { text: "Won", color: "text-up" };
    return { text: "Lost", color: "text-down" };
  }

  return { text: "In Progress", color: "text-muted-foreground" };
}

export function TicketRow({
  ticket,
  round,
}: {
  ticket: TicketData;
  round: RoundData | null;
}) {
  const status = getStatusLabel(ticket, round);

  return (
    <div className="flex items-center justify-between border-b py-3 last:border-b-0">
      <div className="flex items-center gap-2">
        {ticket.direction === DIRECTION_UP ? (
          <ArrowUp className="h-4 w-4 text-up" />
        ) : (
          <ArrowDown className="h-4 w-4 text-down" />
        )}
        <div>
          <p className="text-sm">
            {getMarketLabel(ticket.marketId)} #{ticket.roundNumber}
          </p>
          <p className="text-xs text-muted-foreground">
            {mistToSui(ticket.amount)} SUI
          </p>
        </div>
      </div>
      <span className={cn("text-sm font-medium", status.color)}>
        {status.text}
      </span>
    </div>
  );
}
