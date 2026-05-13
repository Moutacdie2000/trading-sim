#pragma once

#include <chrono>
#include <cstdint>

namespace engine {

using OrderId   = std::uint64_t;
using Price     = double;
using Quantity  = std::uint64_t;
using Timestamp = std::chrono::system_clock::time_point;

enum class Side      : std::uint8_t { Buy, Sell };
enum class OrderType : std::uint8_t { Limit, Market, IOC, FOK };

struct Order {
    OrderId   id;
    Side      side;
    Price     price;
    Quantity  quantity;
    Timestamp timestamp;
    OrderType type = OrderType::Limit;
};

struct Trade {
    OrderId  buy_order_id;
    OrderId  sell_order_id;
    Price    price;
    Quantity quantity;
};

} // namespace engine
