import { useStore } from "@nanostores/react";
import { $selectedMarketId } from "../../stores/app";
import { MARKETS } from "../../lib/constants";
import { cn } from "../../lib/utils";

export function MarketTabs() {
  const selected = useStore($selectedMarketId);

  return (
    <div className="flex gap-0 border-b overflow-x-auto">
      {MARKETS.map((m) => (
        <button
          key={m.marketId}
          onClick={() => $selectedMarketId.set(m.marketId)}
          className={cn(
            "shrink-0 px-4 py-2 text-sm font-medium transition-colors border-b-2",
            selected === m.marketId
              ? "border-foreground text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          {m.label}
        </button>
      ))}
    </div>
  );
}
