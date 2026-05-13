#pragma once

#include "engine/order.hpp"

#include <cstddef>
#include <deque>
#include <functional>
#include <map>
#include <mutex>
#include <optional>
#include <utility>
#include <vector>

namespace engine {

// Limit order book with price-time priority.
// Thread-safe: each public operation takes an internal mutex.
class OrderBook {
public:
    OrderBook() = default;

    // Pinned: holds a std::mutex, so neither copyable nor movable.
    OrderBook(const OrderBook&)            = delete;
    OrderBook& operator=(const OrderBook&) = delete;
    OrderBook(OrderBook&&)                 = delete;
    OrderBook& operator=(OrderBook&&)      = delete;

    // Submit an order. Any trades resulting from matching are returned.
    // The order may end up partially or fully resting in the book.
    std::vector<Trade> add_order(Order order);

    // Cancel a resting order. Returns true if found and removed.
    bool cancel_order(OrderId id);

    std::optional<Price> best_bid() const;
    std::optional<Price> best_ask() const;

    // Top of book snapshot up to `depth` price levels per side.
    struct Level { Price price; Quantity total_qty; };
    struct Snapshot { std::vector<Level> bids; std::vector<Level> asks; };
    Snapshot snapshot(std::size_t depth = 5) const;

private:
    using Queue   = std::deque<Order>;
    using BidBook = std::map<Price, Queue, std::greater<>>;
    using AskBook = std::map<Price, Queue>;

    // Caller must already hold mu_. Market orders ignore `limit` and walk the
    // whole opposite side.
    Quantity max_fillable_locked(Side side, Price limit, bool is_market) const;

    BidBook bids_;
    AskBook asks_;

    mutable std::mutex mu_;
};

} // namespace engine
