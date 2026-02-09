#[allow(lint(self_transfer))]
module tide::market;

use sui::sui::SUI;
use sui::coin::{Self, Coin};
use sui::balance::{Self, Balance};
use sui::object_table::{Self, ObjectTable};
use sui::table::{Self, Table};

use pyth::price_info::{Self, PriceInfoObject};
use pyth::price_identifier;
use pyth::price::{Self as pyth_price};
use pyth::pyth;
use pyth::i64;

use tide::registry::{Registry, AdminCap};
use tide::events;

// === Error Codes ===

const EMarketPaused: u64 = 100;
const EMarketNotPaused: u64 = 101;
const ERoundNotUpcoming: u64 = 102;

const EInvalidPriceFeedId: u64 = 105;
const EPriceTimestampTooEarly: u64 = 106;
const EPriceTimestampTooLate: u64 = 107;
const ENoUpcomingRound: u64 = 108;
const ERoundNotLiveOrUpcoming: u64 = 109;
const ENegativePrice: u64 = 110;
const EInvalidInterval: u64 = 111;


// === Status Constants ===

const STATUS_ACTIVE: u8 = 0;
const STATUS_PAUSED: u8 = 1;

const ROUND_UPCOMING: u8 = 0;
const ROUND_LIVE: u8 = 1;
const ROUND_SETTLED: u8 = 2;
const ROUND_CANCELLED: u8 = 3;

const DIRECTION_UP: u8 = 0;
const DIRECTION_DOWN: u8 = 1;

const RESULT_UP: u8 = 0;
const RESULT_DOWN: u8 = 1;
const RESULT_DRAW: u8 = 2;

const BPS_BASE: u64 = 10_000;

// === Structs ===

public struct Market has key {
    id: UID,
    pyth_feed_id: vector<u8>,
    interval_ms: u64,
    status: u8,
    round_count: u64,
    current_round_id: Option<ID>,
    upcoming_round_id: Option<ID>,
    rounds: ObjectTable<u64, Round>,
    user_stats: Table<address, UserStats>,
}

public struct Round has key, store {
    id: UID,
    round_number: u64,
    status: u8,
    start_time_ms: u64,
    open_price: Option<u64>,
    open_price_expo: Option<u64>,
    close_price: Option<u64>,
    close_price_expo: Option<u64>,
    open_timestamp_ms: Option<u64>,
    close_timestamp_ms: Option<u64>,
    up_amount: u64,
    down_amount: u64,
    up_count: u64,
    down_count: u64,
    pool: Balance<SUI>,
    prize_pool: u64,
    result: Option<u8>,
}

public struct UserStats has store {
    total_rounds: u64,
    wins: u64,
    cancels: u64,
    total_bet: u64,
    total_won: u64,
}

// === Create Market ===

public fun create_market(
    _: &AdminCap,
    registry: &mut Registry,
    pyth_feed_id: vector<u8>,
    interval_ms: u64,
    start_time_ms: u64,
    ctx: &mut TxContext,
) {
    assert!(interval_ms > 0, EInvalidInterval);

    let mut market = Market {
        id: object::new(ctx),
        pyth_feed_id,
        interval_ms,
        status: STATUS_ACTIVE,
        round_count: 0,
        current_round_id: option::none(),
        upcoming_round_id: option::none(),
        rounds: object_table::new(ctx),
        user_stats: table::new(ctx),
    };

    // Create first UPCOMING round
    let round = create_round(start_time_ms, 1, ctx);
    let round_id = object::id(&round);
    market.upcoming_round_id = option::some(round_id);
    market.round_count = 1;
    market.rounds.add(1, round);

    let market_id = object::id(&market);
    registry.add_market_id(market_id);

    events::emit_market_created(market_id, market.pyth_feed_id, interval_ms, start_time_ms);
    events::emit_round_created(market_id, 1, start_time_ms);

    transfer::share_object(market);
}

// === Settle and Advance ===

