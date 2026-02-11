import { useRef, useEffect } from "react";
import { useMarket } from "../../hooks/useMarket";
import { useRound } from "../../hooks/useRound";
import { useCountdown } from "../../hooks/useCountdown";
import { formatPrice, formatCountdown, mistToSui } from "../../lib/format";
import { ROUND_LIVE } from "../../lib/types";
import type { RoundData } from "../../lib/types";
import { ArrowUp, ArrowDown, Loader2 } from "lucide-react";

export function LiveRound({ marketId }: { marketId: string }) {
  const { data: market, isPending: marketLoading } = useMarket(marketId);
  const { data: liveRound, isPlaceholderData } = useRound(
    market?.tableId,
    market?.currentRound ?? 0,
  );

  const lastLiveRef = useRef<RoundData | null>(null);
  useEffect(() => {
    if (liveRound?.status === ROUND_LIVE) {
      lastLiveRef.current = liveRound;
    }
  }, [liveRound]);

  const endTimeMs =
    liveRound && liveRound.status === ROUND_LIVE
      ? liveRound.startTimeMs + (market?.intervalMs ?? 0)
      : 0;
  const remaining = useCountdown(endTimeMs);

  const isSettling =
    (liveRound?.status === ROUND_LIVE && remaining <= 0) || isPlaceholderData;

  const displayRound = liveRound ?? lastLiveRef.current;

  if (marketLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  if (!market) {
    return (
      <div className="py-8 text-center text-muted-foreground">
        Failed to load market
      </div>
    );
  }

  // We know the round number but data hasn't loaded yet — show skeleton
  if (!displayRound && market.currentRound > 0) {
    return (
      <div className="border p-4 space-y-4">
        {/* header row */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            <span className="text-sm font-medium">
              Round #{market.currentRound}
            </span>
          </div>
          <div className="h-7 w-16 animate-pulse rounded bg-muted" />
        </div>
        {/* open price */}
        <div className="text-center space-y-1">
          <div className="mx-auto h-3 w-16 animate-pulse rounded bg-muted" />
          <div className="mx-auto h-8 w-36 animate-pulse rounded bg-muted" />
        </div>
        {/* up/down cards */}
        <div className="grid grid-cols-2 gap-3">
          <div className="border p-3 space-y-1">
            <div className="h-4 w-10 animate-pulse rounded bg-muted" />
            <div className="h-4 w-20 animate-pulse rounded bg-muted" />
            <div className="h-3 w-12 animate-pulse rounded bg-muted" />
          </div>
          <div className="border p-3 space-y-1">
            <div className="h-4 w-14 animate-pulse rounded bg-muted" />
            <div className="h-4 w-20 animate-pulse rounded bg-muted" />
            <div className="h-3 w-12 animate-pulse rounded bg-muted" />
          </div>
        </div>
        {/* total pool */}
        <div className="flex justify-center">
          <div className="h-3 w-28 animate-pulse rounded bg-muted" />
        </div>
      </div>
    );
  }

  if (!displayRound) {
    return (
      <div className="border p-6 text-center">
        <p className="text-sm text-muted-foreground">
          Waiting for next round...
        </p>
      </div>
    );
  }

  const totalPool = displayRound.upAmount + displayRound.downAmount;

  return (
    <div className="border p-4 space-y-4 transition-opacity duration-300">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {isSettling ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : (
            <span className="inline-block h-2 w-2 rounded-full bg-up animate-pulse" />
          )}
          <span className="text-sm font-medium">
            {isSettling ? "SETTLING" : "LIVE"} &middot; Round #
            {displayRound.roundNumber}
          </span>
        </div>
        <span className="font-mono text-lg tabular-nums">
          {isSettling ? "--:--" : formatCountdown(remaining)}
        </span>
      </div>

      <div className="text-center">
        <p className="text-xs text-muted-foreground">Open Price</p>
        <p className="text-2xl font-bold tabular-nums">
          ${formatPrice(displayRound.openPrice, displayRound.openPriceExpo)}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="border p-3 space-y-1">
          <div className="flex items-center gap-1 text-up">
            <ArrowUp className="h-4 w-4" />
            <span className="text-sm font-medium">UP</span>
          </div>
          <p className="font-mono text-sm">
            {mistToSui(displayRound.upAmount)} SUI
          </p>
          <p className="text-xs text-muted-foreground">
            {displayRound.upCount} bet{displayRound.upCount !== 1 && "s"}
          </p>
        </div>
        <div className="border p-3 space-y-1">
          <div className="flex items-center gap-1 text-down">
            <ArrowDown className="h-4 w-4" />
            <span className="text-sm font-medium">DOWN</span>
          </div>
          <p className="font-mono text-sm">
            {mistToSui(displayRound.downAmount)} SUI
          </p>
          <p className="text-xs text-muted-foreground">
            {displayRound.downCount} bet{displayRound.downCount !== 1 && "s"}
          </p>
        </div>
      </div>

      <div className="text-center text-xs text-muted-foreground">
        Total Pool: {mistToSui(totalPool)} SUI
      </div>
    </div>
  );
}
