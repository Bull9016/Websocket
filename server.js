const { WebSocketServer } = require('ws');
const http = require('http');

// Port for Render or local dev
const PORT = process.env.PORT || 8080;

// Create a simple HTTP server to satisfy Render's health checks
const server = http.createServer((req, res) => {
    if (req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('OK');
    } else {
        res.writeHead(404);
        res.end();
    }
});

const wss = new WebSocketServer({ server });

// Map to store clients by circleId
// Using a Set for each circleId to store WebSocket connections
const circles = new Map();

wss.on('connection', (ws) => {
    console.log(' New client connected');

    let currentCircleId = null;
    let currentUserId = null;

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);

            switch (data.type) {
                case 'join':
                    handleJoin(ws, data);
                    break;
                case 'location':
                    handleLocation(ws, data);
                    break;
                default:
                    console.log(` Unknown message type: ${data.type}`);
            }
        } catch (e) {
            console.error(' Error processing message:', e.message);
        }
    });

    ws.on('close', () => {
        console.log(` Client disconnected: ${currentUserId || 'Unknown'}`);
        if (currentCircleId && circles.has(currentCircleId)) {
            circles.get(currentCircleId).delete(ws);
            if (circles.get(currentCircleId).size === 0) {
                circles.delete(currentCircleId);
            }
        }
    });

    function handleJoin(socket, data) {
        const { circleId, userId } = data;
        if (!circleId || !userId) return;

        currentCircleId = circleId;
        currentUserId = userId;

        if (!circles.has(circleId)) {
            circles.set(circleId, new Set());
        }
        circles.get(circleId).add(socket);

        console.log(` User ${userId} joined circle ${circleId}`);
    }

    function handleLocation(socket, data) {
        const { circleId, data: locationData } = data;
        if (!circleId || !locationData) return;

        // Broadcast to everyone in the same circle EXCEPT the sender
        if (circles.has(circleId)) {
            const message = JSON.stringify({
                type: 'location',
                data: locationData
            });

            circles.get(circleId).forEach((client) => {
                if (client !== socket && client.readyState === 1) { // 1 = OPEN
                    client.send(message);
                }
            });
        }
    }
});

server.listen(PORT, () => {
    console.log(`🚀 WebSocket server running on port ${PORT}`);
});
