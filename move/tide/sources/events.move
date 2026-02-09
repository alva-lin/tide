module tide::events;

use sui::event;

// === Event Structs ===

// Registry events
public struct RegistryConfigUpdated has copy, drop {
    fee_bps: u64,
    settler_reward_bps: u64,
    min_bet: u64,
    price_tolerance_ms: u64,
}

public struct TreasuryWithdrawn has copy, drop {
    amount: u64,
    recipient: address,
}

// Market events
public struct MarketCreated has copy, drop {
    market_id: ID,
    pyth_feed_id: vector<u8>,
    interval_ms: u64,
    start_time_ms: u64,
}

public struct MarketPaused has copy, drop {
    market_id: ID,
}

public struct MarketResumed has copy, drop {
    market_id: ID,
    new_start_time_ms: u64,
}

// Round events
public struct RoundCreated has copy, drop {
    market_id: ID,
    round_number: u64,
    start_time_ms: u64,
}

public struct RoundSettled has copy, drop {
    market_id: ID,
    round_number: u64,
    result: u8,
    open_price: u64,
    open_price_expo: u64,
    close_price: u64,
    close_price_expo: u64,
    up_amount: u64,
    down_amount: u64,
    settler: address,
    settler_reward: u64,
}

public struct RoundCancelled has copy, drop {
    market_id: ID,
    round_number: u64,
}

// Bet events
public struct BetPlaced has copy, drop {
    market_id: ID,
    round_number: u64,
    player: address,
    direction: u8,
    amount: u64,
}

public struct Redeemed has copy, drop {
    market_id: ID,
    round_number: u64,
    player: address,
    outcome: u8, // 0=WIN, 1=LOSE, 2=CANCEL
    bet_amount: u64,
    payout: u64,
}

// === Outcome Constants ===

const OUTCOME_WIN: u8 = 0;
const OUTCOME_LOSE: u8 = 1;
const OUTCOME_CANCEL: u8 = 2;

// === Emit Functions ===

// Registry
public(package) fun emit_registry_config_updated(
    fee_bps: u64,
    settler_reward_bps: u64,
    min_bet: u64,
    price_tolerance_ms: u64,
) {
    event::emit(RegistryConfigUpdated { fee_bps, settler_reward_bps, min_bet, price_tolerance_ms });
}

public(package) fun emit_treasury_withdrawn(amount: u64, recipient: address) {
    event::emit(TreasuryWithdrawn { amount, recipient });
}

// Market
public(package) fun emit_market_created(
    market_id: ID,
    pyth_feed_id: vector<u8>,
    interval_ms: u64,
    start_time_ms: u64,
) {
    event::emit(MarketCreated { market_id, pyth_feed_id, interval_ms, start_time_ms });
}

public(package) fun emit_market_paused(market_id: ID) {
    event::emit(MarketPaused { market_id });
}

public(package) fun emit_market_resumed(market_id: ID, new_start_time_ms: u64) {
    event::emit(MarketResumed { market_id, new_start_time_ms });
}

// Round
public(package) fun emit_round_created(market_id: ID, round_number: u64, start_time_ms: u64) {
    event::emit(RoundCreated { market_id, round_number, start_time_ms });
}

public(package) fun emit_round_settled(
    market_id: ID,
    round_number: u64,
    result: u8,
    open_price: u64,
    open_price_expo: u64,
    close_price: u64,
    close_price_expo: u64,
    up_amount: u64,
    down_amount: u64,
    settler: address,
    settler_reward: u64,
) {
    event::emit(RoundSettled {
        market_id, round_number, result,
        open_price, open_price_expo,
        close_price, close_price_expo,
        up_amount, down_amount, settler, settler_reward,
    });
}

public(package) fun emit_round_cancelled(market_id: ID, round_number: u64) {
    event::emit(RoundCancelled { market_id, round_number });
}

// Bet
public(package) fun emit_bet_placed(
    market_id: ID,
    round_number: u64,
    player: address,
    direction: u8,
    amount: u64,
) {
    event::emit(BetPlaced { market_id, round_number, player, direction, amount });
}

public(package) fun emit_redeemed(
    market_id: ID,
    round_number: u64,
    player: address,
    outcome: u8,
    bet_amount: u64,
    payout: u64,
) {
    event::emit(Redeemed { market_id, round_number, player, outcome, bet_amount, payout });
}

public(package) fun outcome_win(): u8 { OUTCOME_WIN }
public(package) fun outcome_lose(): u8 { OUTCOME_LOSE }
public(package) fun outcome_cancel(): u8 { OUTCOME_CANCEL }
