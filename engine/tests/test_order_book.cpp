#include "engine/order_book.hpp"

#include <gtest/gtest.h>

using namespace engine;

namespace {

Order make_order(OrderId id, Side side, Price price, Quantity qty,
                 OrderType type = OrderType::Limit) {
    return Order{id, side, price, qty, std::chrono::system_clock::now(), type};
}

} // namespace

TEST(OrderBook, NonCrossingOrderRestsAndYieldsNoTrade) {
    OrderBook book;
    const auto trades = book.add_order(make_order(1, Side::Buy, 100.0, 10));

    EXPECT_TRUE(trades.empty());
    EXPECT_EQ(book.best_bid().value(), 100.0);
    EXPECT_FALSE(book.best_ask().has_value());
}

TEST(OrderBook, FullCrossProducesSingleTrade) {
    OrderBook book;
    book.add_order(make_order(1, Side::Buy, 100.0, 10));
    const auto trades = book.add_order(make_order(2, Side::Sell, 100.0, 4));

    ASSERT_EQ(trades.size(), 1u);
    EXPECT_EQ(trades[0].buy_order_id,  1u);
    EXPECT_EQ(trades[0].sell_order_id, 2u);
    EXPECT_EQ(trades[0].price,         100.0);
    EXPECT_EQ(trades[0].quantity,      4u);
}

TEST(OrderBook, AggressiveOrderWalksTheBookAcrossLevels) {
    OrderBook book;
    book.add_order(make_order(1, Side::Sell, 100.0, 3));
    book.add_order(make_order(2, Side::Sell, 101.0, 4));
    book.add_order(make_order(3, Side::Sell, 102.0, 5));

    const auto trades = book.add_order(make_order(4, Side::Buy, 101.5, 6));

    ASSERT_EQ(trades.size(), 2u);
    EXPECT_EQ(trades[0].price, 100.0);
    EXPECT_EQ(trades[0].quantity, 3u);
    EXPECT_EQ(trades[1].price, 101.0);
    EXPECT_EQ(trades[1].quantity, 3u);
    EXPECT_EQ(book.best_ask().value(), 101.0);
}

TEST(OrderBook, PartialFillLeavesRemainderResting) {
    OrderBook book;
    book.add_order(make_order(1, Side::Sell, 50.0, 5));
    const auto trades = book.add_order(make_order(2, Side::Buy, 55.0, 12));

    ASSERT_EQ(trades.size(), 1u);
    EXPECT_EQ(trades[0].quantity, 5u);
    EXPECT_EQ(book.best_bid().value(), 55.0);
}

TEST(OrderBook, PriceTimePriorityOnSameLevel) {
    OrderBook book;
    book.add_order(make_order(1, Side::Buy, 100.0, 4));
    book.add_order(make_order(2, Side::Buy, 100.0, 4));

    const auto trades = book.add_order(make_order(3, Side::Sell, 100.0, 5));

    ASSERT_EQ(trades.size(), 2u);
    EXPECT_EQ(trades[0].buy_order_id, 1u);
    EXPECT_EQ(trades[0].quantity,     4u);
    EXPECT_EQ(trades[1].buy_order_id, 2u);
    EXPECT_EQ(trades[1].quantity,     1u);
}

TEST(OrderBook, CancelRemovesRestingOrder) {
    OrderBook book;
    book.add_order(make_order(1, Side::Buy, 100.0, 10));
    EXPECT_TRUE(book.cancel_order(1));
    EXPECT_FALSE(book.best_bid().has_value());
    EXPECT_FALSE(book.cancel_order(1));
}

TEST(OrderBook, SnapshotAggregatesByPriceLevel) {
    OrderBook book;
    book.add_order(make_order(1, Side::Buy, 99.0, 3));
    book.add_order(make_order(2, Side::Buy, 99.0, 7));
    book.add_order(make_order(3, Side::Buy, 98.0, 5));
    book.add_order(make_order(4, Side::Sell, 101.0, 2));

    const auto snap = book.snapshot(5);
    ASSERT_EQ(snap.bids.size(), 2u);
    EXPECT_EQ(snap.bids[0].price,     99.0);
    EXPECT_EQ(snap.bids[0].total_qty, 10u);
    EXPECT_EQ(snap.bids[1].price,     98.0);
    EXPECT_EQ(snap.bids[1].total_qty, 5u);
    ASSERT_EQ(snap.asks.size(), 1u);
    EXPECT_EQ(snap.asks[0].price,     101.0);
    EXPECT_EQ(snap.asks[0].total_qty, 2u);
}

