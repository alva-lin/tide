import { execute, getMarketObject } from "./execute.js";
import { getRecentRounds, getMarketState, type RoundData, type MarketState } from "./market.js";
import { catchUpMarket } from "./catchUp.js";
import {
  buildCreateMarket,
  buildPauseMarket,
  buildResumeMarket,
  buildPlaceBet,
  buildRedeem,
  buildRedeemAll,
  buildUpdateConfig,
  buildWithdrawTreasury,
} from "./transactions/index.js";
import { PACKAGE_ID, MARKET_REGISTRY, resolveMarket, suiToMist, nextAlignedStartTime } from "./config.js";
import { client, address } from "./client.js";

const MARKET_NAMES = Object.keys(MARKET_REGISTRY).join(", ");

const HELP = `
Tide CLI — manual contract interaction tool

Usage: pnpm cli <command> [args...]

Markets: ${MARKET_NAMES}
  Use market name (e.g. SUI_1M) or raw object ID where <market> is expected.

Commands:
  create-market <feedId> <intervalMs> [minBetSui] [startTimeMs]
                          — minBet defaults to 0.1 SUI; startTime auto-calculated if omitted
  pause-market  <market>
  resume-market <market> [newStartTimeMs]
                          — startTime auto-calculated if omitted
  place-bet     <market> <direction:up|down> <amountSui>
  settle        <market>
  settle-all                    — settle all registered markets
  redeem        <market> <ticketId>
  redeem-all    <market>  — catch up + redeem all redeemable tickets
  update-config <feeBps> <settlerRewardBps> <priceToleranceMs>
  withdraw      <amountSui>
  info          [market]  — defaults to SUI_1M
  rounds        [market] [count]
  my-tickets    [market]
`.trim();

async function main() {
  const [cmd, ...args] = process.argv.slice(2);

  if (!cmd || cmd === "help" || cmd === "--help") {
    console.log(HELP);
    return;
  }

  switch (cmd) {
    case "create-market": {
      const [feedId, intervalMsStr, minBetStr, startTimeStr] = args;
      if (!feedId || !intervalMsStr) {
        console.error("Usage: create-market <feedId> <intervalMs> [minBetSui] [startTimeMs]");
        process.exit(1);
      }
      const intervalMs = Number(intervalMsStr);
      const minBet = minBetStr ? suiToMist(minBetStr) : suiToMist("0.1");
      const startTimeMs = startTimeStr ? Number(startTimeStr) : nextAlignedStartTime(intervalMs);
      console.log(`[create-market] startTime=${new Date(startTimeMs).toISOString()} interval=${intervalMs}ms minBet=${minBet} MIST`);
      const tx = buildCreateMarket({ pythFeedId: feedId, intervalMs, minBet, startTimeMs });
      await execute(tx);
      break;
    }

    case "pause-market": {
      const [market] = args;
      if (!market) { console.error("Usage: pause-market <market>"); process.exit(1); }
      await execute(buildPauseMarket(resolveMarket(market).marketId));
      break;
    }

    case "resume-market": {
      const [market, startTimeStr] = args;
      if (!market) { console.error("Usage: resume-market <market> [newStartTimeMs]"); process.exit(1); }
      const { marketId } = resolveMarket(market);
      // Read interval from on-chain state to auto-calculate start time
      let startTimeMs: number;
      if (startTimeStr) {
        startTimeMs = Number(startTimeStr);
      } else {
        const data = await getRecentRounds(marketId, 1);
        const intervalMs = data?.market.intervalMs ?? 300_000;
        startTimeMs = nextAlignedStartTime(intervalMs);
      }
      console.log(`[resume-market] startTime=${new Date(startTimeMs).toISOString()}`);
      await execute(buildResumeMarket(marketId, startTimeMs));
      break;
    }

    case "place-bet":
    case "bet": {
      const [market, dirStr, amountStr] = args;
      if (!market || !dirStr || !amountStr) {
        console.error("Usage: place-bet <market> <up|down> <amountSui>");
        process.exit(1);
      }
      const direction = dirStr.toLowerCase() === "up" ? 0 : dirStr.toLowerCase() === "down" ? 1 : Number(dirStr);
      await execute(buildPlaceBet(resolveMarket(market).marketId, direction, suiToMist(amountStr)));
      break;
    }

    case "settle": {
      const [market] = args;
      if (!market) { console.error("Usage: settle <market>"); process.exit(1); }
      const { marketId, feedId } = resolveMarket(market);
      if (!feedId) { console.error("Must use a named market or provide feedId"); process.exit(1); }
      await catchUpMarket(marketId, feedId);
      break;
    }

    case "settle-all": {
      for (const [name, { marketId, feedId }] of Object.entries(MARKET_REGISTRY)) {
        console.log(`\n[settle-all] ${name}`);
        try {
          await catchUpMarket(marketId, feedId);
        } catch (err) {
          console.error(`[settle-all] ${name} failed:`, (err as Error).message);
        }
      }
      break;
    }

    case "redeem": {
      const [market, ticketId] = args;
      if (!market || !ticketId) { console.error("Usage: redeem <market> <ticketId>"); process.exit(1); }
      await execute(buildRedeem(resolveMarket(market).marketId, ticketId));
      break;
    }

    case "redeem-all": {
      const [market] = args;
      if (!market) { console.error("Usage: redeem-all <market>"); process.exit(1); }
      const { marketId } = resolveMarket(market);
      await redeemAllTickets(marketId);
      break;
    }

    case "update-config": {
      const [feeBps, settlerRewardBps, toleranceMs] = args;
      if (!feeBps || !settlerRewardBps || !toleranceMs) {
        console.error("Usage: update-config <feeBps> <settlerRewardBps> <priceToleranceMs>");
        process.exit(1);
      }
      await execute(buildUpdateConfig({
        feeBps: Number(feeBps),
        settlerRewardBps: Number(settlerRewardBps),
        priceToleranceMs: Number(toleranceMs),
      }));
      break;
    }

    case "withdraw": {
      const [amountStr] = args;
      if (!amountStr) { console.error("Usage: withdraw <amountSui>"); process.exit(1); }
      await execute(buildWithdrawTreasury(suiToMist(amountStr), address));
      break;
    }

    case "market-info":
    case "info": {
      const marketId = args[0] ? resolveMarket(args[0]).marketId : resolveMarket("SUI_1M").marketId;
      const obj = await getMarketObject(marketId);
      console.log(JSON.stringify(obj.data?.content, null, 2));
      break;
    }

    case "rounds": {
      const market = args[0] ?? "SUI_1M";
      const count = Number(args[1]) || 5;
      await printRounds(resolveMarket(market).marketId, count);
      break;
    }

    case "my-tickets": {
      const marketId = args[0] ? resolveMarket(args[0]).marketId : undefined;
      await listTickets(address, marketId);
      break;
    }

    default:
      console.error(`Unknown command: ${cmd}\n`);
      console.log(HELP);
      process.exit(1);
  }
}

