# Tide - Project Overview

## What
Price prediction (up/down) DApp on Sui blockchain. Users bet on whether a coin's price will go up or down in a fixed time window. Winners split the pool proportionally.

## Tech Stack
- **Smart Contract**: Sui Move (edition 2024)
- **Price Oracle**: Pyth Network (pull model via PriceInfoObject)
- **Frontend**: React 19 + TypeScript + Tailwind CSS 4 + Sui dApp Kit
- **Keeper**: TypeScript + @mysten/sui SDK + @pythnetwork/pyth-sui-js

## Project Structure
```
tide/
├── move/tide/          # Sui Move contracts
│   ├── sources/
│   │   ├── registry.move  # Registry singleton, AdminCap, global config, treasury
│   │   ├── market.move    # Market, Round, UserStats, settle_and_advance, admin ops
│   │   ├── bet.move       # Ticket, place_bet, redeem
│   │   └── events.move    # Event structs and emit helpers
│   ├── tests/
│   │   └── tide_tests.move
│   └── Move.toml       # Dependencies: Sui framework, Pyth, Wormhole (testnet)
├── ui/                 # React frontend (not yet implemented)
├── docs/               # Design docs
│   ├── contract.md     # Object model, functions, fund flow, edge cases
│   ├── oracle.md       # Pyth integration, Keeper design
│   └── frontend.md     # UI pages, data query strategy
└── README.md
```

## Key Design Decisions
- "Bet on next round" model: no information advantage, no lock period needed
- `settle_and_advance` is a single atomic operation: settle LIVE → promote UPCOMING to LIVE → create new UPCOMING
- Market as independent shared object (avoid cross-market contention)
- Permissionless settlement with settler reward incentive
- Pyth `get_price_unsafe` + manual timestamp validation in `[upcoming.start_time, upcoming.start_time + tolerance]`
- Draw = all losers (no refund), fee = total pool → treasury
- Single-side bet = normal settle with fee deduction

## Current Status (Phase 1 - Contract)
- Core contract modules implemented and compiling cleanly
- Pyth integration via `get_price_unsafe` + `get_expo` + manual timestamp check
- Price exponent stored per round (absolute value of Pyth exponent, always negative)
- `settle_and_advance_internal` shared between production and test paths (no code duplication)
- Payout calculation uses u128 intermediate to prevent overflow
- `place_bet` does not require Clock object
- `create_market` validates interval_ms > 0
- 10 event types covering all operations (registry/market/round/bet/redeem)
- 36 unit tests all passing
- Known limitation: `cancel_round` on UPCOMING leaves market without UPCOMING round, requires pause+resume to recover
