import {
  useCurrentAccount,
  useDAppKit,
} from "@mysten/dapp-kit-react";
import { useQueryClient } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { useTickets } from "../../hooks/useTickets";
import { useRounds } from "../../hooks/useRound";
import { useMarket } from "../../hooks/useMarket";
import { classifyTicket } from "../../hooks/useRedeemableTickets";
import { buildRedeemAll } from "../../tx/redeemAll";
import { TicketRow } from "./TicketRow";
import type { TicketData, RoundData } from "../../lib/types";
import { Loader2 } from "lucide-react";

function TicketListWithRounds({
  tickets,
  tableId,
  filter,
}: {
  tickets: TicketData[];
  tableId: string | undefined;
  filter: "redeemable" | "inProgress" | "lost";
}) {
  const roundNumbers = useMemo(
    () => [...new Set(tickets.map((t) => t.roundNumber))],
    [tickets],
  );
  const { data: rounds } = useRounds(tableId, roundNumbers);

  const roundMap = useMemo(() => {
    const m = new Map<number, RoundData>();
    for (const r of rounds ?? []) m.set(r.roundNumber, r);
    return m;
  }, [rounds]);

  const filtered = tickets.filter(
    (t) => classifyTicket(t, roundMap.get(t.roundNumber) ?? null) === filter,
  );

  if (filtered.length === 0) return null;

  return (
    <>
      {filtered.map((t) => (
        <TicketRow
          key={t.objectId}
          ticket={t}
          round={roundMap.get(t.roundNumber) ?? null}
        />
      ))}
    </>
  );
}

export function MyRecords() {
  const account = useCurrentAccount();
  const { data: tickets, isPending } = useTickets();
  const queryClient = useQueryClient();
  const dAppKit = useDAppKit();
  const [error, setError] = useState<string | null>(null);
  const [txPending, setTxPending] = useState(false);

  const byMarket = useMemo(() => {
    const map = new Map<string, TicketData[]>();
    for (const t of tickets ?? []) {
      const arr = map.get(t.marketId) ?? [];
      arr.push(t);
      map.set(t.marketId, arr);
    }
    return map;
  }, [tickets]);

  if (!account) {
    return (
      <div className="border p-8 text-center text-sm text-muted-foreground">
        Connect wallet to view your records
      </div>
    );
  }

  if (isPending) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  if (!tickets || tickets.length === 0) {
    return (
      <div className="border p-8 text-center text-sm text-muted-foreground">
        No tickets yet. Place a bet to get started.
      </div>
    );
  }

  const handleRedeemAll = async () => {
    setError(null);
    const toRedeem = (tickets ?? []).map((t) => ({
      marketId: t.marketId,
      objectId: t.objectId,
    }));
    if (toRedeem.length === 0) return;

    setTxPending(true);
    try {
      const tx = buildRedeemAll(toRedeem);
      const result = await dAppKit.signAndExecuteTransaction({ transaction: tx });
      if (result.FailedTransaction) {
        throw new Error(
          result.FailedTransaction.status.error?.message ?? "Redeem failed",
        );
      }
      queryClient.invalidateQueries({ queryKey: ["tickets"] });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Redeem failed");
    } finally {
      setTxPending(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium">My Tickets ({tickets.length})</h2>
        <button
          onClick={handleRedeemAll}
          disabled={txPending}
          className="flex items-center gap-1 border px-3 py-1.5 text-sm font-medium transition-colors hover:bg-foreground hover:text-background disabled:opacity-50"
        >
          {txPending && <Loader2 className="h-3 w-3 animate-spin" />}
          Redeem All
        </button>
      </div>

      {error && (
        <p className="text-xs text-destructive-foreground">{error}</p>
      )}

      <Section title="Redeemable">
        {[...byMarket.entries()].map(([marketId, mTickets]) => (
          <MarketTicketSection
            key={marketId}
            marketId={marketId}
            tickets={mTickets}
            filter="redeemable"
          />
        ))}
      </Section>

      <Section title="In Progress">
        {[...byMarket.entries()].map(([marketId, mTickets]) => (
          <MarketTicketSection
            key={marketId}
            marketId={marketId}
            tickets={mTickets}
            filter="inProgress"
          />
        ))}
      </Section>

      <Section title="Lost">
        {[...byMarket.entries()].map(([marketId, mTickets]) => (
          <MarketTicketSection
            key={marketId}
            marketId={marketId}
            tickets={mTickets}
            filter="lost"
          />
        ))}
      </Section>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border">
      <div className="border-b px-4 py-2">
        <span className="text-sm font-medium">{title}</span>
      </div>
      <div className="px-4">{children}</div>
    </div>
  );
}

function MarketTicketSection({
  marketId,
  tickets,
  filter,
}: {
  marketId: string;
  tickets: TicketData[];
  filter: "redeemable" | "inProgress" | "lost";
}) {
  const { data: market } = useMarket(marketId);
  return (
    <TicketListWithRounds
      tickets={tickets}
      tableId={market?.tableId}
      filter={filter}
    />
  );
}
