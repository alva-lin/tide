import { useState } from "react";
import { HelpCircle, ChevronDown } from "lucide-react";
import { cn } from "../../lib/utils";

interface Section {
  title: string;
  items: string[];
}

const SECTIONS: Section[] = [
  {
    title: "How to Play",
    items: [
      "Each market tracks a crypto price feed (e.g. SUI/USD) in fixed-duration rounds.",
      "During the NEXT round, predict whether the closing price will be higher (UP) or lower (DOWN) than the opening price.",
      "Once the round goes LIVE, bets are locked. When time runs out, the round settles based on the Pyth oracle price.",
      "If your prediction is correct, claim your winnings from the My Bets panel. If not, your bet goes to the winning pool.",
    ],
  },
  {
    title: "Payouts & Odds",
    items: [
      "Tide uses a parimutuel pool model — all bets are pooled together, and winners split the pot proportionally.",
      "Payout = Your Bet × (Total Pool ÷ Winning Pool). A 2% protocol fee is deducted from the pool before distribution.",
      "Displayed odds update in real-time as new bets come in. Final odds are determined at round lock.",
      "In a DRAW (close price = open price), all participants are considered winners and share the pool.",
    ],
  },
  {
    title: "FAQ",
    items: [
      "Price source — Settlement prices come from Pyth Network's decentralized oracle. The live price shown may differ slightly from exchange prices due to oracle aggregation.",
      "Redeeming — After a round settles, click \"Redeem\" in My Bets to claim winnings (or refunds for cancelled/draw rounds). Losing tickets are also cleaned up during redemption.",
      "Cancelled rounds — A round may be cancelled if the oracle price is unavailable at settlement. All bets are refunded in full.",
      "Market paused — The operator may pause a market for maintenance. No new rounds are created while paused. Existing bets are unaffected.",
      "Round duration — Each market has a fixed round interval (e.g. 5 minutes). The countdown shows time until the current round settles.",
    ],
  },
  {
    title: "Risks & Disclaimer",
    items: [
      "Prediction markets involve risk of total loss of your bet. Only bet what you can afford to lose.",
    ],
  },
];

export function HowToPlay() {
  const [openIdx, setOpenIdx] = useState<number | null>(null);

  const toggle = (idx: number) =>
    setOpenIdx((prev) => (prev === idx ? null : idx));

  return (
    <div className="rounded-lg border border-border/30 overflow-hidden divide-y divide-border/30">
      {SECTIONS.map((section, idx) => (
        <div key={section.title}>
          <button
            onClick={() => toggle(idx)}
            className="flex w-full items-center justify-between px-3 py-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <span className="flex items-center gap-1.5">
              {idx === 0 && <HelpCircle className="h-3.5 w-3.5" />}
              {section.title}
            </span>
            <ChevronDown
              className={cn(
                "h-3.5 w-3.5 transition-transform",
                openIdx === idx && "rotate-180",
              )}
            />
          </button>
          {openIdx === idx && (
            <div className="border-t border-border/30 px-3 py-2 space-y-1.5">
              {section.items.map((item, i) => (
                <p
                  key={i}
                  className="text-xs text-muted-foreground leading-relaxed"
                >
                  {item}
                </p>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
