#[test_only]
module tide::tide_tests;

use sui::test_scenario::{Self as ts, Scenario};
use sui::coin;
use sui::sui::SUI;

use tide::registry::{Self, Registry, AdminCap};
use tide::market::{Self, Market};
use tide::bet::{Self, Ticket};

// === Constants ===

const ADMIN: address = @0xAD;
const ALICE: address = @0xA1;
const BOB: address = @0xB0;
const SETTLER: address = @0x5E;

const FEED_ID: vector<u8> = x"50c67b3fd225db8912a424dd4baed60ffdde625ed2feaaf283724f9608fea266";
const INTERVAL_MS: u64 = 300_000; // 5 minutes
const START_TIME_MS: u64 = 1_000_000; // arbitrary start

const ONE_SUI: u64 = 1_000_000_000;
const MIN_BET: u64 = 100_000_000; // 0.1 SUI (registry default)

// === Helpers ===

fun setup(): Scenario {
    let mut scenario = ts::begin(ADMIN);
    // Init registry (creates AdminCap + shared Registry)
    {
        registry::init_for_testing(scenario.ctx());
    };
    // Create market
    scenario.next_tx(ADMIN);
    {
        let admin_cap = scenario.take_from_sender<AdminCap>();
        let mut registry = scenario.take_shared<Registry>();
        market::create_market(
            &admin_cap,
            &mut registry,
            FEED_ID,
            INTERVAL_MS,
            START_TIME_MS,
            scenario.ctx(),
        );
        ts::return_to_sender(&scenario, admin_cap);
        ts::return_shared(registry);
    };
    scenario
}

fun place_bet_helper(
    scenario: &mut Scenario,
    player: address,
    direction: u8,
    amount: u64,
) {
    scenario.next_tx(player);
    {
        let registry = scenario.take_shared<Registry>();
        let mut market = scenario.take_shared<Market>();
        let payment = coin::mint_for_testing<SUI>(amount, scenario.ctx());
        let ticket = bet::place_bet(&registry, &mut market, direction, payment, scenario.ctx());
        transfer::public_transfer(ticket, player);
        ts::return_shared(registry);
        ts::return_shared(market);
    };
}

fun settle_helper(
    scenario: &mut Scenario,
    settler: address,
    price: u64,
    price_timestamp_ms: u64,
) {
    scenario.next_tx(settler);
    {
        let mut registry = scenario.take_shared<Registry>();
        let mut market = scenario.take_shared<Market>();
        market::test_settle_and_advance(
            &mut registry,
            &mut market,
            price,
            price_timestamp_ms,
            scenario.ctx(),
        );
        ts::return_shared(registry);
        ts::return_shared(market);
    };
}

// ============================================================
// Registry Tests
// ============================================================

#[test]
fun test_registry_init() {
    let mut scenario = ts::begin(ADMIN);
    {
        registry::init_for_testing(scenario.ctx());
    };
    scenario.next_tx(ADMIN);
    {
        let registry = scenario.take_shared<Registry>();
        assert!(registry.fee_bps() == 200);
        assert!(registry.settler_reward_bps() == 200);
        assert!(registry.min_bet() == MIN_BET);
        assert!(registry.price_tolerance_ms() == 10_000);
        assert!(registry.treasury_value() == 0);
        ts::return_shared(registry);

        // Admin should own AdminCap
        assert!(ts::has_most_recent_for_sender<AdminCap>(&scenario));
    };
    scenario.end();
}

#[test]
fun test_update_config() {
    let mut scenario = ts::begin(ADMIN);
    {
        registry::init_for_testing(scenario.ctx());
    };
    scenario.next_tx(ADMIN);
    {
        let admin_cap = scenario.take_from_sender<AdminCap>();
        let mut registry = scenario.take_shared<Registry>();
        registry::update_config(&admin_cap, &mut registry, 500, 300, 200_000_000, 15_000);
        assert!(registry.fee_bps() == 500);
        assert!(registry.settler_reward_bps() == 300);
        assert!(registry.min_bet() == 200_000_000);
        assert!(registry.price_tolerance_ms() == 15_000);
        ts::return_to_sender(&scenario, admin_cap);
        ts::return_shared(registry);
    };
    scenario.end();
}

#[test, expected_failure(abort_code = 1, location = tide::registry)]
fun test_update_config_fee_too_high() {
    let mut scenario = ts::begin(ADMIN);
    {
        registry::init_for_testing(scenario.ctx());
    };
    scenario.next_tx(ADMIN);
    {
        let admin_cap = scenario.take_from_sender<AdminCap>();
        let mut registry = scenario.take_shared<Registry>();
        registry::update_config(&admin_cap, &mut registry, 1001, 200, MIN_BET, 10_000);
        ts::return_to_sender(&scenario, admin_cap);
        ts::return_shared(registry);
    };
    scenario.end();
}

