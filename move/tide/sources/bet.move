#[allow(lint(self_transfer))]
module tide::bet;

use sui::sui::SUI;
use sui::coin::Coin;

use tide::market::{Self, Market};
use tide::events;

// === Error Codes ===

const EInvalidDirection: u64 = 200;
const EBetTooSmall: u64 = 201;
const ERoundNotRedeemable: u64 = 202;
const ETicketMarketMismatch: u64 = 203;

// === Structs ===

public struct Ticket has key {
    id: UID,
    market_id: ID,
    round_number: u64,
    direction: u8,
    amount: u64,
}

// === Place Bet ===

public fun place_bet(
    market: &mut Market,
    direction: u8,
    payment: Coin<SUI>,
    ctx: &mut TxContext,
) {
    market::assert_active(market);
    assert!(
        direction == market::direction_up() || direction == market::direction_down(),
        EInvalidDirection,
    );

    let amount = payment.value();
    assert!(amount >= market.min_bet(), EBetTooSmall);

    let round = market.get_upcoming_round_mut();
    let round_number = market::round_number(round);

    // Record bet on round
    market::round_add_bet(round, direction, amount);
    market::round_deposit(round, payment.into_balance());

    let market_id = object::id(market);

    // Emit event
    events::emit_bet_placed(market_id, round_number, ctx.sender(), direction, amount);

    // Create and transfer ticket to sender
    transfer::transfer(Ticket {
        id: object::new(ctx),
        market_id,
        round_number,
        direction,
        amount,
    }, ctx.sender());
}

// === Redeem ===

public fun redeem(
    market: &mut Market,
    ticket: Ticket,
    ctx: &mut TxContext,
) {
    let Ticket { id, market_id, round_number, direction, amount } = ticket;
    assert!(market_id == object::id(market), ETicketMarketMismatch);

    let round = market.get_round(round_number);
    let status = market::round_status(round);

    assert!(
        status == market::round_settled() || status == market::round_cancelled(),
        ERoundNotRedeemable,
    );

    let player = ctx.sender();

    if (status == market::round_cancelled()) {
        // Cancelled: full refund
        let payout = amount;
        let round_mut = market.get_round_mut(round_number);
        let coin = market::round_withdraw(round_mut, payout, ctx);
        transfer::public_transfer(coin, player);

        events::emit_redeemed(
            market_id, round_number, player,
            events::outcome_cancel(), amount, payout,
        );
    } else {
        // Settled: check if winner
        let result = market::round_result(round).destroy_some();

        if (direction == result) {
            // Winner: proportional payout from prize_pool
            let prize_pool = market::round_prize_pool(round);
            let winning_total = if (result == market::result_up()) {
                market::round_up_amount(round)
            } else {
                market::round_down_amount(round)
            };

            let payout = ((prize_pool as u128) * (amount as u128) / (winning_total as u128) as u64);

            let round_mut = market.get_round_mut(round_number);
            let coin = market::round_withdraw(round_mut, payout, ctx);
            transfer::public_transfer(coin, player);

            events::emit_redeemed(
                market_id, round_number, player,
                events::outcome_win(), amount, payout,
            );
        } else {
            // Loser (includes DRAW result): just destroy ticket, no payout
            events::emit_redeemed(
                market_id, round_number, player,
                events::outcome_lose(), amount, 0,
            );
        };
    };

    id.delete();
}

// === Accessors ===

public fun ticket_market_id(t: &Ticket): ID { t.market_id }
public fun ticket_round_number(t: &Ticket): u64 { t.round_number }
public fun ticket_direction(t: &Ticket): u8 { t.direction }
public fun ticket_amount(t: &Ticket): u64 { t.amount }
