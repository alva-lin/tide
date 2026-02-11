import { useRef, useEffect, useMemo, useState } from "react";
import { useMarket } from "../../hooks/useMarket";
import { useRound } from "../../hooks/useRound";
import { useCountdown } from "../../hooks/useCountdown";
import { usePythPrice } from "../../hooks/usePythPrice";
import { formatCountdown, mistToSui, parsePrice } from "../../lib/format";
import { MARKET_MAP } from "../../lib/constants";
import { ROUND_LIVE, ROUND_UPCOMING, MARKET_PAUSED } from "../../lib/types";
import type { RoundData } from "../../lib/types";
import { ArrowUp, ArrowDown, Loader2, Info } from "lucide-react";
import { cn } from "../../lib/utils";

function calcOdds(upAmount: number, downAmount: number) {
  const total = upAmount + downAmount;
  if (total === 0) return { up: 0, down: 0 };
  return {
    up: upAmount > 0 ? total / upAmount : 0,
    down: downAmount > 0 ? total / downAmount : 0,
  };
}

export function LiveRound({ marketId }: { marketId: string }) {
  const { data: market, isPending: marketLoading } = useMarket(marketId);
  const hasLiveRound = (market?.currentRound ?? 0) > 0;
  const { data: rawLiveRound, isPlaceholderData: rawIsPlaceholder } = useRound(
    market?.tableId,
    market?.currentRound ?? 0,
  );
  const { data: nextRound } = useRound(
    market?.tableId,
    !hasLiveRound ? (market?.upcomingRound ?? 0) : 0,
  );

  // When currentRound=0, ignore stale placeholder data from keepPreviousData
  const liveRound = hasLiveRound ? rawLiveRound : null;
  const isPlaceholderData = hasLiveRound ? rawIsPlaceholder : false;

  const config = MARKET_MAP.get(marketId);
  const { data: pythPrice } = usePythPrice(config?.priceFeedId);

  const lastLiveRef = useRef<RoundData | null>(null);
  // Clear stale ref on market switch or when live round disappears (pause/resume)
  useEffect(() => {
    if (!hasLiveRound) lastLiveRef.current = null;
  }, [marketId, hasLiveRound]);
  useEffect(() => {
    if (liveRound?.status === ROUND_LIVE) {
      lastLiveRef.current = liveRound;
    }
  }, [liveRound]);

  const intervalMs = market?.intervalMs ?? 0;
  const endTimeMs =
    liveRound && liveRound.status === ROUND_LIVE
      ? liveRound.startTimeMs + intervalMs
      : 0;
  const remaining = useCountdown(endTimeMs);

  const isSettling =
    (liveRound?.status === ROUND_LIVE && remaining <= 0) || isPlaceholderData;

  const displayRound = liveRound ?? lastLiveRef.current;

  const progress =
    intervalMs > 0 && remaining > 0 ? Math.min(1, remaining / intervalMs) : 0;

  // Price
  const openPrice = useMemo(
    () =>
      displayRound
        ? parsePrice(displayRound.openPrice, displayRound.openPriceExpo)
        : null,
    [displayRound],
  );
  const currentPrice = pythPrice?.price ?? null;
  const priceDiff =
    openPrice != null && currentPrice != null ? currentPrice - openPrice : null;
  const direction: "up" | "down" | "neutral" =
    priceDiff != null && priceDiff > 0
      ? "up"
      : priceDiff != null && priceDiff < 0
        ? "down"
        : "neutral";

  const pricePrecision = config?.asset.startsWith("BTC") ? 2 : 4;
  const wrapClass = "overflow-hidden rounded-lg border bg-card shadow-sm";

  // Loading / error states
  if (marketLoading) {
    return (
      <div
        className={cn(
          wrapClass,
          "flex items-center justify-center py-12 text-muted-foreground",
        )}
      >
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  if (!market) {
    return (
      <div className={cn(wrapClass, "py-8 text-center text-muted-foreground")}>
        Failed to load market
      </div>
    );
  }

  const isPaused = market.status === MARKET_PAUSED;

  if (isPaused && !displayRound) {
    return (
      <div className={wrapClass}>
        <div className="h-1 w-full bg-muted" />
        <div className="p-4 space-y-3">
          <div className="flex items-center gap-2">
            <span className="inline-block h-2 w-2 rounded-full bg-muted-foreground" />
            <span className="text-sm font-medium">PAUSED</span>
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-1.5">
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
                Last Price
              </p>
              <PriceSourceTip />
            </div>
            <span
              className={cn(
                "text-xl font-bold tabular-nums font-mono",
                direction === "up"
                  ? "text-up"
                  : direction === "down"
                    ? "text-down"
                    : "text-foreground",
              )}
            >
              $
              {currentPrice != null
                ? currentPrice.toFixed(pricePrecision)
                : "--"}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            Market is paused. No active rounds.
          </p>
        </div>
      </div>
    );
  }

  if (!displayRound && market.currentRound > 0) {
    return (
      <div className={wrapClass}>
        <div className="h-1 w-full bg-muted" />
        <div className="p-4 space-y-4">
          <div className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            <span className="text-sm font-medium">
              Round #{market.currentRound}
            </span>
          </div>
          <div className="text-center space-y-1">
            <div className="mx-auto h-3 w-16 animate-pulse rounded bg-muted" />
            <div className="mx-auto h-8 w-36 animate-pulse rounded bg-muted" />
          </div>
        </div>
      </div>
    );
  }

  // No live round but upcoming round exists → show "NEXT" with countdown to start
  if (!displayRound && nextRound && nextRound.status === ROUND_UPCOMING) {
    return (
      <NextRoundPreview
        round={nextRound}
        currentPrice={currentPrice}
        pricePrecision={pricePrecision}
        wrapClass={wrapClass}
      />
    );
  }

  if (!displayRound) {
    return (
      <div className={cn(wrapClass, "p-6 text-center")}>
        <p className="text-sm text-muted-foreground">
          Waiting for next round...
        </p>
      </div>
    );
  }

  const totalPool = displayRound.upAmount + displayRound.downAmount;
  const odds = calcOdds(displayRound.upAmount, displayRound.downAmount);

  return (
    <div className={wrapClass}>
      {/* Progress bar */}
      <div className="h-1 w-full bg-muted">
        {!isSettling && (
          <div
            className="h-full bg-primary transition-all duration-1000 ease-linear"
            style={{ width: `${progress * 100}%` }}
          />
        )}
        {isSettling && (
          <div className="h-full w-full animate-pulse bg-muted-foreground/30" />
        )}
      </div>

      <div className="p-4 space-y-3">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {isSettling ? (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            ) : (
              <span className="inline-block h-2 w-2 rounded-full bg-up animate-pulse" />
            )}
            <span className="text-sm font-medium">
              {isSettling ? "SETTLING" : "LIVE"}
              &nbsp; &middot; #
              {displayRound.roundNumber}
            </span>
          </div>
          <span className="font-mono text-lg tabular-nums">
            {isSettling ? "--:--" : formatCountdown(remaining)}
          </span>
        </div>

        {/* Main: Price */}
        <div className="space-y-1">
          <div className="flex items-center gap-1.5">
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
              Last Price
            </p>
            <PriceSourceTip />
          </div>
          <div className="flex items-baseline gap-3 flex-wrap">
            <span
              className={cn(
                "text-xl font-bold tabular-nums font-mono",
                direction === "up"
                  ? "text-up"
                  : direction === "down"
                    ? "text-down"
                    : "text-foreground",
              )}
            >
              $
              {currentPrice != null
                ? currentPrice.toFixed(pricePrecision)
                : "--"}
            </span>
            {priceDiff != null && (
              <span
                className={cn(
                  "inline-flex items-center gap-1 rounded border px-2 py-0.5 text-xs font-mono font-semibold",
                  direction === "up"
                    ? "border-up/40 text-up"
                    : direction === "down"
                      ? "border-down/40 text-down"
                      : "border-border text-muted-foreground",
                )}
              >
                {direction === "up" ? (
                  <ArrowUp className="h-3 w-3" />
                ) : direction === "down" ? (
                  <ArrowDown className="h-3 w-3" />
                ) : null}
                ${Math.abs(priceDiff).toFixed(pricePrecision)}
              </span>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            Locked: ${openPrice != null ? openPrice.toFixed(pricePrecision) : "--"}
          </span>
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1 text-up font-medium">
              <ArrowUp className="h-3 w-3" />
              {odds.up > 0 ? `${odds.up.toFixed(2)}x` : "--"}
            </span>
            <span className="flex items-center gap-1 text-down font-medium">
              <ArrowDown className="h-3 w-3" />
              {odds.down > 0 ? `${odds.down.toFixed(2)}x` : "--"}
            </span>
            <span className="font-mono">
              {mistToSui(totalPool)} SUI
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* Preview when no live round but upcoming exists */
function NextRoundPreview({
  round,
  currentPrice,
  pricePrecision,
  wrapClass,
}: {
  round: RoundData;
  currentPrice: number | null;
  pricePrecision: number;
  wrapClass: string;
}) {
  const remaining = useCountdown(round.startTimeMs);
  const totalPool = round.upAmount + round.downAmount;
  const odds = calcOdds(round.upAmount, round.downAmount);

  return (
    <div className={wrapClass}>
      <div className="h-1 w-full bg-muted">
        {remaining > 0 && (
          <div className="h-full w-full animate-pulse bg-primary/30" />
        )}
      </div>
      <div className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="inline-block h-2 w-2 rounded-full bg-primary animate-pulse" />
            <span className="text-sm font-medium">
              NEXT &middot; #{round.roundNumber}
            </span>
          </div>
          <span className="font-mono text-lg tabular-nums">
            {remaining > 0 ? formatCountdown(remaining) : "Starting..."}
          </span>
        </div>

        <div className="space-y-1">
          <div className="flex items-center gap-1.5">
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
              Last Price
            </p>
            <PriceSourceTip />
          </div>
          <span className="text-xl font-bold tabular-nums font-mono">
            ${currentPrice != null ? currentPrice.toFixed(pricePrecision) : "--"}
          </span>
        </div>

        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Accepting bets</span>
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1 text-up font-medium">
              <ArrowUp className="h-3 w-3" />
              {odds.up > 0 ? `${odds.up.toFixed(2)}x` : "--"}
            </span>
            <span className="flex items-center gap-1 text-down font-medium">
              <ArrowDown className="h-3 w-3" />
              {odds.down > 0 ? `${odds.down.toFixed(2)}x` : "--"}
            </span>
            <span className="font-mono">
              {mistToSui(totalPool)} SUI
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* Tooltip for price source info */
function PriceSourceTip() {
  const [open, setOpen] = useState(false);
  return (
    <span
      className="relative inline-flex"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <Info className="h-3 w-3 text-muted-foreground/60 cursor-help" />
      {open && (
        <span className="absolute left-full top-1/2 ml-1.5 -translate-y-1/2 whitespace-nowrap rounded border bg-card px-2 py-1 text-[10px] text-muted-foreground shadow-sm z-10">
          Price from Pyth oracle — may differ from chart
        </span>
      )}
    </span>
  );
}
