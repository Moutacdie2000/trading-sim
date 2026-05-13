#include "engine/flow_generator.hpp"

#include <cassert>
#include <chrono>
#include <cmath>

namespace engine {

namespace {

constexpr double kProbSumTolerance = 1e-9;

bool probs_sum_to_one(const FlowConfig& c) {
    const double s = c.prob_limit + c.prob_market + c.prob_ioc + c.prob_fok;
    return std::fabs(s - 1.0) < kProbSumTolerance;
}

OrderType pick_type(int idx) {
    switch (idx) {
        case 0: return OrderType::Limit;
        case 1: return OrderType::Market;
        case 2: return OrderType::IOC;
        default: return OrderType::FOK;
    }
}

} // namespace

FlowGenerator::FlowGenerator(const FlowConfig& cfg)
    : cfg_(cfg)
    , rng_(cfg.seed)
    , drift_(0.0, cfg.mid_drift_stddev)
    , spread_(cfg.spread_mean > 0.0 ? 1.0 / cfg.spread_mean : 1.0)
    , qty_(cfg.qty_min, cfg.qty_max)
    , side_(0.5)
    , type_({cfg.prob_limit, cfg.prob_market, cfg.prob_ioc, cfg.prob_fok})
    , mid_(cfg.mid_start) {
    assert(probs_sum_to_one(cfg) && "FlowConfig prob_* must sum to 1.0");
    assert(cfg.qty_min <= cfg.qty_max && "qty_min must be <= qty_max");
}

Order FlowGenerator::next() {
    mid_ += drift_(rng_);

    const Side       side   = side_(rng_) ? Side::Buy : Side::Sell;
    const OrderType  otype  = pick_type(type_(rng_));
    const double     offset = spread_(rng_);
    const double     raw    = (side == Side::Buy) ? mid_ - offset : mid_ + offset;

    Order o{};
    o.id        = next_id_++;
    o.side      = side;
    o.price     = std::round(raw * 100.0) / 100.0;
    o.quantity  = qty_(rng_);
    o.timestamp = std::chrono::system_clock::now();
    o.type      = otype;
    return o;
}

} // namespace engine
