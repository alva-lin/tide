import { execute, getMarketObject } from "./execute.js";
import { getRecentRounds, type RoundData, type MarketState } from "./market.js";
import { catchUpMarket } from "./catchUp.js";
import {
  buildCreateMarket,
  buildPauseMarket,
  buildResumeMarket,
  buildPlaceBet,
  buildSettleAndAdvance,
  buildRedeem,
  buildRedeemAll,
  buildUpdateConfig,
  buildWithdrawTreasury,
} from "./transactions/index.js";
import { MARKETS, PYTH_FEED_IDS, PACKAGE_ID } from "./config.js";
import { client, address } from "./client.js";

const HELP = `
Tide CLI — manual contract interaction tool

Usage: pnpm cli <command> [args...]

Commands:
  create-market <feedId> <intervalMs> <minBetMist> <startTimeMs>
  pause-market  <marketId>
  resume-market <marketId> <newStartTimeMs>
  place-bet     <marketId> <direction:0|1> <amountMist>
  settle        <marketId> <feedId>
  redeem        <marketId> <ticketId>
  redeem-all    <marketId> <feedId>
  update-config <feeBps> <settlerRewardBps> <priceToleranceMs>
  withdraw      <amountMist>
  market-info   <marketId>
  rounds        <marketId> [count]
  my-tickets    [marketId]

Shortcuts (uses default SUI market):
  bet-up    <amountMist>       — place UP bet on SUI market
  bet-down  <amountMist>       — place DOWN bet on SUI market
  settle-sui                   — settle SUI market
  redeem-sui     <ticketId>    — redeem single ticket on SUI market
  redeem-all-sui               — catch up + redeem all SUI market tickets
  info                         — show SUI market info
  rounds-sui                   — show recent rounds for SUI market
`.trim();

async function main() {
  const [cmd, ...args] = process.argv.slice(2);

  if (!cmd || cmd === "help" || cmd === "--help") {
    console.log(HELP);
    return;
  }

  switch (cmd) {
    case "create-market": {
      const [feedId, intervalMs, minBet, startTimeMs] = args;
      if (!feedId || !intervalMs || !minBet || !startTimeMs) {
        console.error("Usage: create-market <feedId> <intervalMs> <minBetMist> <startTimeMs>");
        process.exit(1);
      }
      const tx = buildCreateMarket({
        pythFeedId: feedId,
        intervalMs: Number(intervalMs),
        minBet: Number(minBet),
        startTimeMs: Number(startTimeMs),
      });
      await execute(tx);
      break;
    }

    case "pause-market": {
      const [marketId] = args;
      if (!marketId) {
        console.error("Usage: pause-market <marketId>");
        process.exit(1);
      }
      await execute(buildPauseMarket(marketId));
      break;
    }

    case "resume-market": {
      const [marketId, startTime] = args;
      if (!marketId || !startTime) {
        console.error("Usage: resume-market <marketId> <newStartTimeMs>");
        process.exit(1);
      }
      await execute(buildResumeMarket(marketId, Number(startTime)));
      break;
    }

    case "place-bet": {
      const [marketId, direction, amount] = args;
      if (!marketId || direction === undefined || !amount) {
        console.error("Usage: place-bet <marketId> <direction:0|1> <amountMist>");
        process.exit(1);
      }
      await execute(buildPlaceBet(marketId, Number(direction), Number(amount)));
      break;
    }

    case "bet-up": {
      const [amount] = args;
      if (!amount) { console.error("Usage: bet-up <amountMist>"); process.exit(1); }
      await execute(buildPlaceBet(MARKETS.SUI, 0, Number(amount)));
      break;
    }

    case "bet-down": {
      const [amount] = args;
      if (!amount) { console.error("Usage: bet-down <amountMist>"); process.exit(1); }
      await execute(buildPlaceBet(MARKETS.SUI, 1, Number(amount)));
      break;
    }

    case "settle": {
      const [marketId, feedId] = args;
      if (!marketId || !feedId) {
        console.error("Usage: settle <marketId> <feedId>");
        process.exit(1);
      }
      await catchUpMarket(marketId, feedId);
      break;
    }

    case "settle-sui": {
      await catchUpMarket(MARKETS.SUI, PYTH_FEED_IDS.SUI_USD);
      break;
    }

    case "redeem": {
      const [marketId, ticketId] = args;
      if (!marketId || !ticketId) {
        console.error("Usage: redeem <marketId> <ticketId>");
        process.exit(1);
      }
      await execute(buildRedeem(marketId, ticketId));
      break;
    }

    case "redeem-sui": {
      const [ticketId] = args;
      if (!ticketId) {
        console.error("Usage: redeem-sui <ticketId>");
        process.exit(1);
      }
      await execute(buildRedeem(MARKETS.SUI, ticketId));
      break;
    }

    case "redeem-all": {
      const [marketId, feedId] = args;
      if (!marketId || !feedId) {
        console.error("Usage: redeem-all <marketId> <feedId>");
        process.exit(1);
      }
      await redeemAllTickets(marketId, feedId);
      break;
    }

    case "redeem-all-sui": {
      await redeemAllTickets(MARKETS.SUI, PYTH_FEED_IDS.SUI_USD);
      break;
    }

    case "update-config": {
      const [feeBps, settlerRewardBps, toleranceMs] = args;
      if (!feeBps || !settlerRewardBps || !toleranceMs) {
        console.error("Usage: update-config <feeBps> <settlerRewardBps> <priceToleranceMs>");
        process.exit(1);
      }
      await execute(
        buildUpdateConfig({
          feeBps: Number(feeBps),
          settlerRewardBps: Number(settlerRewardBps),
          priceToleranceMs: Number(toleranceMs),
        }),
      );
      break;
    }

    case "withdraw": {
      const [amount] = args;
      if (!amount) { console.error("Usage: withdraw <amountMist>"); process.exit(1); }
      await execute(buildWithdrawTreasury(Number(amount), address));
      break;
    }

    case "market-info":
    case "info": {
      const marketId = args[0] ?? MARKETS.SUI;
      const obj = await getMarketObject(marketId);
      console.log(JSON.stringify(obj.data?.content, null, 2));
      break;
    }

    case "rounds": {
      const [marketId, countStr] = args;
      if (!marketId) {
        console.error("Usage: rounds <marketId> [count]");
        process.exit(1);
      }
      await printRounds(marketId, Number(countStr) || 5);
      break;
    }

    case "rounds-sui": {
      const count = Number(args[0]) || 5;
      await printRounds(MARKETS.SUI, count);
      break;
    }

    case "my-tickets": {
      const marketId = args[0];
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

async function redeemAllTickets(marketId: string, feedId: string) {
  // Step 1: catch up stale rounds so tickets become redeemable
  console.log("[redeem-all] catching up market...");
  await catchUpMarket(marketId, feedId);

  // Step 2: find all tickets for this market
  const tickets = await getOwnedTickets(address, marketId);
  if (tickets.length === 0) {
    console.log("[redeem-all] no tickets to redeem.");
    return;
  }

  console.log(`[redeem-all] found ${tickets.length} ticket(s), redeeming...`);

  const ticketIds = tickets.map((t) => t.objectId);
  const tx = buildRedeemAll(marketId, ticketIds);
  await execute(tx);

  console.log(`[redeem-all] redeemed ${tickets.length} ticket(s) successfully.`);
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
