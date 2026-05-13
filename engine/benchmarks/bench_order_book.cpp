// Micro-benchmark for OrderBook::add_order. Stdlib-only.
// Pre-populates the book with N resting orders, then times M add_orders
// (mixed sides, random prices around the mid). Reports orders/sec and
// p50/p99 latency in microseconds.

#include "engine/order_book.hpp"

#include <algorithm>
#include <array>
#include <chrono>
#include <cstdint>
#include <cstdio>
#include <random>
#include <vector>

namespace {

using Clock = std::chrono::steady_clock;

engine::Order make_order(engine::OrderId id, engine::Side side,
                         engine::Price price, engine::Quantity qty) {
    return engine::Order{id, side, price, qty,
                         std::chrono::system_clock::now(),
                         engine::OrderType::Limit};
}

struct Stats {
    double   orders_per_sec;
    double   p50_us;
    double   p99_us;
};

Stats run_scenario(std::size_t prewarm, std::size_t hot_ops, std::uint64_t seed) {
    engine::OrderBook book;
    std::mt19937_64                              rng(seed);
    std::normal_distribution<double>             jitter(0.0, 0.5);
    std::uniform_int_distribution<engine::Quantity> qty(1, 10);
    std::bernoulli_distribution                  is_buy(0.5);

    engine::OrderId next_id = 1;
    const double mid = 100.0;

    // Pre-warm: rest `prewarm` non-crossing orders so the book has depth.
    for (std::size_t i = 0; i < prewarm; ++i) {
        const auto side = is_buy(rng) ? engine::Side::Buy : engine::Side::Sell;
        const double off = std::abs(jitter(rng)) + 0.01;
        const double px  = (side == engine::Side::Buy) ? mid - off - 1.0
                                                       : mid + off + 1.0;
        book.add_order(make_order(next_id++, side,
                                  std::round(px * 100.0) / 100.0,
                                  qty(rng)));
    }

    std::vector<double> samples;
    samples.reserve(hot_ops);

    const auto t0 = Clock::now();
    for (std::size_t i = 0; i < hot_ops; ++i) {
        const auto side = is_buy(rng) ? engine::Side::Buy : engine::Side::Sell;
        const double off = std::abs(jitter(rng));
        const double px  = (side == engine::Side::Buy) ? mid - off : mid + off;
        const auto t_op_start = Clock::now();
        book.add_order(make_order(next_id++, side,
                                  std::round(px * 100.0) / 100.0,
                                  qty(rng)));
        const auto t_op_end = Clock::now();
        samples.push_back(
            std::chrono::duration<double, std::micro>(t_op_end - t_op_start).count());
    }
    const auto t1 = Clock::now();

    const double secs = std::chrono::duration<double>(t1 - t0).count();
    std::sort(samples.begin(), samples.end());
    const auto pct = [&](double p) {
        const std::size_t idx = std::min(samples.size() - 1,
            static_cast<std::size_t>(p * static_cast<double>(samples.size())));
        return samples[idx];
    };

    return Stats{static_cast<double>(hot_ops) / secs, pct(0.50), pct(0.99)};
}

} // namespace

int main() {
    constexpr std::size_t hot_ops = 50'000;
    const std::array<std::size_t, 3> sizes = {100, 1000, 10000};

    std::printf("%-10s %-15s %-12s %-12s\n", "N", "orders/sec", "p50(us)", "p99(us)");
    for (const auto n : sizes) {
        const Stats s = run_scenario(n, hot_ops, /*seed=*/0xC0FFEEu);
        std::printf("%-10zu %-15.0f %-12.3f %-12.3f\n",
                    n, s.orders_per_sec, s.p50_us, s.p99_us);
    }
    return 0;
}
