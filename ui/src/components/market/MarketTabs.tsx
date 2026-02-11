import { useStore } from "@nanostores/react";
import { $selectedMarketId } from "../../stores/app";
import { MARKETS } from "../../lib/constants";
import { cn } from "../../lib/utils";

const COIN_COLORS: Record<string, string> = {
  SUI: "bg-[#4DA2FF]",
  BTC: "bg-[#F7931A]",
  ETH: "bg-[#627EEA]",
  WAL: "bg-[#36B5A0]",
};

function CoinIcon({ asset }: { asset: string }) {
  const coin = asset.split("/")[0];
  return (
    <span
      className={cn(
        "inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold text-white",
        COIN_COLORS[coin] ?? "bg-muted-foreground",
      )}
    >
      {coin[0]}
    </span>
  );
}

export function MarketTabs() {
  const selected = useStore($selectedMarketId);

  return (
    <div className="flex gap-1 border-b-2 border-border overflow-x-auto overflow-y-hidden">
      {MARKETS.map((m) => (
        <button
          key={m.marketId}
          onClick={() => $selectedMarketId.set(m.marketId)}
          className={cn(
            "shrink-0 flex items-center gap-1.5 rounded-t px-4 py-2 text-sm font-medium transition-colors -mb-[2px] border-b-2",
            selected === m.marketId
              ? "border-primary bg-primary/10 text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50",
          )}
        >
          <CoinIcon asset={m.asset} />
          {m.label}
        </button>
      ))}
    </div>
  );
}
