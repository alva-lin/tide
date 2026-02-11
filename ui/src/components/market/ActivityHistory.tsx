import { useMemo, useRef, useEffect, useCallback } from "react";
import { useCurrentAccount } from "@mysten/dapp-kit-react";
import { useStore } from "@nanostores/react";
import { useActivityHistory } from "../../hooks/useActivityHistory";
import { useTickets } from "../../hooks/useTickets";
import { $localRedeems } from "../../stores/app";
import { mistToSui } from "../../lib/format";
import {
  REDEEM_WIN,
  REDEEM_LOSE,
  REDEEM_CANCEL,
} from "../../lib/types";
import type { ActivityEvent } from "../../lib/types";
import { Trophy, X, Clock, Loader2, Ban } from "lucide-react";
import { cn } from "../../lib/utils";

interface RoundSummary {
  roundNumber: number;
  totalBet: number;
  directions: Set<number>;
  redeemed: boolean;
  outcome: number | null;
  payout: number;
  timestamp: number;
}

function mergeByRound(events: ActivityEvent[]): RoundSummary[] {
  const map = new Map<number, RoundSummary>();

  for (const ev of events) {
    let entry = map.get(ev.roundNumber);
    if (!entry) {
      entry = {
        roundNumber: ev.roundNumber,
        totalBet: 0,
        directions: new Set(),
        redeemed: false,
        outcome: null,
        payout: 0,
        timestamp: ev.timestamp,
      };
      map.set(ev.roundNumber, entry);
    }

    if (ev.timestamp > entry.timestamp) entry.timestamp = ev.timestamp;

    if (ev.type === "bet") {
      entry.totalBet += ev.amount;
      entry.directions.add(ev.direction);
    } else {
      // Overwrite (not accumulate) — handles duplicate synthetic + real events
      entry.redeemed = true;
      entry.outcome = ev.outcome;
      entry.payout = ev.payout;
    }
  }

  return [...map.values()].sort((a, b) => b.roundNumber - a.roundNumber);
}

export function ActivityHistory({ marketId }: { marketId: string }) {
  const account = useCurrentAccount();
  const {
    data,
    isPending,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  } = useActivityHistory();

  const { data: allTickets } = useTickets();

  // Rounds that still have active tickets → shown in My Bets, excluded here
  const activeRoundNumbers = useMemo(() => {
    if (!allTickets) return new Set<number>();
    return new Set(
      allTickets
        .filter((t) => t.marketId === marketId)
        .map((t) => t.roundNumber),
    );
  }, [allTickets, marketId]);

  const localRedeems = useStore($localRedeems);

  const allEvents = useMemo(() => {
    const fetched = data ? data.pages.flatMap((p) => p.events) : [];
    // Merge synthetic local redeems (optimistic, pre-indexer)
    return [...fetched, ...localRedeems];
  }, [data, localRedeems]);

  const rounds = useMemo(() => {
    const filtered = allEvents.filter((ev) => ev.marketId === marketId);
    const merged = mergeByRound(filtered);
    return merged.filter((r) => !activeRoundNumbers.has(r.roundNumber));
  }, [allEvents, marketId, activeRoundNumbers]);

  const sentinelRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const handleLoadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    const scroll = scrollRef.current;
    if (!sentinel || !scroll) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) handleLoadMore();
      },
      { root: scroll, threshold: 0.1 },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [handleLoadMore]);

  if (!account) return null;

  return (
    <div className="rounded-lg border bg-card shadow-sm overflow-hidden">
      <div className="border-b px-3 py-2">
        <span className="text-sm font-medium">Activity</span>
        {rounds.length > 0 && (
          <span className="ml-1.5 text-xs text-muted-foreground">
            ({rounds.length})
          </span>
        )}
      </div>

      {isPending && (
        <div className="flex items-center justify-center py-6">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      )}

      {!isPending && rounds.length === 0 && (
        <div className="px-3 py-6 text-center text-xs text-muted-foreground">
          No activity yet
        </div>
      )}

      {rounds.length > 0 && (
        <div
          ref={scrollRef}
          className="max-h-[10rem] overflow-y-auto divide-y scrollbar-thin"
        >
          {rounds.map((r) => (
            <RoundRow key={r.roundNumber} round={r} />
          ))}
          {hasNextPage && (
            <div ref={sentinelRef} className="flex items-center justify-center py-2">
              {isFetchingNextPage && (
                <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function RoundRow({ round }: { round: RoundSummary }) {
  const isWin = round.outcome === REDEEM_WIN;
  const isLose = round.outcome === REDEEM_LOSE;
  const isCancel = round.outcome === REDEEM_CANCEL;
  const profit = round.payout - round.totalBet;

  return (
    <div
      className={cn(
        "flex items-center justify-between px-3 py-2 text-xs",
        (isLose || isCancel) && "opacity-40",
      )}
    >
      <div className="flex items-center gap-2">
        {isWin ? (
          <Trophy className="h-3.5 w-3.5 text-up" />
        ) : isLose ? (
          <X className="h-3.5 w-3.5 text-down" />
        ) : isCancel ? (
          <Ban className="h-3.5 w-3.5 text-muted-foreground" />
        ) : (
          <Clock className="h-3.5 w-3.5 text-muted-foreground" />
        )}
        <span className="text-muted-foreground">#{round.roundNumber}</span>
        <span className="font-mono">{mistToSui(round.totalBet)} SUI</span>
      </div>

      <div className="flex items-center gap-1.5">
        {round.redeemed ? (
          <span
            className={cn(
              "font-mono font-medium",
              isWin ? "text-up" : isLose ? "text-down" : "text-muted-foreground",
            )}
          >
            {isWin && profit > 0
              ? `+${mistToSui(profit)} SUI`
              : isLose
                ? `-${mistToSui(round.totalBet)} SUI`
                : isCancel
                  ? "Cancelled"
                  : `${mistToSui(round.payout)} SUI`}
          </span>
        ) : (
          <span className="text-muted-foreground">Pending</span>
        )}
      </div>
    </div>
  );
}