#[test, expected_failure(abort_code = 2, location = tide::registry)]
fun test_update_config_settler_reward_too_high() {
    let mut scenario = ts::begin(ADMIN);
    {
        registry::init_for_testing(scenario.ctx());
    };
    scenario.next_tx(ADMIN);
    {
        let admin_cap = scenario.take_from_sender<AdminCap>();
        let mut registry = scenario.take_shared<Registry>();
        registry::update_config(&admin_cap, &mut registry, 200, 1001, MIN_BET, 10_000);
        ts::return_to_sender(&scenario, admin_cap);
        ts::return_shared(registry);
    };
    scenario.end();
}

#[test, expected_failure(abort_code = 3, location = tide::registry)]
fun test_withdraw_treasury_insufficient() {
    let mut scenario = ts::begin(ADMIN);
    {
        registry::init_for_testing(scenario.ctx());
    };
    scenario.next_tx(ADMIN);
    {
        let admin_cap = scenario.take_from_sender<AdminCap>();
        let mut registry = scenario.take_shared<Registry>();
        let coin = registry::withdraw_treasury(&admin_cap, &mut registry, 1, scenario.ctx());
        transfer::public_transfer(coin, ADMIN);
        ts::return_to_sender(&scenario, admin_cap);
        ts::return_shared(registry);
    };
    scenario.end();
}

// ============================================================
// Market Creation Tests
// ============================================================

#[test]
fun test_create_market() {
    let mut scenario = setup();
    scenario.next_tx(ADMIN);
    {
        let market = scenario.take_shared<Market>();
        assert!(market::market_round_count(&market) == 1);
        assert!(market::market_status(&market) == 0); // STATUS_ACTIVE

        // Round 1 should be UPCOMING
        let r = market.get_round(1);
        assert!(market::round_status(r) == market::round_status_upcoming());
        ts::return_shared(market);
    };
    scenario.end();
}

// ============================================================
// Place Bet Tests
// ============================================================

#[test]
fun test_place_bet_up() {
    let mut scenario = setup();
    place_bet_helper(&mut scenario, ALICE, 0, ONE_SUI); // UP

    scenario.next_tx(ALICE);
    {
        let market = scenario.take_shared<Market>();
        let r = market.get_round(1);
        assert!(market::round_up_amount(r) == ONE_SUI);
        assert!(market::round_down_amount(r) == 0);
        assert!(market::round_pool_value(&market, 1) == ONE_SUI);

        // UserStats
        let (total_rounds, wins, cancels, total_bet, total_won) =
            market::get_user_stats_values(&market, ALICE);
        assert!(total_rounds == 1);
        assert!(wins == 0);
        assert!(cancels == 0);
        assert!(total_bet == ONE_SUI);
        assert!(total_won == 0);

        ts::return_shared(market);

        // Alice should have a Ticket
        assert!(ts::has_most_recent_for_sender<Ticket>(&scenario));
    };
    scenario.end();
}

#[test]
fun test_place_bet_down() {
    let mut scenario = setup();
    place_bet_helper(&mut scenario, BOB, 1, ONE_SUI); // DOWN

    scenario.next_tx(BOB);
    {
        let market = scenario.take_shared<Market>();
        let r = market.get_round(1);
        assert!(market::round_up_amount(r) == 0);
        assert!(market::round_down_amount(r) == ONE_SUI);
        ts::return_shared(market);
    };
    scenario.end();
}

#[test]
fun test_multiple_bets_same_round() {
    let mut scenario = setup();
    place_bet_helper(&mut scenario, ALICE, 0, ONE_SUI);
    place_bet_helper(&mut scenario, BOB, 1, 2 * ONE_SUI);
    place_bet_helper(&mut scenario, ALICE, 0, ONE_SUI); // Alice bets again

    scenario.next_tx(ALICE);
    {
        let market = scenario.take_shared<Market>();
        let r = market.get_round(1);
        assert!(market::round_up_amount(r) == 2 * ONE_SUI);
        assert!(market::round_down_amount(r) == 2 * ONE_SUI);
        assert!(market::round_pool_value(&market, 1) == 4 * ONE_SUI);

        let (total_rounds, _, _, total_bet, _) =
            market::get_user_stats_values(&market, ALICE);
        assert!(total_rounds == 2);
        assert!(total_bet == 2 * ONE_SUI);
        ts::return_shared(market);
    };
    scenario.end();
}

#[test, expected_failure(abort_code = 200, location = tide::bet)]
fun test_place_bet_invalid_direction() {
    let mut scenario = setup();
    place_bet_helper(&mut scenario, ALICE, 2, ONE_SUI); // invalid direction
    scenario.end();
}

