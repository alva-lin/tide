import { useMemo, useRef } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useMarket } from "../../hooks/useMarket";
import { useRounds } from "../../hooks/useRound";
import {
  ROUND_SETTLED,
  ROUND_CANCELLED,
  RESULT_UP,
  RESULT_DOWN,
  RESULT_DRAW,
} from "../../lib/types";
import type { RoundData } from "../../lib/types";
import { parsePrice, mistToSui } from "../../lib/format";
import { ArrowUp, ArrowDown, Minus, Loader2, Users } from "lucide-react";
import { cn } from "../../lib/utils";

const MAX_VISIBLE = 5;
const ROW_HEIGHT = 40;

export function RoundHistory({ marketId }: { marketId: string }) {
  const { data: market } = useMarket(marketId);
  const currentRound = market?.currentRound ?? 0;
  const upcomingRound = market?.upcomingRound ?? 0;
  const roundCount = market?.roundCount ?? 0;

  // Determine the latest round that could be settled/cancelled:
  // - Normal: currentRound - 1
  // - Resume (no live yet): upcomingRound - 1
  // - Paused (both 0): roundCount
  const latestSettled =
    currentRound > 0
      ? currentRound - 1
      : upcomingRound > 0
        ? upcomingRound - 1
        : roundCount;

  const roundNumbers = useMemo(() => {
    if (latestSettled <= 0) return [];
    const nums: number[] = [];
    for (let i = latestSettled; i >= Math.max(1, latestSettled - MAX_VISIBLE + 1); i--) {
      nums.push(i);
    }
    return nums;
  }, [latestSettled]);

  const prevMarketRef = useRef(marketId);
  prevMarketRef.current = marketId;

  const { data: rounds } = useRounds(market?.tableId, roundNumbers);

  const roundMap = useMemo(() => {
    const m = new Map<number, RoundData>();
    for (const r of rounds ?? []) m.set(r.roundNumber, r);
    return m;
  }, [rounds]);

  if (roundNumbers.length === 0) {
    return (
      <div className="rounded-lg border p-4 text-center text-sm text-muted-foreground">
        No settled rounds yet
      </div>
    );
  }

  return (
    <div className="rounded-lg border overflow-hidden">
      <AnimatePresence initial={false} mode="popLayout">
        {roundNumbers.map((num) => {
          const round = roundMap.get(num);
          return (
            <motion.div
              key={`${marketId}-${num}`}
              layout
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: ROW_HEIGHT }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.3, ease: "easeInOut" }}
              className="overflow-hidden border-b last:border-b-0"
            >
              {round && round.status === ROUND_SETTLED ? (
                <HistoryRow round={round} />
              ) : round && round.status === ROUND_CANCELLED ? (
                <CancelledRow roundNumber={num} />
              ) : (
                <SkeletonRow roundNumber={num} />
              )}
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}

function ResultIcon({ result }: { result: number | null }) {
  if (result === RESULT_UP)
    return <ArrowUp className="h-3.5 w-3.5 text-up" />;
  if (result === RESULT_DOWN)
    return <ArrowDown className="h-3.5 w-3.5 text-down" />;
  return <Minus className="h-3.5 w-3.5 text-muted-foreground" />;
}

function HistoryRow({ round }: { round: RoundData }) {
  const open = parsePrice(round.openPrice, round.openPriceExpo);
  const close = parsePrice(round.closePrice, round.closePriceExpo);
  const diff = open != null && close != null ? close - open : null;
  const isUp = diff != null && diff > 0;
  const isDown = diff != null && diff < 0;
  const precision = open != null && open > 100 ? 2 : 4;

  const totalPool = round.upAmount + round.downAmount;
  const totalBets = round.upCount + round.downCount;

  // Winner info
  const winnerCount =
    round.result === RESULT_UP
      ? round.upCount
      : round.result === RESULT_DOWN
        ? round.downCount
        : totalBets;
  const winnerAmount =
    round.result === RESULT_UP
      ? round.upAmount
      : round.result === RESULT_DOWN
        ? round.downAmount
        : totalPool;
  const payout = winnerAmount > 0 ? totalPool / winnerAmount : 0;

  return (
    <div className="flex items-center justify-between px-3 text-xs" style={{ height: ROW_HEIGHT }}>
      {/* Left: round number + result arrow + diff */}
      <div className="flex items-center gap-2">
        <span className="w-8 text-muted-foreground tabular-nums">
          #{round.roundNumber}
        </span>
        <ResultIcon result={round.result} />
        <span
          className={cn(
            "font-mono font-semibold",
            isUp ? "text-up" : isDown ? "text-down" : "text-muted-foreground",
          )}
        >
          {diff != null
            ? `${diff >= 0 ? "+" : ""}${diff.toFixed(precision)}`
            : "--"}
        </span>
      </div>

      {/* Right: payout + winners + pool */}
      <div className="flex items-center gap-2.5 text-muted-foreground">
        {payout > 0 && round.result !== RESULT_DRAW && (
          <span
            className={cn(
              "font-mono font-medium",
              round.result === RESULT_UP ? "text-up" : "text-down",
            )}
          >
            {payout.toFixed(2)}x
          </span>
        )}
        <span className="flex items-center gap-0.5" title="Winners / Total bets">
          <Users className="h-3 w-3" />
          <span className="tabular-nums">
            {winnerCount}/{totalBets}
          </span>
        </span>
        <span className="font-mono tabular-nums w-16 text-right">
          {mistToSui(totalPool)} SUI
        </span>
      </div>
    </div>
  );
}

function SkeletonRow({ roundNumber }: { roundNumber: number }) {
  return (
    <div className="flex items-center justify-between px-3 text-xs text-muted-foreground" style={{ height: ROW_HEIGHT }}>
      <div className="flex items-center gap-2">
        <span className="w-8 tabular-nums">#{roundNumber}</span>
        <Loader2 className="h-3 w-3 animate-spin" />
      </div>
      <div className="flex items-center gap-2.5">
        <div className="h-3 w-8 animate-pulse rounded bg-muted" />
        <div className="h-3 w-10 animate-pulse rounded bg-muted" />
        <div className="h-3 w-16 animate-pulse rounded bg-muted" />
      </div>
    </div>
  );
}

function CancelledRow({ roundNumber }: { roundNumber: number }) {
  return (
    <div className="flex items-center justify-between px-3 text-xs text-muted-foreground opacity-40" style={{ height: ROW_HEIGHT }}>
      <div className="flex items-center gap-2">
        <span className="w-8 tabular-nums">#{roundNumber}</span>
        <Minus className="h-3.5 w-3.5" />
      </div>
      <span>Cancelled</span>
    </div>
  );
}
