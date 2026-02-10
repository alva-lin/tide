import type { RoundData } from "../../lib/types";
import { RESULT_UP, RESULT_DOWN, RESULT_DRAW } from "../../lib/types";
import { formatPrice, mistToSui } from "../../lib/format";
import { ArrowUp, ArrowDown, Minus } from "lucide-react";
import { cn } from "../../lib/utils";

function resultIcon(result: number | null) {
  if (result === RESULT_UP) return <ArrowUp className="h-4 w-4 text-up" />;
  if (result === RESULT_DOWN)
    return <ArrowDown className="h-4 w-4 text-down" />;
  if (result === RESULT_DRAW) return <Minus className="h-4 w-4" />;
  return null;
}

function resultLabel(result: number | null) {
  if (result === RESULT_UP) return "UP";
  if (result === RESULT_DOWN) return "DOWN";
  if (result === RESULT_DRAW) return "DRAW";
  return "--";
}

export function RoundHistoryItem({ round }: { round: RoundData }) {
  return (
    <div className="flex items-center justify-between border-b py-3 last:border-b-0">
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">
          #{round.roundNumber}
        </span>
        {resultIcon(round.result)}
        <span
          className={cn(
            "text-sm font-medium",
            round.result === RESULT_UP && "text-up",
            round.result === RESULT_DOWN && "text-down",
          )}
        >
          {resultLabel(round.result)}
        </span>
      </div>

      <div className="flex gap-4 text-right">
        <div>
          <p className="text-xs text-muted-foreground">Open</p>
          <p className="font-mono text-xs">
            {formatPrice(round.openPrice, round.openPriceExpo)}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Close</p>
          <p className="font-mono text-xs">
            {formatPrice(round.closePrice, round.closePriceExpo)}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Pool</p>
          <p className="font-mono text-xs">
            {mistToSui(round.upAmount + round.downAmount)}
          </p>
        </div>
      </div>
    </div>
  );
}