#[test, expected_failure(abort_code = 201, location = tide::bet)]
fun test_place_bet_too_small() {
    let mut scenario = setup();
    place_bet_helper(&mut scenario, ALICE, 0, MIN_BET - 1);
    scenario.end();
}

#[test, expected_failure(abort_code = 100, location = tide::market)]
fun test_place_bet_market_paused() {
    let mut scenario = setup();
    // Pause market
    scenario.next_tx(ADMIN);
    {
        let admin_cap = scenario.take_from_sender<AdminCap>();
        let mut market = scenario.take_shared<Market>();
        market::pause_market(&admin_cap, &mut market);
        ts::return_to_sender(&scenario, admin_cap);
        ts::return_shared(market);
    };
    // Try to bet
    place_bet_helper(&mut scenario, ALICE, 0, ONE_SUI);
    scenario.end();
}

// ============================================================
// Settle Tests
// ============================================================

#[test]
fun test_first_settle_no_live_round() {
    let mut scenario = setup();
    place_bet_helper(&mut scenario, ALICE, 0, ONE_SUI);

    // First settle: no LIVE round, just UPCOMING->LIVE + create new UPCOMING
    settle_helper(&mut scenario, SETTLER, 3_500_000_000, START_TIME_MS);

    scenario.next_tx(SETTLER);
    {
        let market = scenario.take_shared<Market>();
        assert!(market::market_round_count(&market) == 2);

        // Round 1 should now be LIVE
        let r1 = market.get_round(1);
        assert!(market::round_status(r1) == market::round_status_live());

        // Round 2 should be UPCOMING
        let r2 = market.get_round(2);
        assert!(market::round_status(r2) == market::round_status_upcoming());
        ts::return_shared(market);
    };
    scenario.end();
}

#[test]
fun test_settle_with_winners_up() {
    let mut scenario = setup();
    // Round 1: ALICE bets UP, BOB bets DOWN
    place_bet_helper(&mut scenario, ALICE, 0, ONE_SUI); // UP
    place_bet_helper(&mut scenario, BOB, 1, ONE_SUI);   // DOWN

    // First settle: R1 UPCOMING->LIVE, open_price=100
    settle_helper(&mut scenario, SETTLER, 100, START_TIME_MS);

    // Round 2: some bets
    place_bet_helper(&mut scenario, ALICE, 0, ONE_SUI);

    // Second settle: R1 settles (close_price=150, UP wins), R2 UPCOMING->LIVE
    let r2_start = START_TIME_MS + INTERVAL_MS;
    settle_helper(&mut scenario, SETTLER, 150, r2_start);

    scenario.next_tx(ALICE);
    {
        let market = scenario.take_shared<Market>();

        // Round 1 should be SETTLED with result UP
        let r1 = market.get_round(1);
        assert!(market::round_status(r1) == market::round_status_settled());
        assert!(market::round_result(r1).destroy_some() == 0); // RESULT_UP

        // prize_pool = total - fee = 2*ONE_SUI - 2*ONE_SUI*200/10000 = 2*ONE_SUI - 0.04*ONE_SUI
        // fee = 2_000_000_000 * 200 / 10000 = 40_000_000
        // prize_pool = 2_000_000_000 - 40_000_000 = 1_960_000_000
        assert!(market::round_prize_pool(r1) == 1_960_000_000);

        // Treasury should have fee - settler_reward
        // settler_reward = 40_000_000 * 200 / 10000 = 800_000
        // treasury_fee = 40_000_000 - 800_000 = 39_200_000
        let registry = scenario.take_shared<Registry>();
        assert!(registry.treasury_value() == 39_200_000);
        ts::return_shared(registry);

        ts::return_shared(market);
    };
    scenario.end();
}

#[test]
fun test_settle_with_winners_down() {
    let mut scenario = setup();
    place_bet_helper(&mut scenario, ALICE, 0, ONE_SUI); // UP
    place_bet_helper(&mut scenario, BOB, 1, ONE_SUI);   // DOWN

    settle_helper(&mut scenario, SETTLER, 100, START_TIME_MS);
    place_bet_helper(&mut scenario, ALICE, 0, ONE_SUI);

    // close < open → DOWN wins
    let r2_start = START_TIME_MS + INTERVAL_MS;
    settle_helper(&mut scenario, SETTLER, 50, r2_start);

    scenario.next_tx(BOB);
    {
        let market = scenario.take_shared<Market>();
        let r1 = market.get_round(1);
        assert!(market::round_result(r1).destroy_some() == 1); // RESULT_DOWN
        ts::return_shared(market);
    };
    scenario.end();
}

