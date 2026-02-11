import { useMemo } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useMarket } from "../../hooks/useMarket";
import { useRounds } from "../../hooks/useRound";
import { RoundHistoryItem } from "./RoundHistoryItem";
import { ROUND_SETTLED } from "../../lib/types";
import type { RoundData } from "../../lib/types";
import { Loader2 } from "lucide-react";

const HISTORY_SIZE = 10;

export function RoundHistory({ marketId }: { marketId: string }) {
  const { data: market } = useMarket(marketId);

  const currentRound = market?.currentRound ?? 0;
  // Fixed-length: always show exactly HISTORY_SIZE slots, latest first
  const roundNumbers = useMemo(() => {
    if (currentRound <= 1) return [];
    const start = Math.max(1, currentRound - HISTORY_SIZE);
    const nums: number[] = [];
    for (let i = currentRound - 1; i >= start; i--) nums.push(i);
    return nums;
  }, [currentRound]);

  const { data: rounds } = useRounds(market?.tableId, roundNumbers);

  const roundMap = useMemo(() => {
    const m = new Map<number, RoundData>();
    for (const r of rounds ?? []) m.set(r.roundNumber, r);
    return m;
  }, [rounds]);

  if (roundNumbers.length === 0) {
    return (
      <div className="border p-4 text-center text-sm text-muted-foreground">
        No settled rounds yet
      </div>
    );
  }

  return (
    <div className="border">
      <div className="border-b px-4 py-2">
        <span className="text-sm font-medium">History</span>
      </div>
      <div className="px-4 overflow-hidden">
        <AnimatePresence initial={false}>
          {roundNumbers.map((num) => {
            const round = roundMap.get(num);
            return (
              <motion.div
                key={num}
                layout
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.25, ease: "easeInOut" }}
              >
                {round && round.status === ROUND_SETTLED ? (
                  <RoundHistoryItem round={round} />
                ) : (
                  <RoundHistoryItemSkeleton roundNumber={num} />
                )}
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}

function RoundHistoryItemSkeleton({ roundNumber }: { roundNumber: number }) {
  return (
    <div className="flex items-center justify-between border-b py-3 last:border-b-0 text-muted-foreground">
      <div className="flex items-center gap-2">
        <span className="text-xs">#{roundNumber}</span>
        <Loader2 className="h-3 w-3 animate-spin" />
      </div>
      <div className="flex gap-4">
        <div className="h-3 w-16 animate-pulse rounded bg-muted" />
        <div className="h-3 w-16 animate-pulse rounded bg-muted" />
        <div className="h-3 w-12 animate-pulse rounded bg-muted" />
      </div>
    </div>
  );
}