public fun settle_and_advance(
    registry: &mut Registry,
    market: &mut Market,
    price_info_object: &PriceInfoObject,
    ctx: &mut TxContext,
) {
    // Extract price from Pyth (no age check — we validate timestamp manually)
    let price_struct = pyth::get_price_unsafe(price_info_object);

    // Validate feed ID
    let price_info = price_info::get_price_info_from_price_info_object(price_info_object);
    let price_id = price_identifier::get_bytes(&price_info::get_price_identifier(&price_info));
    assert!(price_id == market.pyth_feed_id, EInvalidPriceFeedId);

    // Extract price values
    let price_i64 = pyth_price::get_price(&price_struct);
    let price_timestamp_s = pyth_price::get_timestamp(&price_struct);
    let price_timestamp_ms = price_timestamp_s * 1000;

    // Get price magnitude (asset prices should be positive)
    assert!(!i64::get_is_negative(&price_i64), ENegativePrice);
    let price_magnitude = i64::get_magnitude_if_positive(&price_i64);

    // Get price exponent (always negative for price feeds, e.g. -8)
    let expo_i64 = pyth_price::get_expo(&price_struct);
    let price_expo = if (i64::get_is_negative(&expo_i64)) {
        i64::get_magnitude_if_negative(&expo_i64)
    } else {
        i64::get_magnitude_if_positive(&expo_i64)
    };

    settle_and_advance_internal(registry, market, price_magnitude, price_expo, price_timestamp_ms, ctx);
}

// === Admin: Cancel Round ===

public fun cancel_round(
    _: &AdminCap,
    market: &mut Market,
    round_number: u64,
) {
    let round = &mut market.rounds[round_number];
    assert!(
        round.status == ROUND_UPCOMING || round.status == ROUND_LIVE,
        ERoundNotLiveOrUpcoming,
    );

    round.status = ROUND_CANCELLED;
    round.prize_pool = round.up_amount + round.down_amount; // full refund

    // Update market pointers
    if (market.current_round_id == option::some(object::id(round))) {
        market.current_round_id = option::none();
    };
    if (market.upcoming_round_id == option::some(object::id(round))) {
        market.upcoming_round_id = option::none();
    };

    events::emit_round_cancelled(object::id(market), round_number);
}

// === Admin: Pause Market ===

public fun pause_market(_: &AdminCap, market: &mut Market) {
    assert!(market.status == STATUS_ACTIVE, EMarketPaused);
    market.status = STATUS_PAUSED;
    events::emit_market_paused(object::id(market));
}

// === Admin: Resume Market ===

public fun resume_market(
    _: &AdminCap,
    market: &mut Market,
    new_start_time_ms: u64,
    ctx: &mut TxContext,
) {
    assert!(market.status == STATUS_PAUSED, EMarketNotPaused);
    market.status = STATUS_ACTIVE;

    // Cancel current LIVE round if exists
    if (market.current_round_id.is_some()) {
        // Find the live round number — it's the round before upcoming
        let upcoming_num = market.round_count;
        if (upcoming_num > 1) {
            let live_num = upcoming_num - 1;
            let live_round = &mut market.rounds[live_num];
            if (live_round.status == ROUND_LIVE) {
                live_round.status = ROUND_CANCELLED;
                live_round.prize_pool = live_round.up_amount + live_round.down_amount;
                events::emit_round_cancelled(object::id(market), live_num);
            };
        };
        market.current_round_id = option::none();
    };

    // Cancel current UPCOMING round if exists
    if (market.upcoming_round_id.is_some()) {
        let upcoming_num = market.round_count;
        let upcoming_round = &mut market.rounds[upcoming_num];
        if (upcoming_round.status == ROUND_UPCOMING) {
            upcoming_round.status = ROUND_CANCELLED;
            upcoming_round.prize_pool = upcoming_round.up_amount + upcoming_round.down_amount;
            events::emit_round_cancelled(object::id(market), upcoming_num);
        };
        market.upcoming_round_id = option::none();
    };

    // Create new UPCOMING round
    let market_id = object::id(market);
    let new_number = market.round_count + 1;
    let new_round = create_round(new_start_time_ms, new_number, ctx);
    let new_round_id = object::id(&new_round);
    market.rounds.add(new_number, new_round);
    market.upcoming_round_id = option::some(new_round_id);
    market.round_count = new_number;

    events::emit_market_resumed(market_id, new_start_time_ms);
    events::emit_round_created(market_id, new_number, new_start_time_ms);
}

// === Package-Internal Functions (for bet.move) ===

public(package) fun assert_active(market: &Market) {
    assert!(market.status == STATUS_ACTIVE, EMarketPaused);
}

public(package) fun get_upcoming_round_mut(market: &mut Market): &mut Round {
    assert!(market.upcoming_round_id.is_some(), ENoUpcomingRound);
    let upcoming_number = find_upcoming_number(market);
    &mut market.rounds[upcoming_number]
}

public(package) fun get_round(market: &Market, round_number: u64): &Round {
    &market.rounds[round_number]
}

