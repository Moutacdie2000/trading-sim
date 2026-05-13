#include "engine/flow_generator.hpp"

#include <gtest/gtest.h>

#include <array>
#include <cmath>
#include <unordered_map>

using namespace engine;

namespace {

FlowConfig default_cfg(std::uint64_t seed) {
    FlowConfig c;
    c.seed = seed;
    return c;
}

} // namespace

TEST(FlowGenerator, DeterministicForSameSeed) {
    FlowGenerator a(default_cfg(12345));
    FlowGenerator b(default_cfg(12345));

    for (int i = 0; i < 200; ++i) {
        const auto oa = a.next();
        const auto ob = b.next();
        EXPECT_EQ(oa.id,       ob.id);
        EXPECT_EQ(oa.side,     ob.side);
        EXPECT_EQ(oa.price,    ob.price);
        EXPECT_EQ(oa.quantity, ob.quantity);
        EXPECT_EQ(oa.type,     ob.type);
    }
}

TEST(FlowGenerator, DifferentSeedsDiverge) {
    FlowGenerator a(default_cfg(1));
    FlowGenerator b(default_cfg(2));

    bool any_differ = false;
    for (int i = 0; i < 50 && !any_differ; ++i) {
        const auto oa = a.next();
        const auto ob = b.next();
        if (oa.price != ob.price || oa.quantity != ob.quantity || oa.type != ob.type) {
            any_differ = true;
        }
    }
    EXPECT_TRUE(any_differ);
}

TEST(FlowGenerator, OrderTypeRatiosConverge) {
    FlowConfig cfg = default_cfg(7);
    cfg.prob_limit  = 0.60;
    cfg.prob_market = 0.20;
    cfg.prob_ioc    = 0.15;
    cfg.prob_fok    = 0.05;

    FlowGenerator gen(cfg);
    std::unordered_map<OrderType, std::size_t> counts;
    constexpr std::size_t kN = 20000;
    for (std::size_t i = 0; i < kN; ++i) ++counts[gen.next().type];

    const double tol = 0.05;
    EXPECT_NEAR(static_cast<double>(counts[OrderType::Limit])  / kN, cfg.prob_limit,  tol);
    EXPECT_NEAR(static_cast<double>(counts[OrderType::Market]) / kN, cfg.prob_market, tol);
    EXPECT_NEAR(static_cast<double>(counts[OrderType::IOC])    / kN, cfg.prob_ioc,    tol);
    EXPECT_NEAR(static_cast<double>(counts[OrderType::FOK])    / kN, cfg.prob_fok,    tol);
}

TEST(FlowGenerator, MidStaysBoundedOverShortHorizon) {
    FlowConfig cfg = default_cfg(99);
    cfg.mid_start        = 100.0;
    cfg.mid_drift_stddev = 0.05;

    FlowGenerator gen(cfg);
    for (int i = 0; i < 500; ++i) (void)gen.next();

    // Random walk with stddev 0.05 over 500 steps → std ~ 0.05*sqrt(500) ~= 1.12.
    // A 10-sigma envelope is generous; this is a sanity check, not a tight bound.
    EXPECT_GT(gen.current_mid(), 100.0 - 12.0);
    EXPECT_LT(gen.current_mid(), 100.0 + 12.0);
}

TEST(FlowGenerator, IdsAreMonotonicallyIncreasing) {
    FlowGenerator gen(default_cfg(3));
    OrderId prev = 0;
    for (int i = 0; i < 50; ++i) {
        const auto o = gen.next();
        EXPECT_GT(o.id, prev);
        prev = o.id;
    }
}
