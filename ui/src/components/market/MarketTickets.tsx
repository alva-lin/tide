import { useState, useMemo } from "react";
import { useCurrentAccount, useDAppKit } from "@mysten/dapp-kit-react";
import { useQueryClient } from "@tanstack/react-query";
import { useTickets } from "../../hooks/useTickets";
import { useRounds } from "../../hooks/useRound";
import { useMarket } from "../../hooks/useMarket";
import { classifyTicket } from "../../hooks/useRedeemableTickets";
import { buildRedeemAll } from "../../tx/redeemAll";
import { mistToSui } from "../../lib/format";
import {
  DIRECTION_UP,
  ROUND_SETTLED,
  ROUND_CANCELLED,
  RESULT_DRAW,
  REDEEM_WIN,
  REDEEM_LOSE,
  REDEEM_CANCEL,
} from "../../lib/types";
import type { TicketData, RoundData } from "../../lib/types";
import { $localRedeems } from "../../stores/app";
import { ArrowUp, ArrowDown, Loader2, Gift } from "lucide-react";
import { cn } from "../../lib/utils";

type Category = "redeemable" | "inProgress" | "lost";

interface ClassifiedTicket extends TicketData {
  category: Category;
  round: RoundData | null;
}

export function MarketTickets({ marketId }: { marketId: string }) {
  const account = useCurrentAccount();
  const dAppKit = useDAppKit();
  const queryClient = useQueryClient();
  const { data: market } = useMarket(marketId);
  const { data: allTickets } = useTickets();

  const tickets = useMemo(
    () => (allTickets ?? []).filter((t) => t.marketId === marketId),
    [allTickets, marketId],
  );

  const roundNumbers = useMemo(
    () => [...new Set(tickets.map((t) => t.roundNumber))],
    [tickets],
  );
  const { data: rounds } = useRounds(market?.tableId, roundNumbers);

  const roundMap = useMemo(() => {
    const m = new Map<number, RoundData>();
    for (const r of rounds ?? []) m.set(r.roundNumber, r);
    return m;
  }, [rounds]);

  const classified: ClassifiedTicket[] = useMemo(() => {
    return tickets
      .map((t) => ({
        ...t,
        category: classifyTicket(
          t,
          roundMap.get(t.roundNumber) ?? null,
        ) as Category,
        round: roundMap.get(t.roundNumber) ?? null,
      }))
      .sort((a, b) => b.roundNumber - a.roundNumber);
  }, [tickets, roundMap]);

  const settledTickets = classified.filter((t) => {
    const round = roundMap.get(t.roundNumber);
    return (
      round &&
      (round.status === ROUND_SETTLED || round.status === ROUND_CANCELLED)
    );
  });

  const safeRedeemable = settledTickets.filter(
    (t) => t.category === "redeemable",
  );
  const unclaimedTotal = safeRedeemable.reduce((s, t) => s + t.amount, 0);

  const [txPending, setTxPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!account) return null;

  if (classified.length === 0) {
    return (
      <div className="rounded-lg border bg-card shadow-sm overflow-hidden">
        <div className="border-b px-3 py-2">
          <span className="text-sm font-medium">My Bets</span>
        </div>
        <div className="px-3 py-6 text-center text-xs text-muted-foreground">
          No active bets in this market
        </div>
      </div>
    );
  }

  const handleRedeemAll = async () => {
    if (settledTickets.length === 0) return;
    setError(null);
    setTxPending(true);
    try {
      const tx = buildRedeemAll(
        settledTickets.map((t) => ({
          marketId: t.marketId,
          objectId: t.objectId,
        })),
      );
      const result = await dAppKit.signAndExecuteTransaction({
        transaction: tx,
      });
      if (result.FailedTransaction) {
        throw new Error(
          result.FailedTransaction.status.error?.message ?? "Redeem failed",
        );
      }
      // Build synthetic redeem events for immediate Activity display
      const now = Date.now();
      const syntheticRedeems = settledTickets.map((t) => {
        const round = roundMap.get(t.roundNumber);
        const isCancelled = round?.status === ROUND_CANCELLED;
        const isWinner =
          !isCancelled &&
          round != null &&
          (round.result === RESULT_DRAW || round.result === t.direction);

        let outcome: number;
        let payout: number;
        if (isCancelled) {
          outcome = REDEEM_CANCEL;
          payout = t.amount;
        } else if (isWinner && round) {
          outcome = REDEEM_WIN;
          const totalPool = round.upAmount + round.downAmount;
          const winnerPool =
            t.direction === DIRECTION_UP ? round.upAmount : round.downAmount;
          payout = winnerPool > 0 ? (t.amount / winnerPool) * totalPool : t.amount;
        } else {
          outcome = REDEEM_LOSE;
          payout = 0;
        }

        return {
          type: "redeem" as const,
          marketId: t.marketId,
          roundNumber: t.roundNumber,
          outcome,
          betAmount: t.amount,
          payout,
          timestamp: now,
        };
      });

      $localRedeems.set([...syntheticRedeems, ...$localRedeems.get()]);
      queryClient.invalidateQueries({ queryKey: ["tickets"] });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Redeem failed");
    } finally {
      setTxPending(false);
    }
  };

  const liveRound = market?.currentRound ?? 0;
  const upcomingRound = market?.upcomingRound ?? 0;

  return (
    <div className="rounded-lg border bg-card shadow-sm overflow-hidden">
      <div className="flex items-center justify-between border-b px-3 py-2">
        <div>
          <span className="text-sm font-medium">My Bets</span>
          <span className="ml-1.5 text-xs text-muted-foreground">
            ({classified.length})
          </span>
        </div>
        {settledTickets.length > 0 && (
          <button
            onClick={handleRedeemAll}
            disabled={txPending}
            className="flex items-center gap-1.5 rounded border border-up bg-up/10 px-2.5 py-1 text-xs font-medium text-up transition-colors hover:bg-up/20 disabled:opacity-50"
          >
            {txPending ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Gift className="h-3 w-3" />
            )}
            Redeem
            {unclaimedTotal > 0
              ? ` ${mistToSui(unclaimedTotal)} SUI`
              : " All"}
          </button>
        )}
      </div>

      <div className="max-h-[10rem] overflow-y-auto divide-y scrollbar-thin">
        {classified.map((t) => (
          <TicketRow
            key={t.objectId}
            ticket={t}
            liveRound={liveRound}
            upcomingRound={upcomingRound}
          />
        ))}
      </div>

      {error && (
        <div className="border-t px-3 py-2 text-xs text-destructive-foreground">
          {error}
        </div>
      )}
    </div>
  );
}

