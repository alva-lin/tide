import { useMarket } from "../../hooks/useMarket";
import { useRounds } from "../../hooks/useRound";
import { RoundHistoryItem } from "./RoundHistoryItem";
import { ROUND_SETTLED } from "../../lib/types";

export function RoundHistory({ marketId }: { marketId: string }) {
  const { data: market } = useMarket(marketId);

  const roundCount = market?.roundCount ?? 0;
  const start = Math.max(1, roundCount - 9);
  const roundNumbers: number[] = [];
  for (let i = roundCount; i >= start; i--) {
    roundNumbers.push(i);
  }

  const { data: rounds } = useRounds(market?.tableId, roundNumbers);

  const settled = (rounds ?? []).filter((r) => r.status === ROUND_SETTLED);

  if (settled.length === 0) {
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
      <div className="px-4">
        {settled.map((r) => (
          <RoundHistoryItem key={r.roundNumber} round={r} />
        ))}
      </div>
    </div>
  );
}