// === Ticket helpers ===

interface TicketInfo {
  objectId: string;
  marketId: string;
  roundNumber: number;
  direction: number;
  amount: number;
}

async function getOwnedTickets(owner: string, filterMarketId?: string): Promise<TicketInfo[]> {
  const tickets: TicketInfo[] = [];
  let cursor: string | null | undefined = undefined;

  do {
    const page = await client.getOwnedObjects({
      owner,
      filter: { StructType: `${PACKAGE_ID}::bet::Ticket` },
      options: { showContent: true },
      cursor: cursor ?? undefined,
    });

    for (const item of page.data) {
      const content = item.data?.content;
      if (content?.dataType !== "moveObject") continue;

      const fields = content.fields as Record<string, unknown>;
      const mktId = String(fields.market_id ?? "");
      if (filterMarketId && mktId !== filterMarketId) continue;

      tickets.push({
        objectId: item.data!.objectId!,
        marketId: mktId,
        roundNumber: Number(fields.round_number),
        direction: Number(fields.direction),
        amount: Number(fields.amount),
      });
    }

    cursor = page.hasNextPage ? page.nextCursor : null;
  } while (cursor);

  return tickets;
}

async function listTickets(owner: string, marketId?: string) {
  const tickets = await getOwnedTickets(owner, marketId);

  if (tickets.length === 0) {
    console.log("No tickets found.");
    return;
  }

  for (let i = 0; i < tickets.length; i++) {
    const t = tickets[i];
    console.log(
      `Ticket #${i + 1}: id=${t.objectId}  round=${t.roundNumber}  direction=${t.direction === 0 ? " UP " : "DOWN"}  amount=${t.amount}`,
    );
  }
}

