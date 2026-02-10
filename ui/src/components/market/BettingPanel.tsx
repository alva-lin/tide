import { useState } from "react";
import {
  useCurrentAccount,
  useDAppKit,
} from "@mysten/dapp-kit-react";
import { useQueryClient } from "@tanstack/react-query";
import { useMarket } from "../../hooks/useMarket";
import { useRound } from "../../hooks/useRound";
import { useCountdown } from "../../hooks/useCountdown";
import { buildPlaceBet } from "../../tx/placeBet";
import { suiToMist, formatCountdown, mistToSui } from "../../lib/format";
import { DIRECTION_UP, DIRECTION_DOWN, ROUND_UPCOMING } from "../../lib/types";
import { ArrowUp, ArrowDown, Loader2 } from "lucide-react";
import { cn } from "../../lib/utils";

const PRESETS = ["0.1", "0.5", "1", "5"];

export function BettingPanel({ marketId }: { marketId: string }) {
  const account = useCurrentAccount();
  const dAppKit = useDAppKit();
  const { data: market } = useMarket(marketId);
  const { data: upcomingRound } = useRound(
    market?.tableId,
    market?.upcomingRound ?? 0,
  );
  const queryClient = useQueryClient();

  const [amount, setAmount] = useState("0.5");
  const [error, setError] = useState<string | null>(null);
  const [txPending, setTxPending] = useState(false);

  const startTimeMs = upcomingRound?.startTimeMs ?? 0;
  const remaining = useCountdown(startTimeMs);

  if (!account) {
    return (
      <div className="border p-6 text-center text-sm text-muted-foreground">
        Connect wallet to place bets
      </div>
    );
  }

  if (!upcomingRound || upcomingRound.status !== ROUND_UPCOMING) {
    return (
      <div className="border p-6 text-center text-sm text-muted-foreground">
        No upcoming round available
      </div>
    );
  }

  const handleBet = async (direction: number) => {
    setError(null);
    const mist = suiToMist(amount);
    if (mist <= 0) {
      setError("Invalid amount");
      return;
    }

    setTxPending(true);
    try {
      const tx = buildPlaceBet(marketId, direction, mist);
      const result = await dAppKit.signAndExecuteTransaction({ transaction: tx });
      if (result.FailedTransaction) {
        throw new Error(
          result.FailedTransaction.status.error?.message ?? "Transaction failed",
        );
      }
      queryClient.invalidateQueries({ queryKey: ["tickets"] });
      queryClient.invalidateQueries({ queryKey: ["round"] });
      queryClient.invalidateQueries({ queryKey: ["market"] });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Transaction failed");
    } finally {
      setTxPending(false);
    }
  };

  return (
    <div className="border p-4 space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">
          NEXT &middot; Round #{upcomingRound.roundNumber}
        </span>
        <span className="font-mono text-sm tabular-nums text-muted-foreground">
          starts in {formatCountdown(remaining)}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 text-xs text-muted-foreground">
        <div className="border p-2 text-center">
          <span className="text-up">UP</span>{" "}
          {mistToSui(upcomingRound.upAmount)} SUI
        </div>
        <div className="border p-2 text-center">
          <span className="text-down">DOWN</span>{" "}
          {mistToSui(upcomingRound.downAmount)} SUI
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex gap-2">
          {PRESETS.map((p) => (
            <button
              key={p}
              onClick={() => setAmount(p)}
              className={cn(
                "flex-1 border py-1.5 text-sm transition-colors",
                amount === p
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {p}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min="0.01"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="flex-1 border bg-transparent px-3 py-2 text-sm font-mono tabular-nums outline-none focus:ring-1 focus:ring-foreground"
          />
          <span className="text-sm text-muted-foreground">SUI</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <button
          disabled={txPending}
          onClick={() => handleBet(DIRECTION_UP)}
          className="flex items-center justify-center gap-1 border border-up py-3 text-sm font-medium text-up transition-colors hover:bg-up hover:text-background disabled:opacity-50"
        >
          {txPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <ArrowUp className="h-4 w-4" />
          )}
          UP
        </button>
        <button
          disabled={txPending}
          onClick={() => handleBet(DIRECTION_DOWN)}
          className="flex items-center justify-center gap-1 border border-down py-3 text-sm font-medium text-down transition-colors hover:bg-down hover:text-background disabled:opacity-50"
        >
          {txPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <ArrowDown className="h-4 w-4" />
          )}
          DOWN
        </button>
      </div>

      {error && (
        <p className="text-xs text-destructive-foreground">{error}</p>
      )}
    </div>
  );
}