function TicketRow({
  ticket,
  liveRound,
  upcomingRound,
}: {
  ticket: ClassifiedTicket;
  liveRound: number;
  upcomingRound: number;
}) {
  const isWon = ticket.category === "redeemable";
  const isLost = ticket.category === "lost";
  const isCancelled = ticket.round?.status === ROUND_CANCELLED;
  const isLive = ticket.roundNumber === liveRound;
  const isUpcoming = ticket.roundNumber === upcomingRound;

  // Calculate payout multiplier for won tickets
  const round = ticket.round;
  let payout: number | null = null;
  if (isWon && round && !isCancelled) {
    const totalPool = round.upAmount + round.downAmount;
    const winnerPool =
      ticket.direction === DIRECTION_UP ? round.upAmount : round.downAmount;
    if (winnerPool > 0) payout = totalPool / winnerPool;
  }

  let statusLabel: string;
  let statusClass: string;
  if (isCancelled) {
    statusLabel = "Cancelled";
    statusClass = "text-muted-foreground";
  } else if (isWon) {
    statusLabel = payout != null ? `${payout.toFixed(2)}x Won` : "Won";
    statusClass = "text-up";
  } else if (isLost) {
    statusLabel = "Lost";
    statusClass = "text-down";
  } else if (isLive) {
    statusLabel = "Live";
    statusClass = "text-primary";
  } else if (isUpcoming) {
    statusLabel = "Next";
    statusClass = "text-muted-foreground";
  } else {
    statusLabel = "Pending";
    statusClass = "text-muted-foreground";
  }

  return (
    <div
      className={cn(
        "flex items-center justify-between px-3 py-2 text-xs",
        (isLost || isCancelled) && "opacity-40",
      )}
    >
      <div className="flex items-center gap-2">
        {ticket.direction === DIRECTION_UP ? (
          <ArrowUp className="h-3.5 w-3.5 text-up" />
        ) : (
          <ArrowDown className="h-3.5 w-3.5 text-down" />
        )}
        <span className="text-muted-foreground">#{ticket.roundNumber}</span>
        <span className="font-mono">{mistToSui(ticket.amount)} SUI</span>
      </div>
      <span className={cn("text-xs font-medium", statusClass)}>
        {statusLabel}
      </span>
    </div>
  );
}
