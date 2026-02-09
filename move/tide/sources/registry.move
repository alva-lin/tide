module tide::registry;

use sui::sui::SUI;
use sui::coin::{Self, Coin};
use sui::balance::{Self, Balance};

use tide::events;

// === Error Codes ===

const EInvalidFeeBps: u64 = 1;
const EInvalidSettlerRewardBps: u64 = 2;
const EInsufficientTreasury: u64 = 3;



// === Constants ===

const MAX_FEE_BPS: u64 = 1000; // 10% max
const MAX_SETTLER_REWARD_BPS: u64 = 1000; // 10% of fee max

// === Structs ===

public struct AdminCap has key, store {
    id: UID,
}

public struct Registry has key {
    id: UID,
    fee_bps: u64,
    settler_reward_bps: u64,
    min_bet: u64,
    price_tolerance_ms: u64,
    treasury: Balance<SUI>,
    market_ids: vector<ID>,
}

// === Init ===

fun init(ctx: &mut TxContext) {
    let admin_cap = AdminCap { id: object::new(ctx) };
    let registry = Registry {
        id: object::new(ctx),
        fee_bps: 200,               // 2%
        settler_reward_bps: 200,     // 2% of fee
        min_bet: 100_000_000,        // 0.1 SUI
        price_tolerance_ms: 10_000,  // 10 seconds
        treasury: balance::zero(),
        market_ids: vector::empty(),
    };
    transfer::transfer(admin_cap, ctx.sender());
    transfer::share_object(registry);
}

// === Admin Functions ===

public fun update_config(
    _: &AdminCap,
    registry: &mut Registry,
    fee_bps: u64,
    settler_reward_bps: u64,
    min_bet: u64,
    price_tolerance_ms: u64,
) {
    assert!(fee_bps <= MAX_FEE_BPS, EInvalidFeeBps);
    assert!(settler_reward_bps <= MAX_SETTLER_REWARD_BPS, EInvalidSettlerRewardBps);
    registry.fee_bps = fee_bps;
    registry.settler_reward_bps = settler_reward_bps;
    registry.min_bet = min_bet;
    registry.price_tolerance_ms = price_tolerance_ms;

    events::emit_registry_config_updated(fee_bps, settler_reward_bps, min_bet, price_tolerance_ms);
}

public fun withdraw_treasury(
    _: &AdminCap,
    registry: &mut Registry,
    amount: u64,
    ctx: &mut TxContext,
): Coin<SUI> {
    assert!(registry.treasury.value() >= amount, EInsufficientTreasury);
    events::emit_treasury_withdrawn(amount, ctx.sender());
    coin::from_balance(registry.treasury.split(amount), ctx)
}

// === Package-Internal Accessors ===

public(package) fun fee_bps(r: &Registry): u64 { r.fee_bps }
public(package) fun settler_reward_bps(r: &Registry): u64 { r.settler_reward_bps }
public(package) fun min_bet(r: &Registry): u64 { r.min_bet }
public(package) fun price_tolerance_ms(r: &Registry): u64 { r.price_tolerance_ms }
public(package) fun uid(r: &Registry): &UID { &r.id }

public(package) fun deposit_treasury(r: &mut Registry, fee: Balance<SUI>) {
    r.treasury.join(fee);
}

public(package) fun add_market_id(r: &mut Registry, market_id: ID) {
    r.market_ids.push_back(market_id);
}

// === Test Helpers ===

#[test_only]
public fun init_for_testing(ctx: &mut TxContext) {
    init(ctx);
}

#[test_only]
public fun treasury_value(r: &Registry): u64 {
    r.treasury.value()
}
