import { useStore } from "@nanostores/react";
import { $selectedMarketId } from "../../stores/app";
import { MarketTabs } from "./MarketTabs";
import { LiveRound } from "./LiveRound";
import { BettingPanel } from "./BettingPanel";
import { RoundHistory } from "./RoundHistory";

export function MarketPanel() {
  const marketId = useStore($selectedMarketId);

  return (
    <div className="space-y-4">
      <MarketTabs />
      <LiveRound marketId={marketId} />
      <BettingPanel marketId={marketId} />
      <RoundHistory marketId={marketId} />
    </div>
  );
}