#[test]
fun test_settle_draw() {
    let mut scenario = setup();
    place_bet_helper(&mut scenario, ALICE, 0, ONE_SUI); // UP
    place_bet_helper(&mut scenario, BOB, 1, ONE_SUI);   // DOWN

    settle_helper(&mut scenario, SETTLER, 100, START_TIME_MS);
    place_bet_helper(&mut scenario, ALICE, 0, ONE_SUI);

    // close == open → DRAW, no winners, fee = total
    let r2_start = START_TIME_MS + INTERVAL_MS;
    settle_helper(&mut scenario, SETTLER, 100, r2_start);

    scenario.next_tx(ADMIN);
    {
        let market = scenario.take_shared<Market>();
        let r1 = market.get_round(1);
        assert!(market::round_result(r1).destroy_some() == 2); // RESULT_DRAW
        assert!(market::round_prize_pool(r1) == 0); // all fee

        // Treasury gets entire pool (minus settler reward = 0 since no winners)
        let registry = scenario.take_shared<Registry>();
        assert!(registry.treasury_value() == 2 * ONE_SUI);
        ts::return_shared(registry);
        ts::return_shared(market);
    };
    scenario.end();
}

#[test]
fun test_settle_single_side_all_win() {
    let mut scenario = setup();
    // Only UP bets
    place_bet_helper(&mut scenario, ALICE, 0, ONE_SUI);
    place_bet_helper(&mut scenario, BOB, 0, ONE_SUI);

    settle_helper(&mut scenario, SETTLER, 100, START_TIME_MS);
    place_bet_helper(&mut scenario, ALICE, 0, ONE_SUI);

    // Price goes up → everyone wins, fee still deducted
    let r2_start = START_TIME_MS + INTERVAL_MS;
    settle_helper(&mut scenario, SETTLER, 150, r2_start);

    scenario.next_tx(ADMIN);
    {
        let market = scenario.take_shared<Market>();
        let r1 = market.get_round(1);
        assert!(market::round_result(r1).destroy_some() == 0); // RESULT_UP
        // total = 2 SUI, fee = 2*1e9 * 200/10000 = 40_000_000
        assert!(market::round_prize_pool(r1) == 2 * ONE_SUI - 40_000_000);
        ts::return_shared(market);
    };
    scenario.end();
}

#[test]
fun test_settle_single_side_all_lose() {
    let mut scenario = setup();
    // Only UP bets
    place_bet_helper(&mut scenario, ALICE, 0, ONE_SUI);

    settle_helper(&mut scenario, SETTLER, 100, START_TIME_MS);
    place_bet_helper(&mut scenario, ALICE, 0, ONE_SUI);

    // Price goes down → all UP lose, fee = total
    let r2_start = START_TIME_MS + INTERVAL_MS;
    settle_helper(&mut scenario, SETTLER, 50, r2_start);

    scenario.next_tx(ADMIN);
    {
        let market = scenario.take_shared<Market>();
        let r1 = market.get_round(1);
        assert!(market::round_result(r1).destroy_some() == 1); // RESULT_DOWN
        assert!(market::round_prize_pool(r1) == 0); // no winners
        ts::return_shared(market);
    };
    scenario.end();
}

#[test]
fun test_settle_no_bets() {
    let mut scenario = setup();
    // No bets, just settle
    settle_helper(&mut scenario, SETTLER, 100, START_TIME_MS);

    // Settle again (R1 was LIVE with no bets → settles trivially)
    place_bet_helper(&mut scenario, ALICE, 0, ONE_SUI); // bet on R2

    let r2_start = START_TIME_MS + INTERVAL_MS;
    settle_helper(&mut scenario, SETTLER, 150, r2_start);

    scenario.next_tx(ADMIN);
    {
        let market = scenario.take_shared<Market>();
        let r1 = market.get_round(1);
        assert!(market::round_status(r1) == market::round_status_settled());
        assert!(market::round_prize_pool(r1) == 0);
        ts::return_shared(market);
    };
    scenario.end();
}

#[test, expected_failure(abort_code = 106, location = tide::market)]
fun test_settle_price_too_early() {
    let mut scenario = setup();
    // Timestamp before anchor_time
    settle_helper(&mut scenario, SETTLER, 100, START_TIME_MS - 1);
    scenario.end();
}

#[test, expected_failure(abort_code = 107, location = tide::market)]
fun test_settle_price_too_late() {
    let mut scenario = setup();
    // Timestamp beyond tolerance (default 10_000ms)
    settle_helper(&mut scenario, SETTLER, 100, START_TIME_MS + 10_001);
    scenario.end();
}

// ============================================================
// Redeem Tests
// ============================================================