public(package) fun get_round_mut(market: &mut Market, round_number: u64): &mut Round {
    &mut market.rounds[round_number]
}

public(package) fun get_or_create_user_stats(
    market: &mut Market,
    user: address,
): &mut UserStats {
    if (!market.user_stats.contains(user)) {
        market.user_stats.add(user, UserStats {
            total_rounds: 0,
            wins: 0,
            cancels: 0,
            total_bet: 0,
            total_won: 0,
        });
    };
    &mut market.user_stats[user]
}

// Round accessors
public(package) fun round_status(r: &Round): u8 { r.status }
public(package) fun round_number(r: &Round): u64 { r.round_number }
public(package) fun round_result(r: &Round): Option<u8> { r.result }
public(package) fun round_up_amount(r: &Round): u64 { r.up_amount }
public(package) fun round_down_amount(r: &Round): u64 { r.down_amount }
public(package) fun round_prize_pool(r: &Round): u64 { r.prize_pool }

public(package) fun round_add_bet(r: &mut Round, direction: u8, amount: u64) {
    assert!(r.status == ROUND_UPCOMING, ERoundNotUpcoming);
    if (direction == DIRECTION_UP) {
        r.up_amount = r.up_amount + amount;
        r.up_count = r.up_count + 1;
    } else {
        r.down_amount = r.down_amount + amount;
        r.down_count = r.down_count + 1;
    };
}

public(package) fun round_deposit(r: &mut Round, payment: Balance<SUI>) {
    r.pool.join(payment);
}

public(package) fun round_withdraw(r: &mut Round, amount: u64, ctx: &mut TxContext): Coin<SUI> {
    coin::from_balance(r.pool.split(amount), ctx)
}

// UserStats mutators
public(package) fun stats_add_round(s: &mut UserStats, bet_amount: u64) {
    s.total_rounds = s.total_rounds + 1;
    s.total_bet = s.total_bet + bet_amount;
}

public(package) fun stats_add_win(s: &mut UserStats, payout: u64) {
    s.wins = s.wins + 1;
    s.total_won = s.total_won + payout;
}

public(package) fun stats_add_cancel(s: &mut UserStats, payout: u64) {
    s.cancels = s.cancels + 1;
    s.total_won = s.total_won + payout;
}

// Direction / result constants
public(package) fun direction_up(): u8 { DIRECTION_UP }
public(package) fun direction_down(): u8 { DIRECTION_DOWN }
public(package) fun result_up(): u8 { RESULT_UP }
public(package) fun result_down(): u8 { RESULT_DOWN }
public(package) fun round_settled(): u8 { ROUND_SETTLED }
public(package) fun round_cancelled(): u8 { ROUND_CANCELLED }

// === Internal Helpers ===

fun create_round(start_time_ms: u64, round_number: u64, ctx: &mut TxContext): Round {
    Round {
        id: object::new(ctx),
        round_number,
        status: ROUND_UPCOMING,
        start_time_ms,
        open_price: option::none(),
        open_price_expo: option::none(),
        close_price: option::none(),
        close_price_expo: option::none(),
        open_timestamp_ms: option::none(),
        close_timestamp_ms: option::none(),
        up_amount: 0,
        down_amount: 0,
        up_count: 0,
        down_count: 0,
        pool: balance::zero(),
        prize_pool: 0,
        result: option::none(),
    }
}

