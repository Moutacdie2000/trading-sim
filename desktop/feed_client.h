#pragma once

#include <QObject>
#include <QString>
#include <QTimer>
#include <QUrl>
#include <QVariantList>
#include <QtQml/qqmlregistration.h>
#include <QtWebSockets/QWebSocket>

class FeedClient : public QObject {
    Q_OBJECT
    QML_ELEMENT
    Q_PROPERTY(bool connected READ isConnected NOTIFY connectedChanged)
    Q_PROPERTY(QString lastTrade READ lastTrade NOTIFY lastTradeChanged)
    Q_PROPERTY(int nextRetryInMs READ nextRetryInMs NOTIFY nextRetryInMsChanged)

public:
    explicit FeedClient(QObject* parent = nullptr);

    bool isConnected() const { return connected_; }
    QString lastTrade() const { return lastTrade_; }
    int nextRetryInMs() const { return nextRetryInMs_; }

    Q_INVOKABLE void connectTo(const QUrl& url);

signals:
    void connectedChanged();
    void lastTradeChanged();
    void nextRetryInMsChanged();
    void tradeReceived(double price, qulonglong qty);
    void bookReceived(const QString& json);
    void bookUpdated(const QVariantList& bids, const QVariantList& asks);
    void statsUpdated(qulonglong orders, qulonglong trades);

private slots:
    void onConnected();
    void onDisconnected();
    void onTextMessageReceived(const QString& message);

private:
    void setConnected(bool value);
    void setNextRetryInMs(int ms);
    void scheduleReconnect();

    QWebSocket socket_;
    QUrl       url_;
    QTimer     reconnectTimer_;
    QTimer     stableTimer_;
    QTimer     countdownTimer_;
    bool       connected_       = false;
    int        attempt_         = 0;
    int        nextRetryInMs_   = 0;
    qint64     retryStartedAt_  = 0;
    QString    lastTrade_;
};
