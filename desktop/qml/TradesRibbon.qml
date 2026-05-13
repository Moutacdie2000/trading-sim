import QtQuick
import QtQuick.Controls

Item {
    id: root

    property int maxTrades: 50

    Rectangle {
        anchors.fill: parent
        color: "#141822"
        radius: 8
    }

    ListModel { id: tradesModel }

    Connections {
        target: feed
        function onTradeReceived(price, qty) {
            tradesModel.insert(0, {
                time: Qt.formatTime(new Date(), "HH:mm:ss"),
                qty: Number(qty),
                price: Number(price),
            });
            while (tradesModel.count > root.maxTrades) {
                tradesModel.remove(tradesModel.count - 1);
            }
        }
    }

    Column {
        anchors.fill: parent
        anchors.margins: 12
        spacing: 6

        Label {
            text: "RECENT TRADES"
            color: "#8a93a6"
            font.pixelSize: 11
            font.letterSpacing: 1.2
        }

        ListView {
            id: list
            width: parent.width
            height: parent.height - 24
            clip: true
            model: tradesModel
            spacing: 2

            delegate: Rectangle {
                width: list.width
                height: 18
                color: "transparent"
                Row {
                    anchors.fill: parent
                    Label {
                        text: time
                        color: "#8a93a6"
                        font.pixelSize: 12
                        font.family: "Menlo"
                        width: 80
                    }
                    Item { width: 8; height: 1 }
                    Label {
                        text: qty + " @ " + price.toFixed(2)
                        color: "#e7eaf0"
                        font.pixelSize: 12
                        font.family: "Menlo"
                    }
                }
            }
        }
    }
}