fun settle_and_advance_internal(
    registry: &mut Registry,
    market: &mut Market,
    price_magnitude: u64,
    price_expo: u64,
    price_timestamp_ms: u64,
    ctx: &mut TxContext,
) {
    assert!(market.status == STATUS_ACTIVE, EMarketPaused);
    assert!(market.upcoming_round_id.is_some(), ENoUpcomingRound);

    let upcoming_number = market.round_count;
    let anchor_time_ms = market.rounds[upcoming_number].start_time_ms;

    // Validate price timestamp: [anchor_time, anchor_time + tolerance]
    let tolerance_ms = registry.price_tolerance_ms();
    assert!(price_timestamp_ms >= anchor_time_ms, EPriceTimestampTooEarly);
    assert!(price_timestamp_ms <= anchor_time_ms + tolerance_ms, EPriceTimestampTooLate);

    let market_id = object::id(market);

    // Step 1: If there's a LIVE round, settle it
    let mut settler_reward_total: u64 = 0;
    if (market.current_round_id.is_some()) {
        let live_number = upcoming_number - 1;

        let live_round = &mut market.rounds[live_number];
        assert!(live_round.status == ROUND_LIVE, ERoundNotLiveOrUpcoming);

        // Read open price info before mutation
        let open_p = *live_round.open_price.borrow();
        let open_expo = *live_round.open_price_expo.borrow();

        // Record close price
        live_round.close_price = option::some(price_magnitude);
        live_round.close_price_expo = option::some(price_expo);
        live_round.close_timestamp_ms = option::some(price_timestamp_ms);

        // Determine result
        let result = determine_result(open_p, price_magnitude);
        live_round.result = option::some(result);
        live_round.status = ROUND_SETTLED;

        // Calculate fees and prize pool
        let total = live_round.up_amount + live_round.down_amount;
        let up_amount = live_round.up_amount;
        let down_amount = live_round.down_amount;
        let winning_total = if (result == RESULT_UP) {
            up_amount
        } else if (result == RESULT_DOWN) {
            down_amount
        } else {
            0
        };

        let fee = if (winning_total == 0) {
            total
        } else {
            total * registry.fee_bps() / BPS_BASE
        };

        if (fee > 0) {
            let mut fee_balance = live_round.pool.split(fee);

            let settler_reward = fee * registry.settler_reward_bps() / BPS_BASE;
            if (settler_reward > 0) {
                settler_reward_total = settler_reward;
                let reward_balance = fee_balance.split(settler_reward);
                transfer::public_transfer(
                    coin::from_balance(reward_balance, ctx),
                    ctx.sender(),
                );
            };

            registry.deposit_treasury(fee_balance);
        };

        live_round.prize_pool = total - fee;

        events::emit_round_settled(
            market_id,
            live_number,
            result,
            open_p,
            open_expo,
            price_magnitude,
            price_expo,
            up_amount,
            down_amount,
            ctx.sender(),
            settler_reward_total,
        );
    };

    // Step 2: UPCOMING -> LIVE (record open price)
    let upcoming_round = &mut market.rounds[upcoming_number];
    upcoming_round.status = ROUND_LIVE;
    upcoming_round.open_price = option::some(price_magnitude);
    upcoming_round.open_price_expo = option::some(price_expo);
    upcoming_round.open_timestamp_ms = option::some(price_timestamp_ms);

    let new_start_time = upcoming_round.start_time_ms + market.interval_ms;
    market.current_round_id = market.upcoming_round_id;

    // Step 3: Create new UPCOMING round
    let new_number = upcoming_number + 1;
    let new_round = create_round(new_start_time, new_number, ctx);
    let new_round_id = object::id(&new_round);
    market.rounds.add(new_number, new_round);
    market.upcoming_round_id = option::some(new_round_id);
    market.round_count = new_number;

    events::emit_round_created(market_id, new_number, new_start_time);
}

fun determine_result(open_p: u64, close_p: u64): u8 {
    if (close_p > open_p) {
        RESULT_UP
    } else if (close_p < open_p) {
        RESULT_DOWN
    } else {
        RESULT_DRAW
    }
}

fun find_upcoming_number(market: &Market): u64 {
    // Upcoming round is always the latest created round
    market.round_count
}

// === Test Helpers ===

#[test_only]
public fun round_status_upcoming(): u8 { ROUND_UPCOMING }
#[test_only]
public fun round_status_live(): u8 { ROUND_LIVE }
#[test_only]
public fun round_status_settled(): u8 { ROUND_SETTLED }
#[test_only]
public fun round_status_cancelled(): u8 { ROUND_CANCELLED }

#[test_only]
public fun test_settle_and_advance(
    registry: &mut Registry,
    market: &mut Market,
    price_magnitude: u64,
    price_timestamp_ms: u64,
    ctx: &mut TxContext,
) {
    settle_and_advance_internal(registry, market, price_magnitude, 0, price_timestamp_ms, ctx);
}

#[test_only]
public fun market_round_count(m: &Market): u64 { m.round_count }

#[test_only]
public fun market_status(m: &Market): u8 { m.status }

#[test_only]
public fun get_user_stats_values(market: &Market, user: address): (u64, u64, u64, u64, u64) {
    let stats = &market.user_stats[user];
    (stats.total_rounds, stats.wins, stats.cancels, stats.total_bet, stats.total_won)
}

#[test_only]
public fun has_user_stats(market: &Market, user: address): bool {
    market.user_stats.contains(user)
}

#[test_only]
public fun round_pool_value(market: &Market, round_number: u64): u64 {
    market.rounds[round_number].pool.value()
}