#[test]
fun test_redeem_winner() {
    let mut scenario = setup();
    // Only Alice bets on round 1, no further bets to avoid multiple tickets
    place_bet_helper(&mut scenario, ALICE, 0, ONE_SUI); // UP
    place_bet_helper(&mut scenario, BOB, 1, ONE_SUI);   // DOWN

    settle_helper(&mut scenario, SETTLER, 100, START_TIME_MS);
    // Don't place bets for Alice in round 2
    place_bet_helper(&mut scenario, BOB, 0, ONE_SUI); // someone else bets round 2

    // UP wins
    let r2_start = START_TIME_MS + INTERVAL_MS;
    settle_helper(&mut scenario, SETTLER, 150, r2_start);

    // Alice redeems winning ticket — she only has 1 ticket (round 1 UP)
    scenario.next_tx(ALICE);
    {
        let mut market = scenario.take_shared<Market>();
        let ticket = scenario.take_from_sender<Ticket>();
        assert!(bet::ticket_direction(&ticket) == 0); // UP
        assert!(bet::ticket_round_number(&ticket) == 1);
        bet::redeem(&mut market, ticket, scenario.ctx());

        let (_, wins, _, _, total_won) = market::get_user_stats_values(&market, ALICE);
        assert!(wins == 1);
        // payout = 1_960_000_000 * 1e9 / 1e9 = 1_960_000_000
        assert!(total_won == 1_960_000_000);

        ts::return_shared(market);
    };
    scenario.end();
}

#[test]
fun test_redeem_loser() {
    let mut scenario = setup();
    place_bet_helper(&mut scenario, ALICE, 0, ONE_SUI); // UP
    place_bet_helper(&mut scenario, BOB, 1, ONE_SUI);   // DOWN

    settle_helper(&mut scenario, SETTLER, 100, START_TIME_MS);
    place_bet_helper(&mut scenario, BOB, 0, ONE_SUI); // someone else bets round 2

    // DOWN wins (price drops) — Alice loses
    let r2_start = START_TIME_MS + INTERVAL_MS;
    settle_helper(&mut scenario, SETTLER, 50, r2_start);

    // Alice redeems losing ticket — only 1 ticket
    scenario.next_tx(ALICE);
    {
        let mut market = scenario.take_shared<Market>();
        let ticket = scenario.take_from_sender<Ticket>();
        bet::redeem(&mut market, ticket, scenario.ctx());

        let (_, wins, _, _, total_won) = market::get_user_stats_values(&market, ALICE);
        assert!(wins == 0);
        assert!(total_won == 0);

        ts::return_shared(market);
    };
    scenario.end();
}

#[test]
fun test_redeem_cancelled() {
    let mut scenario = setup();
    place_bet_helper(&mut scenario, ALICE, 0, ONE_SUI);

    // Admin cancels round 1
    scenario.next_tx(ADMIN);
    {
        let admin_cap = scenario.take_from_sender<AdminCap>();
        let mut market = scenario.take_shared<Market>();
        market::cancel_round(&admin_cap, &mut market, 1);
        ts::return_to_sender(&scenario, admin_cap);
        ts::return_shared(market);
    };

    // Alice redeems — should get full refund
    scenario.next_tx(ALICE);
    {
        let mut market = scenario.take_shared<Market>();
        let ticket = scenario.take_from_sender<Ticket>();
        bet::redeem(&mut market, ticket, scenario.ctx());

        let (_, _, cancels, _, total_won) = market::get_user_stats_values(&market, ALICE);
        assert!(cancels == 1);
        assert!(total_won == ONE_SUI);

        ts::return_shared(market);
    };
    scenario.end();
}

#[test, expected_failure(abort_code = 202, location = tide::bet)]
fun test_redeem_round_not_settled() {
    let mut scenario = setup();
    place_bet_helper(&mut scenario, ALICE, 0, ONE_SUI);

    // Try redeem before round is settled
    scenario.next_tx(ALICE);
    {
        let mut market = scenario.take_shared<Market>();
        let ticket = scenario.take_from_sender<Ticket>();
        bet::redeem(&mut market, ticket, scenario.ctx());
        ts::return_shared(market);
    };
    scenario.end();
}