async function redeemAllTickets(marketId: string) {
  // Step 1: find all tickets for this market
  const tickets = await getOwnedTickets(address, marketId);
  if (tickets.length === 0) {
    console.log("[redeem-all] no tickets to redeem.");
    return;
  }

  // Step 2: read market state to find which rounds are redeemable (SETTLED or CANCELLED)
  const marketState = await getMarketState(marketId);
  const roundCount = marketState?.roundCount ?? 100;
  const data = await getRecentRounds(marketId, roundCount);
  const redeemableRounds = new Set<number>();
  if (data) {
    for (const r of data.rounds) {
      if (r.status === 2 /* SETTLED */ || r.status === 3 /* CANCELLED */) {
        redeemableRounds.add(r.roundNumber);
      }
    }
  }

  const redeemable = tickets.filter((t) => redeemableRounds.has(t.roundNumber));
  const skipped = tickets.length - redeemable.length;

  if (redeemable.length === 0) {
    console.log(`[redeem-all] no redeemable tickets (${skipped} in LIVE/UPCOMING rounds).`);
    return;
  }

  if (skipped > 0) {
    console.log(`[redeem-all] skipping ${skipped} ticket(s) in LIVE/UPCOMING rounds.`);
  }

  console.log(`[redeem-all] redeeming ${redeemable.length} ticket(s)...`);
  const ticketIds = redeemable.map((t) => t.objectId);
  const tx = buildRedeemAll(marketId, ticketIds);
  await execute(tx);

  console.log(`[redeem-all] redeemed ${redeemable.length} ticket(s) successfully.`);
}

// === Display helpers ===

const STATUS_LABELS: Record<number, string> = {
  0: "UPCOMING",
  1: "LIVE",
  2: "SETTLED",
  3: "CANCELLED",
};

const RESULT_LABELS: Record<number, string> = {
  0: "UP",
  1: "DOWN",
  2: "DRAW",
};

const MARKET_STATUS_LABELS: Record<number, string> = {
  0: "ACTIVE",
  1: "PAUSED",
};

function formatMist(mist: number): string {
  return `${(mist / 1_000_000_000).toFixed(4)} SUI`;
}

function formatPrice(magnitude: string | null, expo: string | null): string {
  if (magnitude === null) return "-";
  const e = expo ? Number(expo) : 0;
  return `${(Number(magnitude) * Math.pow(10, -e)).toFixed(e > 4 ? e : 4)}`;
}

function formatTs(ms: number | null): string {
  if (ms === null) return "-";
  return new Date(ms).toLocaleTimeString();
}

function printMarketHeader(market: MarketState) {
  console.log(`\nMarket  status=${MARKET_STATUS_LABELS[market.status] ?? market.status}  interval=${market.intervalMs / 1000}s  rounds=${market.roundCount}  current=${market.currentRound}  upcoming=${market.upcomingRound}`);
  console.log("─".repeat(110));
}

function printRoundRow(r: RoundData) {
  const status = STATUS_LABELS[r.status] ?? String(r.status);
  const result = r.result !== null ? (RESULT_LABELS[r.result] ?? String(r.result)) : "-";
  const total = r.upAmount + r.downAmount;

  console.log(
    `  Round #${String(r.roundNumber).padStart(3)}  ${status.padEnd(9)}  ` +
    `start=${formatTs(r.startTimeMs)}  ` +
    `open=${formatPrice(r.openPrice, r.openPriceExpo).padStart(12)}  ` +
    `close=${formatPrice(r.closePrice, r.closePriceExpo).padStart(12)}  ` +
    `result=${result.padEnd(4)}`
  );
  console.log(
    `${"".padStart(16)}` +
    `UP: ${String(r.upCount).padStart(3)} bets  ${formatMist(r.upAmount).padStart(14)}   ` +
    `DOWN: ${String(r.downCount).padStart(3)} bets  ${formatMist(r.downAmount).padStart(14)}   ` +
    `total=${formatMist(total).padStart(14)}  pool=${formatMist(r.poolValue).padStart(14)}  prize=${formatMist(r.prizePool).padStart(14)}`
  );
}

async function printRounds(marketId: string, count: number) {
  const data = await getRecentRounds(marketId, count);
  if (!data) {
    console.error("Failed to read market data.");
    return;
  }

  printMarketHeader(data.market);
  if (data.rounds.length === 0) {
    console.log("  (no rounds)");
  } else {
    for (const r of data.rounds.reverse()) {
      printRoundRow(r);
      console.log();
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