TEST(OrderBook, MarketBuyFullyFillsFromMultipleLevels) {
    OrderBook book;
    book.add_order(make_order(1, Side::Sell, 100.0, 3));
    book.add_order(make_order(2, Side::Sell, 101.0, 4));
    book.add_order(make_order(3, Side::Sell, 102.0, 5));

    // Price field is ignored for Market.
    const auto trades = book.add_order(make_order(4, Side::Buy, 0.0, 6, OrderType::Market));

    ASSERT_EQ(trades.size(), 2u);
    EXPECT_EQ(trades[0].price,    100.0);
    EXPECT_EQ(trades[0].quantity, 3u);
    EXPECT_EQ(trades[1].price,    101.0);
    EXPECT_EQ(trades[1].quantity, 3u);
    EXPECT_EQ(book.best_ask().value(), 101.0);
    EXPECT_FALSE(book.best_bid().has_value());
}

TEST(OrderBook, MarketSellDrainsBidsAndDoesNotRest) {
    OrderBook book;
    book.add_order(make_order(1, Side::Buy, 99.0, 2));
    book.add_order(make_order(2, Side::Buy, 98.0, 3));

    // Order quantity exceeds total bid depth (2 + 3 = 5).
    const auto trades = book.add_order(make_order(3, Side::Sell, 0.0, 100, OrderType::Market));

    ASSERT_EQ(trades.size(), 2u);
    EXPECT_EQ(trades[0].quantity, 2u);
    EXPECT_EQ(trades[1].quantity, 3u);
    EXPECT_FALSE(book.best_bid().has_value());
    EXPECT_FALSE(book.best_ask().has_value());
}

TEST(OrderBook, IocPartialFillsAndCancelsRemainder) {
    OrderBook book;
    book.add_order(make_order(1, Side::Sell, 100.0, 3));

    const auto trades = book.add_order(make_order(2, Side::Buy, 100.0, 10, OrderType::IOC));

    ASSERT_EQ(trades.size(), 1u);
    EXPECT_EQ(trades[0].quantity, 3u);
    // Remainder must not rest.
    EXPECT_FALSE(book.best_bid().has_value());
}

TEST(OrderBook, IocRespectsLimitPrice) {
    OrderBook book;
    book.add_order(make_order(1, Side::Sell, 101.0, 5));

    // Buyer is willing to pay only 100; ask is 101 — no fills, nothing rests.
    const auto trades = book.add_order(make_order(2, Side::Buy, 100.0, 5, OrderType::IOC));

    EXPECT_TRUE(trades.empty());
    EXPECT_FALSE(book.best_bid().has_value());
    EXPECT_EQ(book.best_ask().value(), 101.0);
}

TEST(OrderBook, FokFullyFillsWhenLiquiditySuffices) {
    OrderBook book;
    book.add_order(make_order(1, Side::Sell, 100.0, 3));
    book.add_order(make_order(2, Side::Sell, 101.0, 4));

    const auto trades = book.add_order(make_order(3, Side::Buy, 101.0, 7, OrderType::FOK));

    ASSERT_EQ(trades.size(), 2u);
    EXPECT_EQ(trades[0].quantity, 3u);
    EXPECT_EQ(trades[1].quantity, 4u);
    EXPECT_FALSE(book.best_ask().has_value());
    EXPECT_FALSE(book.best_bid().has_value());
}

TEST(OrderBook, FokRejectedWhenDepthInsufficientLeavesBookUntouched) {
    OrderBook book;
    book.add_order(make_order(1, Side::Sell, 100.0, 3));
    book.add_order(make_order(2, Side::Sell, 101.0, 2));

    const auto trades = book.add_order(make_order(3, Side::Buy, 101.0, 10, OrderType::FOK));

    EXPECT_TRUE(trades.empty());
    // Resting asks unchanged.
    EXPECT_EQ(book.best_ask().value(), 100.0);
    EXPECT_FALSE(book.best_bid().has_value());
}

TEST(OrderBook, FokIgnoresLiquidityWorseThanLimitPrice) {
    OrderBook book;
    // Only liquidity sits at 102, but FOK buyer caps at 101 → insufficient.
    book.add_order(make_order(1, Side::Sell, 102.0, 10));

    const auto trades = book.add_order(make_order(2, Side::Buy, 101.0, 5, OrderType::FOK));

    EXPECT_TRUE(trades.empty());
    EXPECT_EQ(book.best_ask().value(), 102.0);
}
