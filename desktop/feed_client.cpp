#include "feed_client.h"

#include <QDateTime>
#include <QJsonArray>
#include <QJsonDocument>
#include <QJsonObject>
#include <QJsonValue>

namespace {
constexpr int kBackoffStepsMs[] = {1000, 2000, 4000, 8000, 16000, 30000};
constexpr int kBackoffStepCount = sizeof(kBackoffStepsMs) / sizeof(kBackoffStepsMs[0]);
constexpr int kStableUptimeMs   = 10000;
constexpr int kCountdownTickMs  = 250;

QVariantList levelsToVariant(const QJsonArray& levels) {
    QVariantList out;
    out.reserve(levels.size());
    for (const auto& level : levels) {
        const auto pair = level.toArray();
        if (pair.size() < 2) continue;
        QVariantList row;
        row.append(pair.at(0).toDouble());
        row.append(static_cast<qulonglong>(pair.at(1).toDouble()));
        out.append(QVariant::fromValue(row));
    }
    return out;
}
}

FeedClient::FeedClient(QObject* parent) : QObject(parent) {
    connect(&socket_, &QWebSocket::connected,           this, &FeedClient::onConnected);
    connect(&socket_, &QWebSocket::disconnected,        this, &FeedClient::onDisconnected);
    connect(&socket_, &QWebSocket::textMessageReceived, this, &FeedClient::onTextMessageReceived);

    reconnectTimer_.setSingleShot(true);
    connect(&reconnectTimer_, &QTimer::timeout, this, [this]() {
        countdownTimer_.stop();
        setNextRetryInMs(0);
        if (!url_.isEmpty()) socket_.open(url_);
    });

    stableTimer_.setSingleShot(true);
    connect(&stableTimer_, &QTimer::timeout, this, [this]() { attempt_ = 0; });

    countdownTimer_.setInterval(kCountdownTickMs);
    connect(&countdownTimer_, &QTimer::timeout, this, [this]() {
        const auto now      = QDateTime::currentMSecsSinceEpoch();
        const auto elapsed  = now - retryStartedAt_;
        const auto idx      = std::min(attempt_ - 1, kBackoffStepCount - 1);
        const int  totalMs  = idx < 0 ? 0 : kBackoffStepsMs[idx];
        const int  remaining = static_cast<int>(std::max<qint64>(0, totalMs - elapsed));
        setNextRetryInMs(remaining);
    });
}

void FeedClient::connectTo(const QUrl& url) {
    url_ = url;
    socket_.open(url_);
}

void FeedClient::onConnected() {
    reconnectTimer_.stop();
    countdownTimer_.stop();
    setNextRetryInMs(0);
    stableTimer_.start(kStableUptimeMs);
    setConnected(true);
}

void FeedClient::onDisconnected() {
    stableTimer_.stop();
    setConnected(false);
    scheduleReconnect();
}

void FeedClient::scheduleReconnect() {
    const auto idx     = std::min(attempt_, kBackoffStepCount - 1);
    const int  delayMs = kBackoffStepsMs[idx];
    attempt_++;
    retryStartedAt_ = QDateTime::currentMSecsSinceEpoch();
    setNextRetryInMs(delayMs);
    countdownTimer_.start();
    reconnectTimer_.start(delayMs);
}

void FeedClient::onTextMessageReceived(const QString& message) {
    const auto doc = QJsonDocument::fromJson(message.toUtf8());
    if (!doc.isObject()) return;
    const auto obj  = doc.object();
    const auto type = obj.value(QStringLiteral("type")).toString();

    if (type == QStringLiteral("trade")) {
        const auto price = obj.value(QStringLiteral("price")).toDouble();
        const auto qty   = static_cast<qulonglong>(obj.value(QStringLiteral("qty")).toDouble());
        lastTrade_ = QStringLiteral("%1 @ %2").arg(qty).arg(price, 0, 'f', 2);
        emit lastTradeChanged();
        emit tradeReceived(price, qty);
    } else if (type == QStringLiteral("book")) {
        const auto bids = levelsToVariant(obj.value(QStringLiteral("bids")).toArray());
        const auto asks = levelsToVariant(obj.value(QStringLiteral("asks")).toArray());
        emit bookReceived(message);
        emit bookUpdated(bids, asks);
    } else if (type == QStringLiteral("stats")) {
        const auto orders = static_cast<qulonglong>(obj.value(QStringLiteral("orders")).toDouble());
        const auto trades = static_cast<qulonglong>(obj.value(QStringLiteral("trades")).toDouble());
        emit statsUpdated(orders, trades);
    }
}

void FeedClient::setConnected(bool value) {
    if (connected_ == value) return;
    connected_ = value;
    emit connectedChanged();
}

void FeedClient::setNextRetryInMs(int ms) {
    if (nextRetryInMs_ == ms) return;
    nextRetryInMs_ = ms;
    emit nextRetryInMsChanged();
}
