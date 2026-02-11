import { useState } from "react";
import {
  useCurrentAccount,
  useCurrentClient,
  useDAppKit,
} from "@mysten/dapp-kit-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMarket } from "../../hooks/useMarket";
import { useRound } from "../../hooks/useRound";
import { buildPlaceBet } from "../../tx/placeBet";
import { suiToMist, mistToSui } from "../../lib/format";
import { DIRECTION_UP, DIRECTION_DOWN, ROUND_UPCOMING, MARKET_PAUSED } from "../../lib/types";
import { ArrowUp, ArrowDown, Loader2, Check, Users } from "lucide-react";
import { cn } from "../../lib/utils";

const PERCENT_PRESETS = [10, 25, 50, 100];

function calcOdds(upAmount: number, downAmount: number) {
  const total = upAmount + downAmount;
  if (total === 0) return { up: 0, down: 0 };
  return {
    up: upAmount > 0 ? total / upAmount : 0,
    down: downAmount > 0 ? total / downAmount : 0,
  };
}

export function BettingPanel({ marketId }: { marketId: string }) {
  const account = useCurrentAccount();
  const client = useCurrentClient();
  const dAppKit = useDAppKit();
  const { data: market } = useMarket(marketId);
  const { data: upcomingRound, isPlaceholderData } = useRound(
    market?.tableId,
    market?.upcomingRound ?? 0,
  );
  const queryClient = useQueryClient();

  const { data: balanceMist } = useQuery({
    queryKey: ["suiBalance", account?.address],
    queryFn: async () => {
      if (!account) return 0;
      const resp = await client.core.getBalance({ owner: account.address });
      return Number(resp.balance.coinBalance);
    },
    enabled: !!account,
    refetchInterval: 10_000,
  });

  const [amount, setAmount] = useState("1");
  const [error, setError] = useState<string | null>(null);
  const [txPending, setTxPending] = useState(false);
  const [betSuccess, setBetSuccess] = useState(false);

  const isSettling =
    isPlaceholderData ||
    (upcomingRound != null && upcomingRound.status !== ROUND_UPCOMING);

  const cardClass = "rounded-lg border bg-card shadow-sm p-4 space-y-4";

  if (!account) {
    return (
      <div className={cn(cardClass, "text-center text-sm text-muted-foreground")}>
        Connect wallet to place bets
      </div>
    );
  }

  if (market?.status === MARKET_PAUSED) {
    return (
      <div className={cn(cardClass, "text-center text-sm text-muted-foreground")}>
        Market is paused — betting disabled
      </div>
    );
  }

  // Skeleton
  if (!upcomingRound && market && market.upcomingRound > 0) {
    return (
      <div className={cn(cardClass, "opacity-50")}>
        <div className="flex items-center gap-2">
          <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
          <span className="text-sm font-medium">NEXT &middot; #{market.upcomingRound}</span>
        </div>
        <div className="space-y-2">
          <div className="flex gap-2">
            {PERCENT_PRESETS.map((p) => (
              <div key={p} className="flex-1 h-9 animate-pulse rounded bg-muted border" />
            ))}
          </div>
          <div className="h-10 animate-pulse rounded bg-muted border" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="h-12 animate-pulse rounded bg-muted" />
          <div className="h-12 animate-pulse rounded bg-muted" />
        </div>
      </div>
    );
  }

  if (!upcomingRound) {
    return (
      <div className={cn(cardClass, "text-center text-sm text-muted-foreground")}>
        <Loader2 className="mx-auto mb-2 h-4 w-4 animate-spin" />
        Waiting for next round...
      </div>
    );
  }

  const odds = calcOdds(upcomingRound.upAmount, upcomingRound.downAmount);
  const totalPool = upcomingRound.upAmount + upcomingRound.downAmount;

  const handleBet = async (direction: number) => {
    if (isSettling) return;
    setError(null);
    setBetSuccess(false);
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
      setBetSuccess(true);
      setTimeout(() => setBetSuccess(false), 3000);
      queryClient.invalidateQueries({ queryKey: ["tickets"] });
      queryClient.invalidateQueries({ queryKey: ["round"] });
      queryClient.invalidateQueries({ queryKey: ["market"] });
      queryClient.invalidateQueries({ queryKey: ["suiBalance"] });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Transaction failed");
    } finally {
      setTxPending(false);
    }
  };

  const betDisabled = txPending || isSettling;

  return (
    <div className={cn(cardClass, "transition-opacity duration-300", isSettling && "opacity-50")}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">
          {isSettling ? (
            <>
              <Loader2 className="mr-1 inline h-3 w-3 animate-spin" />
              Settling...
            </>
          ) : (
            <>NEXT &middot; #{upcomingRound.roundNumber}</>
          )}
        </span>
      </div>

      {/* Pool bar */}
      <div className="space-y-1.5">
        <div className="flex h-2 w-full overflow-hidden rounded-full bg-muted">
          {totalPool > 0 ? (
            <>
              <div
                className="h-full bg-up transition-all duration-500 ease-out"
                style={{ width: `${(upcomingRound.upAmount / totalPool) * 100}%` }}
              />
              <div
                className="h-full bg-down transition-all duration-500 ease-out"
                style={{ width: `${(upcomingRound.downAmount / totalPool) * 100}%` }}
              />
            </>
          ) : (
            <>
              <div className="h-full w-1/2 bg-up/30" />
              <div className="h-full w-1/2 bg-down/30" />
            </>
          )}
        </div>
        <div className="flex justify-between items-center text-xs leading-none">
          <span className="flex items-center gap-1.5">
            <span className="text-up font-medium">UP</span>
            <span className="font-mono text-up">{mistToSui(upcomingRound.upAmount)} SUI</span>
            <span className="flex items-center gap-0.5 text-muted-foreground">
              <Users className="h-3 w-3" />
              {upcomingRound.upCount}
            </span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="flex items-center gap-0.5 text-muted-foreground">
              {upcomingRound.downCount}
              <Users className="h-3 w-3" />
            </span>
            <span className="font-mono text-down">{mistToSui(upcomingRound.downAmount)} SUI</span>
            <span className="text-down font-medium">DOWN</span>
          </span>
        </div>
      </div>

      {/* Amount input + percent presets */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <input
            type="text"
            inputMode="decimal"
            value={amount}
            disabled={isSettling}
            onChange={(e) => setAmount(e.target.value)}
            className="flex-1 rounded border bg-transparent px-3 py-2 text-sm font-mono tabular-nums outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
          />
          <span className="text-sm text-muted-foreground">SUI</span>
        </div>
        <div className="flex gap-2">
          {PERCENT_PRESETS.map((pct) => (
            <button
              key={pct}
              onClick={() => {
                const bal = balanceMist ?? 0;
                if (bal <= 0) return;
                // Reserve 0.05 SUI for gas when using 100%
                const reserve = pct === 100 ? 50_000_000 : 0;
                const raw = Math.max(0, Math.floor((bal * pct) / 100) - reserve);
                if (raw <= 0) return;
                const sui = raw / 1_000_000_000;
                setAmount(sui >= 1 ? sui.toFixed(2) : sui.toFixed(4).replace(/0+$/, "").replace(/\.$/, ""));
              }}
              disabled={isSettling}
              className="flex-1 rounded border py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground hover:bg-secondary disabled:opacity-50"
            >
              {pct}%
            </button>
          ))}
        </div>
      </div>

      {/* UP / DOWN buttons */}
      <div className="grid grid-cols-2 gap-3">
        <button
          disabled={betDisabled}
          onClick={() => handleBet(DIRECTION_UP)}
          className="flex flex-col items-center justify-center gap-0.5 rounded-lg border-2 border-up bg-up/10 py-3 text-sm font-semibold text-up transition-colors hover:bg-up/20 disabled:opacity-40"
        >
          <span className="flex items-center gap-1">
            {txPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUp className="h-4 w-4" />}
            UP
          </span>
          {odds.up > 0 && (
            <span className="text-xs font-normal opacity-70">{odds.up.toFixed(2)}x</span>
          )}
        </button>
        <button
          disabled={betDisabled}
          onClick={() => handleBet(DIRECTION_DOWN)}
          className="flex flex-col items-center justify-center gap-0.5 rounded-lg border-2 border-down bg-down/10 py-3 text-sm font-semibold text-down transition-colors hover:bg-down/20 disabled:opacity-40"
        >
          <span className="flex items-center gap-1">
            {txPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowDown className="h-4 w-4" />}
            DOWN
          </span>
          {odds.down > 0 && (
            <span className="text-xs font-normal opacity-70">{odds.down.toFixed(2)}x</span>
          )}
        </button>
      </div>

      {/* Testnet warning */}
      <p className="text-center text-xs font-medium text-amber-500">
        Testnet only — tokens have no real value
      </p>

      {/* Bet success toast */}
      {betSuccess && (
        <div className="flex items-center gap-2 rounded border border-up/30 bg-up/10 px-3 py-2 text-xs text-up">
          <Check className="h-3 w-3" />
          Bet placed successfully!
        </div>
      )}

      {error && (
        <p className="text-xs text-destructive-foreground">{error}</p>
      )}
    </div>
  );
}
