import { useStore } from "@nanostores/react";
import { $selectedMarketId } from "../../stores/app";
import { MarketTabs } from "./MarketTabs";
import { PriceChart } from "./PriceChart";
import { LiveRound } from "./LiveRound";
import { BettingPanel } from "./BettingPanel";
import { RoundHistory } from "./RoundHistory";
import { MarketTickets } from "./MarketTickets";
import { ActivityHistory } from "./ActivityHistory";
import { HowToPlay } from "./HowToPlay";

export function MarketPanel() {
  const marketId = useStore($selectedMarketId);

  return (
    <div className="space-y-4">
      <MarketTabs />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <div className="space-y-4 lg:col-span-3">
          <LiveRound marketId={marketId} />
          <PriceChart marketId={marketId} />
          <RoundHistory marketId={marketId} />
        </div>
        <div className="space-y-4 lg:col-span-2">
          <BettingPanel marketId={marketId} />
          <MarketTickets marketId={marketId} />
          <ActivityHistory marketId={marketId} />
          <HowToPlay />
        </div>
      </div>
    </div>
  );
}