#[test]
fun test_redeem_draw_is_loss() {
    let mut scenario = setup();
    place_bet_helper(&mut scenario, ALICE, 0, ONE_SUI); // UP
    place_bet_helper(&mut scenario, BOB, 1, ONE_SUI);   // DOWN

    settle_helper(&mut scenario, SETTLER, 100, START_TIME_MS);
    // Use a third party for round 2 bets
    place_bet_helper(&mut scenario, SETTLER, 0, ONE_SUI);

    // DRAW
    let r2_start = START_TIME_MS + INTERVAL_MS;
    settle_helper(&mut scenario, SETTLER, 100, r2_start);

    // Both are losers in a draw — each has only 1 ticket
    scenario.next_tx(ALICE);
    {
        let mut market = scenario.take_shared<Market>();
        let ticket = scenario.take_from_sender<Ticket>();
        bet::redeem(&mut market, ticket, scenario.ctx());
        let (_, wins, _, _, total_won) = market::get_user_stats_values(&market, ALICE);
        assert!(wins == 0);
        assert!(total_won == 0);
        ts::return_shared(market);
    };

    scenario.next_tx(BOB);
    {
        let mut market = scenario.take_shared<Market>();
        let ticket = scenario.take_from_sender<Ticket>();
        bet::redeem(&mut market, ticket, scenario.ctx());
        let (_, wins, _, _, total_won) = market::get_user_stats_values(&market, BOB);
        assert!(wins == 0);
        assert!(total_won == 0);
        ts::return_shared(market);
    };
    scenario.end();
}

#[test]
fun test_redeem_proportional_payout() {
    let mut scenario = setup();
    // ALICE 1 SUI UP, BOB 3 SUI DOWN, CHARLIE 1 SUI UP
    // Using separate users so each has exactly 1 ticket
    let charlie: address = @0xC3;
    place_bet_helper(&mut scenario, ALICE, 0, ONE_SUI);
    place_bet_helper(&mut scenario, BOB, 1, 3 * ONE_SUI);
    place_bet_helper(&mut scenario, charlie, 0, ONE_SUI);

    settle_helper(&mut scenario, SETTLER, 100, START_TIME_MS);
    place_bet_helper(&mut scenario, BOB, 0, ONE_SUI); // round 2 bet by someone else

    // UP wins: total UP = 2 SUI, total = 5 SUI
    let r2_start = START_TIME_MS + INTERVAL_MS;
    settle_helper(&mut scenario, SETTLER, 150, r2_start);

    // fee = 5e9 * 200/10000 = 100_000_000
    // prize_pool = 5e9 - 100_000_000 = 4_900_000_000
    // Alice: payout = 4_900_000_000 * 1e9 / 2e9 = 2_450_000_000
    // Charlie: same = 2_450_000_000

    scenario.next_tx(ALICE);
    {
        let mut market = scenario.take_shared<Market>();
        let ticket = scenario.take_from_sender<Ticket>();
        bet::redeem(&mut market, ticket, scenario.ctx());
        let (_, wins, _, _, total_won) = market::get_user_stats_values(&market, ALICE);
        assert!(wins == 1);
        assert!(total_won == 2_450_000_000);
        ts::return_shared(market);
    };

    scenario.next_tx(charlie);
    {
        let mut market = scenario.take_shared<Market>();
        let ticket = scenario.take_from_sender<Ticket>();
        bet::redeem(&mut market, ticket, scenario.ctx());
        let (_, wins, _, _, total_won) = market::get_user_stats_values(&market, charlie);
        assert!(wins == 1);
        assert!(total_won == 2_450_000_000);
        ts::return_shared(market);
    };
    scenario.end();
}

// ============================================================
// Admin Tests
// ============================================================

#[test]
fun test_cancel_round() {
    let mut scenario = setup();
    place_bet_helper(&mut scenario, ALICE, 0, ONE_SUI);

    scenario.next_tx(ADMIN);
    {
        let admin_cap = scenario.take_from_sender<AdminCap>();
        let mut market = scenario.take_shared<Market>();
        market::cancel_round(&admin_cap, &mut market, 1);

        let r = market.get_round(1);
        assert!(market::round_status(r) == market::round_status_cancelled());
        assert!(market::round_prize_pool(r) == ONE_SUI); // full refund amount

        ts::return_to_sender(&scenario, admin_cap);
        ts::return_shared(market);
    };
    scenario.end();
}

#[test]
fun test_cancel_live_round() {
    let mut scenario = setup();
    place_bet_helper(&mut scenario, ALICE, 0, ONE_SUI);

    // Settle to make round 1 LIVE
    settle_helper(&mut scenario, SETTLER, 100, START_TIME_MS);

    scenario.next_tx(ADMIN);
    {
        let admin_cap = scenario.take_from_sender<AdminCap>();
        let mut market = scenario.take_shared<Market>();
        market::cancel_round(&admin_cap, &mut market, 1);

        let r = market.get_round(1);
        assert!(market::round_status(r) == market::round_status_cancelled());
        ts::return_to_sender(&scenario, admin_cap);
        ts::return_shared(market);
    };
    scenario.end();
}

