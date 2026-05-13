import QtQuick

Item {
    id: root

    property var bids: []
    property var asks: []

    Connections {
        target: feed
        function onBookUpdated(b, a) {
            root.bids = b;
            root.asks = a;
            canvas.requestPaint();
        }
    }

    Rectangle {
        anchors.fill: parent
        color: "#141822"
        radius: 8
    }

    Canvas {
        id: canvas
        anchors.fill: parent
        anchors.margins: 12
        antialiasing: true

        onPaint: {
            const ctx = getContext("2d");
            ctx.reset();

            const W = width;
            const H = height;
            ctx.clearRect(0, 0, W, H);

            if (root.bids.length === 0 || root.asks.length === 0) {
                ctx.fillStyle = "#8a93a6";
                ctx.font = "11px Menlo";
                ctx.textAlign = "center";
                ctx.fillText("waiting for book…", W / 2, H / 2);
                return;
            }

            const sortedBids = root.bids.slice().sort(function(a, b) { return b[0] - a[0]; });
            const sortedAsks = root.asks.slice().sort(function(a, b) { return a[0] - b[0]; });

            let cumB = 0;
            const bidSteps = sortedBids.map(function(l) {
                cumB += Number(l[1]); return { price: Number(l[0]), cum: cumB };
            });
            let cumA = 0;
            const askSteps = sortedAsks.map(function(l) {
                cumA += Number(l[1]); return { price: Number(l[0]), cum: cumA };
            });

            const bestBid = bidSteps[0].price;
            const bestAsk = askSteps[0].price;
            const mid     = (bestBid + bestAsk) / 2;
            const minP    = bidSteps[bidSteps.length - 1].price;
            const maxP    = askSteps[askSteps.length - 1].price;
            const maxQ    = Math.max(cumB, cumA);
            if (maxQ <= 0 || maxP <= minP) return;

            const padBottom = 18;
            const innerH    = H - padBottom;

            function sx(p) { return ((p - minP) / (maxP - minP)) * W; }
            function sy(q) { return innerH - (q / maxQ) * innerH; }

            ctx.beginPath();
            ctx.moveTo(sx(mid), innerH);
            let prev = 0;
            for (let i = 0; i < bidSteps.length; i++) {
                const s = bidSteps[i];
                ctx.lineTo(sx(s.price), sy(prev));
                ctx.lineTo(sx(s.price), sy(s.cum));
                prev = s.cum;
            }
            ctx.lineTo(0, sy(prev));
            ctx.lineTo(0, innerH);
            ctx.closePath();
            ctx.fillStyle = "rgba(74,222,128,0.25)";
            ctx.strokeStyle = "#4ade80";
            ctx.lineWidth = 1;
            ctx.fill();
            ctx.stroke();

            ctx.beginPath();
            ctx.moveTo(sx(mid), innerH);
            prev = 0;
            for (let j = 0; j < askSteps.length; j++) {
                const s = askSteps[j];
                ctx.lineTo(sx(s.price), sy(prev));
                ctx.lineTo(sx(s.price), sy(s.cum));
                prev = s.cum;
            }
            ctx.lineTo(W, sy(prev));
            ctx.lineTo(W, innerH);
            ctx.closePath();
            ctx.fillStyle = "rgba(248,113,113,0.25)";
            ctx.strokeStyle = "#f87171";
            ctx.lineWidth = 1;
            ctx.fill();
            ctx.stroke();

            ctx.beginPath();
            const midX = sx(mid);
            ctx.setLineDash([3, 3]);
            ctx.strokeStyle = "rgba(231,234,240,0.5)";
            ctx.moveTo(midX, 0);
            ctx.lineTo(midX, innerH);
            ctx.stroke();
            ctx.setLineDash([]);

            ctx.fillStyle = "#8a93a6";
            ctx.font = "10px Menlo";
            ctx.textAlign = "left";
            ctx.fillText(minP.toFixed(2), 2, H - 4);
            ctx.textAlign = "right";
            ctx.fillText(maxP.toFixed(2), W - 2, H - 4);
            ctx.textAlign = "center";
            ctx.fillStyle = "#e7eaf0";
            ctx.fillText(mid.toFixed(2), midX, 12);
        }
    }
}
