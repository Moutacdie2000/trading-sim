#include <QGuiApplication>
#include <QQmlApplicationEngine>
#include <QQmlContext>
#include <QUrl>

#include "feed_client.h"

int main(int argc, char* argv[]) {
    QGuiApplication app(argc, argv);

    FeedClient feed;
    feed.connectTo(QUrl(QStringLiteral("ws://localhost:8080/feed")));

    QQmlApplicationEngine engine;
    engine.rootContext()->setContextProperty(QStringLiteral("feed"), &feed);
    engine.loadFromModule(QStringLiteral("trading_desktop"), QStringLiteral("Main"));

    if (engine.rootObjects().isEmpty()) return -1;
    return app.exec();
}