#[test, expected_failure(abort_code = 109, location = tide::market)]
fun test_cancel_settled_round_fails() {
    let mut scenario = setup();
    place_bet_helper(&mut scenario, ALICE, 0, ONE_SUI);

    settle_helper(&mut scenario, SETTLER, 100, START_TIME_MS);
    place_bet_helper(&mut scenario, ALICE, 0, ONE_SUI);

    let r2_start = START_TIME_MS + INTERVAL_MS;
    settle_helper(&mut scenario, SETTLER, 150, r2_start);

    // Try to cancel already settled round
    scenario.next_tx(ADMIN);
    {
        let admin_cap = scenario.take_from_sender<AdminCap>();
        let mut market = scenario.take_shared<Market>();
        market::cancel_round(&admin_cap, &mut market, 1);
        ts::return_to_sender(&scenario, admin_cap);
        ts::return_shared(market);
    };
    scenario.end();
}

#[test]
fun test_pause_and_resume_market() {
    let mut scenario = setup();
    place_bet_helper(&mut scenario, ALICE, 0, ONE_SUI);

    // Pause
    scenario.next_tx(ADMIN);
    {
        let admin_cap = scenario.take_from_sender<AdminCap>();
        let mut market = scenario.take_shared<Market>();
        market::pause_market(&admin_cap, &mut market);
        assert!(market::market_status(&market) == 1); // STATUS_PAUSED
        ts::return_to_sender(&scenario, admin_cap);
        ts::return_shared(market);
    };

    // Resume with new start time
    let new_start = START_TIME_MS + 1_000_000;
    scenario.next_tx(ADMIN);
    {
        let admin_cap = scenario.take_from_sender<AdminCap>();
        let mut market = scenario.take_shared<Market>();
        market::resume_market(&admin_cap, &mut market, new_start, scenario.ctx());
        assert!(market::market_status(&market) == 0); // STATUS_ACTIVE

        // Round 1 should be cancelled (was UPCOMING with bets)
        let r1 = market.get_round(1);
        assert!(market::round_status(r1) == market::round_status_cancelled());

        // New round should be created
        let round_count = market::market_round_count(&market);
        assert!(round_count == 2);
        let r2 = market.get_round(2);
        assert!(market::round_status(r2) == market::round_status_upcoming());

        ts::return_to_sender(&scenario, admin_cap);
        ts::return_shared(market);
    };

    // Alice should be able to redeem cancelled ticket
    scenario.next_tx(ALICE);
    {
        let mut market = scenario.take_shared<Market>();
        let ticket = scenario.take_from_sender<Ticket>();
        bet::redeem(&mut market, ticket, scenario.ctx());
        let (_, _, cancels, _, total_won) = market::get_user_stats_values(&market, ALICE);
        assert!(cancels == 1);
        assert!(total_won == ONE_SUI);
        ts::return_shared(market);
    };
    scenario.end();
}

#[test]
fun test_pause_resume_with_live_round() {
    let mut scenario = setup();
    place_bet_helper(&mut scenario, ALICE, 0, ONE_SUI);

    // Settle to make round 1 LIVE
    settle_helper(&mut scenario, SETTLER, 100, START_TIME_MS);

    // Place bet on round 2
    place_bet_helper(&mut scenario, BOB, 1, ONE_SUI);

    // Pause
    scenario.next_tx(ADMIN);
    {
        let admin_cap = scenario.take_from_sender<AdminCap>();
        let mut market = scenario.take_shared<Market>();
        market::pause_market(&admin_cap, &mut market);
        ts::return_to_sender(&scenario, admin_cap);
        ts::return_shared(market);
    };

    // Resume
    let new_start = START_TIME_MS + 2_000_000;
    scenario.next_tx(ADMIN);
    {
        let admin_cap = scenario.take_from_sender<AdminCap>();
        let mut market = scenario.take_shared<Market>();
        market::resume_market(&admin_cap, &mut market, new_start, scenario.ctx());

        // Round 1 (was LIVE) should be cancelled
        let r1 = market.get_round(1);
        assert!(market::round_status(r1) == market::round_status_cancelled());

        // Round 2 (was UPCOMING) should be cancelled
        let r2 = market.get_round(2);
        assert!(market::round_status(r2) == market::round_status_cancelled());

        // New round 3 should be UPCOMING
        let r3 = market.get_round(3);
        assert!(market::round_status(r3) == market::round_status_upcoming());

        ts::return_to_sender(&scenario, admin_cap);
        ts::return_shared(market);
    };
    scenario.end();
}

