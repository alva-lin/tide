import { useMarket } from "../../hooks/useMarket";
import { useRound } from "../../hooks/useRound";
import { useCountdown } from "../../hooks/useCountdown";
import { formatPrice, formatCountdown, mistToSui } from "../../lib/format";
import { ROUND_LIVE } from "../../lib/types";
import { ArrowUp, ArrowDown, Loader2 } from "lucide-react";

export function LiveRound({ marketId }: { marketId: string }) {
  const { data: market, isPending: marketLoading } = useMarket(marketId);
  const { data: liveRound } = useRound(
    market?.tableId,
    market?.currentRound ?? 0,
  );

  const endTimeMs =
    liveRound && liveRound.status === ROUND_LIVE
      ? liveRound.startTimeMs + (market?.intervalMs ?? 0)
      : 0;
  const remaining = useCountdown(endTimeMs);

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

  if (!liveRound || liveRound.status !== ROUND_LIVE) {
    return (
      <div className="border p-6 text-center">
        <p className="text-sm text-muted-foreground">
          Waiting for next round...
        </p>
      </div>
    );
  }

  const totalPool = liveRound.upAmount + liveRound.downAmount;

  return (
    <div className="border p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="inline-block h-2 w-2 rounded-full bg-up animate-pulse" />
          <span className="text-sm font-medium">
            LIVE &middot; Round #{liveRound.roundNumber}
          </span>
        </div>
        <span className="font-mono text-lg tabular-nums">
          {formatCountdown(remaining)}
        </span>
      </div>

      <div className="text-center">
        <p className="text-xs text-muted-foreground">Open Price</p>
        <p className="text-2xl font-bold tabular-nums">
          ${formatPrice(liveRound.openPrice, liveRound.openPriceExpo)}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="border p-3 space-y-1">
          <div className="flex items-center gap-1 text-up">
            <ArrowUp className="h-4 w-4" />
            <span className="text-sm font-medium">UP</span>
          </div>
          <p className="font-mono text-sm">{mistToSui(liveRound.upAmount)} SUI</p>
          <p className="text-xs text-muted-foreground">
            {liveRound.upCount} bet{liveRound.upCount !== 1 && "s"}
          </p>
        </div>
        <div className="border p-3 space-y-1">
          <div className="flex items-center gap-1 text-down">
            <ArrowDown className="h-4 w-4" />
            <span className="text-sm font-medium">DOWN</span>
          </div>
          <p className="font-mono text-sm">
            {mistToSui(liveRound.downAmount)} SUI
          </p>
          <p className="text-xs text-muted-foreground">
            {liveRound.downCount} bet{liveRound.downCount !== 1 && "s"}
          </p>
        </div>
      </div>

      <div className="text-center text-xs text-muted-foreground">
        Total Pool: {mistToSui(totalPool)} SUI
      </div>
    </div>
  );
}
