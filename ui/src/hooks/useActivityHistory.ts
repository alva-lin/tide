import { useCurrentAccount } from "@mysten/dapp-kit-react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { graphqlClient } from "../lib/rpc";
import { EVENT_BET_PLACED, EVENT_REDEEMED } from "../lib/constants";
import type { ActivityEvent, ActivityBet, ActivityRedeem } from "../lib/types";

const EVENTS_QUERY = `
  query GetEvents($type: String!, $sender: SuiAddress!, $last: Int, $before: String) {
    events(
      filter: { type: $type, sender: $sender }
      last: $last
      before: $before
    ) {
      pageInfo {
        hasPreviousPage
        startCursor
      }
      nodes {
        timestamp
        contents { json }
      }
    }
  }
`;

interface EventNode {
  timestamp: string | null;
  contents: { json: Record<string, unknown> } | null;
}

interface EventsResult {
  events: {
    pageInfo: {
      hasPreviousPage: boolean;
      startCursor: string | null;
    };
    nodes: EventNode[];
  };
}

function parseBetNode(node: EventNode): ActivityBet | null {
  const j = node.contents?.json;
  if (!j) return null;
  return {
    type: "bet",
    marketId: String(j.market_id),
    roundNumber: Number(j.round_number),
    direction: Number(j.direction),
    amount: Number(j.amount),
    timestamp: node.timestamp ? new Date(node.timestamp).getTime() : 0,
  };
}

function parseRedeemNode(node: EventNode): ActivityRedeem | null {
  const j = node.contents?.json;
  if (!j) return null;
  return {
    type: "redeem",
    marketId: String(j.market_id),
    roundNumber: Number(j.round_number),
    outcome: Number(j.outcome),
    betAmount: Number(j.bet_amount),
    payout: Number(j.payout),
    timestamp: node.timestamp ? new Date(node.timestamp).getTime() : 0,
  };
}

// "done" = this stream is exhausted; cursor string = fetch older with `before`
interface PageCursors {
  betCursor: string | "done";
  redeemCursor: string | "done";
}

export interface ActivityPage {
  events: ActivityEvent[];
  nextCursors: PageCursors | undefined;
}

const PAGE_SIZE = 10;
const MAX_REDEEM_CATCHUP = 3; // extra redeem pages to align with bet stream

interface StreamResult {
  nodes: EventNode[];
  nextCursor: string | "done";
}

async function fetchStream(
  type: string,
  sender: string,
  cursor: string | "done" | undefined,
): Promise<StreamResult> {
  // "done" means this stream has no more pages
  if (cursor === "done") {
    return { nodes: [], nextCursor: "done" as const };
  }

  const result = await graphqlClient.query<EventsResult>({
    query: EVENTS_QUERY,
    variables: {
      type,
      sender,
      last: PAGE_SIZE,
      before: cursor ?? null,
    },
  });

  const nodes = result.data?.events.nodes ?? [];
  const pageInfo = result.data?.events.pageInfo;
  const hasMore = pageInfo?.hasPreviousPage ?? false;
  const nextCursor = hasMore ? (pageInfo?.startCursor ?? "done") : "done";

  return { nodes, nextCursor };
}

function parseBetNodes(nodes: EventNode[]): ActivityBet[] {
  const out: ActivityBet[] = [];
  for (const n of nodes) {
    const p = parseBetNode(n);
    if (p) out.push(p);
  }
  return out;
}

function parseRedeemNodes(nodes: EventNode[]): ActivityRedeem[] {
  const out: ActivityRedeem[] = [];
  for (const n of nodes) {
    const p = parseRedeemNode(n);
    if (p) out.push(p);
  }
  return out;
}

export function useActivityHistory() {
  const account = useCurrentAccount();

  return useInfiniteQuery({
    queryKey: ["activity", account?.address],
    queryFn: async ({ pageParam }): Promise<ActivityPage> => {
      if (!account) return { events: [], nextCursors: undefined };

      const cursors = pageParam as PageCursors | undefined;

      // Step 1: Fetch both streams in parallel
      const [betsResult, redeemsResult] = await Promise.all([
        fetchStream(
          EVENT_BET_PLACED,
          account.address,
          cursors?.betCursor,
        ),
        fetchStream(
          EVENT_REDEEMED,
          account.address,
          cursors?.redeemCursor,
        ),
      ]);

      const betEvents = parseBetNodes(betsResult.nodes);
      const redeemEvents = parseRedeemNodes(redeemsResult.nodes);
      let currentRedeemCursor = redeemsResult.nextCursor;

      // Step 2: Catch-up — if we have bet-only rounds and the redeem stream
      // isn't exhausted, fetch more redeem pages so both streams align.
      // This prevents rounds showing as "Pending" when the redeem event
      // exists but is on a later page of the redeem stream.
      const redeemRoundSet = new Set(redeemEvents.map((e) => e.roundNumber));
      let unmatched = betEvents.filter(
        (e) => !redeemRoundSet.has(e.roundNumber),
      );

      let catchup = 0;
      while (
        unmatched.length > 0 &&
        currentRedeemCursor !== "done" &&
        catchup < MAX_REDEEM_CATCHUP
      ) {
        const extra = await fetchStream(
          EVENT_REDEEMED,
          account.address,
          currentRedeemCursor,
        );
        const extraRedeems = parseRedeemNodes(extra.nodes);
        redeemEvents.push(...extraRedeems);
        currentRedeemCursor = extra.nextCursor;

        for (const r of extraRedeems) redeemRoundSet.add(r.roundNumber);
        unmatched = unmatched.filter(
          (e) => !redeemRoundSet.has(e.roundNumber),
        );
        catchup++;
      }

      // Step 3: Combine and sort
      const events: ActivityEvent[] = [
        ...betEvents,
        ...redeemEvents,
      ].sort((a, b) => b.timestamp - a.timestamp);

      const allDone =
        betsResult.nextCursor === "done" && currentRedeemCursor === "done";

      return {
        events,
        nextCursors: allDone
          ? undefined
          : {
              betCursor: betsResult.nextCursor,
              redeemCursor: currentRedeemCursor,
            },
      };
    },
    initialPageParam: undefined as PageCursors | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursors,
    enabled: !!account,
    staleTime: Infinity,
  });
}