#[test, expected_failure(abort_code = 100, location = tide::market)]
fun test_pause_already_paused() {
    let mut scenario = setup();
    scenario.next_tx(ADMIN);
    {
        let admin_cap = scenario.take_from_sender<AdminCap>();
        let mut market = scenario.take_shared<Market>();
        market::pause_market(&admin_cap, &mut market);
        market::pause_market(&admin_cap, &mut market); // double pause
        ts::return_to_sender(&scenario, admin_cap);
        ts::return_shared(market);
    };
    scenario.end();
}

#[test, expected_failure(abort_code = 101, location = tide::market)]
fun test_resume_not_paused() {
    let mut scenario = setup();
    scenario.next_tx(ADMIN);
    {
        let admin_cap = scenario.take_from_sender<AdminCap>();
        let mut market = scenario.take_shared<Market>();
        market::resume_market(&admin_cap, &mut market, START_TIME_MS, scenario.ctx());
        ts::return_to_sender(&scenario, admin_cap);
        ts::return_shared(market);
    };
    scenario.end();
}

// ============================================================
// Treasury Withdraw Test
// ============================================================

#[test]
fun test_withdraw_treasury_after_settle() {
    let mut scenario = setup();
    place_bet_helper(&mut scenario, ALICE, 0, ONE_SUI);
    place_bet_helper(&mut scenario, BOB, 1, ONE_SUI);

    settle_helper(&mut scenario, SETTLER, 100, START_TIME_MS);
    place_bet_helper(&mut scenario, ALICE, 0, ONE_SUI);

    // DRAW → fee = total = 2 SUI to treasury
    let r2_start = START_TIME_MS + INTERVAL_MS;
    settle_helper(&mut scenario, SETTLER, 100, r2_start);

    scenario.next_tx(ADMIN);
    {
        let admin_cap = scenario.take_from_sender<AdminCap>();
        let mut registry = scenario.take_shared<Registry>();
        assert!(registry.treasury_value() == 2 * ONE_SUI);

        let coin = registry::withdraw_treasury(&admin_cap, &mut registry, ONE_SUI, scenario.ctx());
        assert!(coin.value() == ONE_SUI);
        assert!(registry.treasury_value() == ONE_SUI);

        transfer::public_transfer(coin, ADMIN);
        ts::return_to_sender(&scenario, admin_cap);
        ts::return_shared(registry);
    };
    scenario.end();
}

// ============================================================
// Full Lifecycle Test
// ============================================================

#[test]
fun test_full_lifecycle() {
    let mut scenario = setup();
    let charlie: address = @0xC3;

    // Round 1: Alice UP 2 SUI, Bob DOWN 1 SUI
    place_bet_helper(&mut scenario, ALICE, 0, 2 * ONE_SUI);
    place_bet_helper(&mut scenario, BOB, 1, ONE_SUI);

    // First settle: R1 -> LIVE (open = 100)
    settle_helper(&mut scenario, SETTLER, 100, START_TIME_MS);

    // Round 2: Charlie bets (not Alice, to avoid multi-ticket issue)
    place_bet_helper(&mut scenario, charlie, 1, ONE_SUI);

    // Second settle: R1 settles (close=120, UP wins), R2 -> LIVE
    let r2_start = START_TIME_MS + INTERVAL_MS;
    settle_helper(&mut scenario, SETTLER, 120, r2_start);

    // total = 3 SUI, fee = 3e9 * 200/10000 = 60_000_000
    // settler_reward = 60_000_000 * 200/10000 = 1_200_000
    // treasury_fee = 60_000_000 - 1_200_000 = 58_800_000
    // prize_pool = 3e9 - 60_000_000 = 2_940_000_000

    // Alice redeems R1 winning ticket: payout = 2_940_000_000
    scenario.next_tx(ALICE);
    {
        let mut market = scenario.take_shared<Market>();
        let ticket = scenario.take_from_sender<Ticket>();
        assert!(bet::ticket_round_number(&ticket) == 1);
        bet::redeem(&mut market, ticket, scenario.ctx());

        let (_, wins, _, _, total_won) = market::get_user_stats_values(&market, ALICE);
        assert!(wins == 1);
        assert!(total_won == 2_940_000_000);
        ts::return_shared(market);
    };

    // Bob redeems R1 losing ticket
    scenario.next_tx(BOB);
    {
        let mut market = scenario.take_shared<Market>();
        let ticket = scenario.take_from_sender<Ticket>();
        bet::redeem(&mut market, ticket, scenario.ctx());

        let (total_rounds, wins, _, _, _) = market::get_user_stats_values(&market, BOB);
        assert!(total_rounds == 1);
        assert!(wins == 0);
        ts::return_shared(market);
    };

    // Verify treasury
    scenario.next_tx(ADMIN);
    {
        let registry = scenario.take_shared<Registry>();
        assert!(registry.treasury_value() == 58_800_000);
        ts::return_shared(registry);
    };

    scenario.end();
}
