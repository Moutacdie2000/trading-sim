#include "engine/order_book.hpp"

#include <algorithm>

namespace engine {

namespace {

template <typename Book>
bool erase_by_id(Book& book, OrderId id) {
    for (auto it = book.begin(); it != book.end(); ++it) {
        auto& queue = it->second;
        auto qit = std::find_if(queue.begin(), queue.end(),
            [&](const Order& o) { return o.id == id; });
        if (qit != queue.end()) {
            queue.erase(qit);
            if (queue.empty()) book.erase(it);
            return true;
        }
    }
    return false;
}

template <typename Book>
void collect_levels(const Book& book, std::vector<OrderBook::Level>& out, std::size_t depth) {
    out.reserve(std::min(depth, book.size()));
    for (const auto& [price, queue] : book) {
        if (out.size() == depth) break;
        Quantity total = 0;
        for (const auto& o : queue) total += o.quantity;
        out.push_back({price, total});
    }
}

template <typename Book, typename Crosses>
Quantity sum_fillable(const Book& book, Crosses crosses, bool is_market, Price limit) {
    Quantity total = 0;
    for (const auto& [price, queue] : book) {
        if (!is_market && !crosses(price, limit)) break;
        for (const auto& o : queue) total += o.quantity;
    }
    return total;
}

} // namespace

Quantity OrderBook::max_fillable_locked(Side side, Price limit, bool is_market) const {
    if (side == Side::Buy) {
        return sum_fillable(asks_,
            [](Price ask, Price bid) { return ask <= bid; }, is_market, limit);
    }
    return sum_fillable(bids_,
        [](Price bid, Price ask) { return bid >= ask; }, is_market, limit);
}

std::vector<Trade> OrderBook::add_order(Order order) {
    std::lock_guard<std::mutex> lock(mu_);
    std::vector<Trade> trades;

    const bool is_market = order.type == OrderType::Market;

    // FOK is all-or-nothing: bail before mutating state if depth is insufficient.
    if (order.type == OrderType::FOK) {
        if (max_fillable_locked(order.side, order.price, /*is_market=*/false) < order.quantity) {
            return trades;
        }
    }

    auto try_match = [&](auto& opposite, auto crosses) {
        while (order.quantity > 0 && !opposite.empty()) {
            auto it = opposite.begin();
            if (!is_market && !crosses(it->first, order.price)) break;

            auto& queue   = it->second;
            auto& resting = queue.front();
            const auto qty = std::min(order.quantity, resting.quantity);

            if (order.side == Side::Buy) {
                trades.push_back({order.id, resting.id, it->first, qty});
            } else {
                trades.push_back({resting.id, order.id, it->first, qty});
            }

            order.quantity   -= qty;
            resting.quantity -= qty;
            if (resting.quantity == 0) queue.pop_front();
            if (queue.empty())         opposite.erase(it);
        }
    };

    if (order.side == Side::Buy) {
        try_match(asks_, [](Price ask, Price bid) { return ask <= bid; });
    } else {
        try_match(bids_, [](Price bid, Price ask) { return bid >= ask; });
    }

    // Only Limit (and a fully-filled FOK, which has quantity == 0) ever rests.
    if (order.quantity > 0 && order.type == OrderType::Limit) {
        if (order.side == Side::Buy) bids_[order.price].push_back(std::move(order));
        else                         asks_[order.price].push_back(std::move(order));
    }

    return trades;
}

bool OrderBook::cancel_order(OrderId id) {
    std::lock_guard<std::mutex> lock(mu_);
    return erase_by_id(bids_, id) || erase_by_id(asks_, id);
}

std::optional<Price> OrderBook::best_bid() const {
    std::lock_guard<std::mutex> lock(mu_);
    if (bids_.empty()) return std::nullopt;
    return bids_.begin()->first;
}

std::optional<Price> OrderBook::best_ask() const {
    std::lock_guard<std::mutex> lock(mu_);
    if (asks_.empty()) return std::nullopt;
    return asks_.begin()->first;
}

OrderBook::Snapshot OrderBook::snapshot(std::size_t depth) const {
    std::lock_guard<std::mutex> lock(mu_);
    Snapshot snap;
    collect_levels(bids_, snap.bids, depth);
    collect_levels(asks_, snap.asks, depth);
    return snap;
}

} // namespace engine
