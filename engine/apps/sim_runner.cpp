// sim_runner — drives an OrderBook with synthetic flow and emits NDJSON events
// to stdout. The gateway parses each line and re-broadcasts it over WebSocket.
//
// Event shapes (one JSON object per line):
//   {"type":"trade","ts":<ms>,"price":<num>,"qty":<int>,"buy":<id>,"sell":<id>}
//   {"type":"book","ts":<ms>,"bids":[[price,qty],...],"asks":[[price,qty],...]}
//   {"type":"stats","ts":<ms>,"orders":<int>,"trades":<int>,"books":<int>}

#include "engine/flow_generator.hpp"
#include "engine/order_book.hpp"

#include <atomic>
#include <chrono>
#include <csignal>
#include <cstdint>
#include <cstdlib>
#include <cstring>
#include <iostream>
#include <sstream>
#include <string>
#include <string_view>
#include <thread>

namespace {

std::atomic<bool> running{true};

void handle_signal(int) { running = false; }

std::int64_t now_ms() {
    using namespace std::chrono;
    return duration_cast<milliseconds>(system_clock::now().time_since_epoch()).count();
}

// Small NDJSON helper: a manual builder that appends fields with proper commas.
// Stdlib-only on purpose — pulling in a JSON dep for ~3 event shapes is overkill.
class JsonLine {
public:
    explicit JsonLine(std::string_view type) {
        os_ << '{';
        append_raw("\"type\"", quote(type));
        first_ = false;
    }

    JsonLine& field(std::string_view key, std::int64_t v) {
        sep();
        os_ << quote(key) << ':' << v;
        return *this;
    }
    JsonLine& field(std::string_view key, std::uint64_t v) {
        sep();
        os_ << quote(key) << ':' << v;
        return *this;
    }
    JsonLine& field(std::string_view key, double v) {
        sep();
        os_ << quote(key) << ':' << v;
        return *this;
    }
    JsonLine& field(std::string_view key, std::string_view v) {
        sep();
        os_ << quote(key) << ':' << quote(v);
        return *this;
    }
    // Raw value (already-formatted JSON fragment, e.g. an array literal).
    JsonLine& raw_field(std::string_view key, std::string_view raw) {
        sep();
        os_ << quote(key) << ':' << raw;
        return *this;
    }

    std::string str() {
        os_ << '}';
        return os_.str();
    }

private:
    void append_raw(std::string_view key, const std::string& val) {
        os_ << key << ':' << val;
    }
    void sep() {
        if (!first_) os_ << ',';
        first_ = false;
    }
    static std::string quote(std::string_view s) {
        std::string out;
        out.reserve(s.size() + 2);
        out.push_back('"');
        out.append(s.data(), s.size());
        out.push_back('"');
        return out;
    }

    std::ostringstream os_;
    bool               first_ = true;
};

void emit(const std::string& line) {
    std::cout << line << '\n' << std::flush;
}

void emit_trade(const engine::Trade& t) {
    emit(JsonLine("trade")
            .field("ts",    now_ms())
            .field("price", t.price)
            .field("qty",   static_cast<std::uint64_t>(t.quantity))
            .field("buy",   static_cast<std::uint64_t>(t.buy_order_id))
            .field("sell",  static_cast<std::uint64_t>(t.sell_order_id))
            .str());
}

std::string levels_to_json(const std::vector<engine::OrderBook::Level>& levels) {
    std::ostringstream os;
    os << '[';
    for (std::size_t i = 0; i < levels.size(); ++i) {
        if (i) os << ',';
        os << '[' << levels[i].price << ',' << levels[i].total_qty << ']';
    }
    os << ']';
    return os.str();
}

void emit_book(const engine::OrderBook::Snapshot& s) {
    const std::string bids = levels_to_json(s.bids);
    const std::string asks = levels_to_json(s.asks);
    emit(JsonLine("book")
            .field("ts", now_ms())
            .raw_field("bids", bids)
            .raw_field("asks", asks)
            .str());
}

void emit_stats(std::uint64_t orders, std::uint64_t trades, std::uint64_t books) {
    emit(JsonLine("stats")
            .field("ts",     now_ms())
            .field("orders", orders)
            .field("trades", trades)
            .field("books",  books)
            .str());
}

struct Args {
    double        rate       = 20.0;
    double        mid        = 100.0;
    std::uint64_t seed       = 0;
    double        duration   = 0.0;
    std::size_t   book_depth = 5;
    bool          seed_set   = false;
};

bool starts_with(std::string_view s, std::string_view prefix) {
    return s.size() >= prefix.size() && s.compare(0, prefix.size(), prefix) == 0;
}

Args parse_args(int argc, char** argv) {
    Args a;
    for (int i = 1; i < argc; ++i) {
        const std::string_view arg = argv[i];
        if      (starts_with(arg, "--rate="))       a.rate     = std::stod(std::string(arg.substr(7)));
        else if (starts_with(arg, "--mid="))        a.mid      = std::stod(std::string(arg.substr(6)));
        else if (starts_with(arg, "--seed="))     { a.seed     = std::stoull(std::string(arg.substr(7))); a.seed_set = true; }
        else if (starts_with(arg, "--duration="))   a.duration = std::stod(std::string(arg.substr(11)));
        else if (starts_with(arg, "--book-depth=")) a.book_depth = static_cast<std::size_t>(std::stoul(std::string(arg.substr(13))));
        else {
            std::cerr << "sim_runner: ignoring unknown arg: " << arg << '\n';
        }
    }
    if (!a.seed_set) {
        a.seed = static_cast<std::uint64_t>(
            std::chrono::system_clock::now().time_since_epoch().count());
    }
    return a;
}

} // namespace

int main(int argc, char** argv) {
    std::signal(SIGINT,  handle_signal);
    std::signal(SIGTERM, handle_signal);

    const Args args = parse_args(argc, argv);

    engine::FlowConfig cfg;
    cfg.mid_start            = args.mid;
    cfg.arrival_rate_per_sec = args.rate;
    cfg.seed                 = args.seed;

    engine::FlowGenerator gen(cfg);
    engine::OrderBook     book;

    const auto period = std::chrono::microseconds(
        args.rate > 0.0 ? static_cast<std::int64_t>(1e6 / args.rate) : 50'000);

    const auto start_time    = std::chrono::steady_clock::now();
    auto       next_stats_at = start_time + std::chrono::seconds(5);
    const auto deadline      = (args.duration > 0.0)
        ? start_time + std::chrono::microseconds(static_cast<std::int64_t>(args.duration * 1e6))
        : std::chrono::steady_clock::time_point::max();

    std::uint64_t orders_total = 0;
    std::uint64_t trades_total = 0;
    std::uint64_t books_total  = 0;
    std::size_t   since_book   = 0;

    while (running) {
        const auto now = std::chrono::steady_clock::now();
        if (now >= deadline) break;

        const auto trades = book.add_order(gen.next());
        ++orders_total;
        for (const auto& t : trades) {
            emit_trade(t);
            ++trades_total;
        }

        if (++since_book >= 10) {
            since_book = 0;
            emit_book(book.snapshot(args.book_depth));
            ++books_total;
        }

        if (now >= next_stats_at) {
            emit_stats(orders_total, trades_total, books_total);
            next_stats_at = now + std::chrono::seconds(5);
        }

        std::this_thread::sleep_for(period);
    }

    return 0;
}
