#pragma once

#include "engine/order.hpp"

#include <array>
#include <cstdint>
#include <random>

namespace engine {

struct FlowConfig {
    double      mid_start           = 100.0;
    double      mid_drift_stddev    = 0.05;
    double      arrival_rate_per_sec = 20.0;
    double      spread_mean         = 0.10;
    Quantity    qty_min             = 1;
    Quantity    qty_max             = 10;
    double      prob_limit          = 0.70;
    double      prob_market         = 0.15;
    double      prob_ioc            = 0.10;
    double      prob_fok            = 0.05;
    std::uint64_t seed              = 0;
};

class FlowGenerator {
public:
    explicit FlowGenerator(const FlowConfig& cfg);

    Order next();

    double current_mid() const noexcept { return mid_; }

private:
    FlowConfig                                  cfg_;
    std::mt19937_64                             rng_;
    std::normal_distribution<double>            drift_;
    std::exponential_distribution<double>       spread_;
    std::uniform_int_distribution<Quantity>     qty_;
    std::bernoulli_distribution                 side_;
    std::discrete_distribution<int>             type_;
    double                                      mid_;
    OrderId                                     next_id_ = 1;
};

} // namespace engine
