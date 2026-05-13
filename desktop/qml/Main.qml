import QtQuick
import QtQuick.Controls
import QtQuick.Layouts

ApplicationWindow {
    width: 960
    height: 640
    visible: true
    title: qsTr("trading-sim desktop")
    color: "#0b0d12"

    ColumnLayout {
        anchors.fill: parent
        anchors.margins: 16
        spacing: 12

        RowLayout {
            Label {
                text: "trading-sim"
                color: "#e7eaf0"
                font.pixelSize: 20
                font.letterSpacing: 1
            }
            Rectangle {
                radius: 12
                color: feed.connected ? "#1c3a26" : "#3a1c1c"
                Layout.preferredHeight: 22
                Layout.preferredWidth: 82
                Label {
                    anchors.centerIn: parent
                    text: feed.connected ? "live" : "reconnecting"
                    color: feed.connected ? "#22c55e" : "#ef4444"
                    font.pixelSize: 11
                }
            }
            Label {
                visible: !feed.connected && feed.nextRetryInMs > 0
                text: "in " + Math.max(1, Math.ceil(feed.nextRetryInMs / 1000)) + "s"
                color: "#8a93a6"
                font.pixelSize: 11
            }
            Item { Layout.fillWidth: true }
        }

        SplitView {
            Layout.fillWidth: true
            Layout.fillHeight: true
            orientation: Qt.Vertical

            DepthView {
                SplitView.preferredHeight: parent.height * 0.6
                SplitView.minimumHeight: 120
            }

            TradesRibbon {
                SplitView.preferredHeight: parent.height * 0.4
                SplitView.minimumHeight: 80
            }
        }

        Rectangle {
            Layout.fillWidth: true
            Layout.preferredHeight: 28
            color: "#141822"
            radius: 6
            RowLayout {
                anchors.fill: parent
                anchors.leftMargin: 12
                anchors.rightMargin: 12
                Label {
                    text: feed.connected ? "live" : "reconnecting"
                    color: feed.connected ? "#22c55e" : "#ef4444"
                    font.pixelSize: 11
                }
                Item { Layout.fillWidth: true }
                Label {
                    text: feed.lastTrade.length > 0 ? "last: " + feed.lastTrade : "last: —"
                    color: "#e7eaf0"
                    font.pixelSize: 12
                    font.family: "Menlo"
                }
            }
        }
    }
}
