const http = require("http");
const WebSocket = require("ws");

const PORT = process.env.PORT || 10000;

// 1. Create a standard HTTP server for Render's health check
const server = http.createServer((req, res) => {
  if (req.url === "/health" || req.url === "/") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      status: "ok",
      uptime: process.uptime(),
      circles: Object.keys(circles).length,
    }));
  } else {
    res.writeHead(404);
    res.end("Not found");
  }
});

// 2. Attach WebSocket server to the HTTP server (same port)
const wss = new WebSocket.Server({ server });

// circles = { circleId: Set of clients }
const circles = {};

wss.on("connection", (ws) => {
  console.log("✅ Client connected");

  ws.on("message", (message) => {
    try {
      const data = JSON.parse(message.toString());
      console.log(`📨 [${data.type}] from ${data.userId || 'unknown'} in ${data.circleId || ws.circleId || 'no-circle'}`);
      console.log("   Details:", data);

      switch (data.type) {
        case "ping":
          ws.send(JSON.stringify({ type: "pong" }));
          break;

        case "join_circle":
          ws.circleId = data.circleId;
          if (!circles[data.circleId]) {
            circles[data.circleId] = new Set();
          }
          circles[data.circleId].add(ws);
          console.log(`👥 User joined circle: ${data.circleId}`);
          break;

        case "location_update": {
          const targetCircleId = data.circleId || ws.circleId;
          if (!targetCircleId) {
            console.log("⚠ No circleId for location update from:", data.userId);
            break;
          }

          broadcastToCircle(targetCircleId, {
            type: "location_update",
            userId: data.userId,
            lat: data.lat,
            lng: data.lng,
            speed: data.speed,
            userName: data.userName,
            heading: data.heading,
          });
          break;
        }

        case "location":
          // Legacy/Fallback location update
          console.log("📍 Legacy location update from:", data.user || data.userId);
          broadcastToCircle(ws.circleId, {
            type: "location_update",
            userId: data.userId || data.user,
            lat: data.lat,
            lng: data.lng,
            speed: data.speed,
            userName: data.userName || data.user,
            heading: data.heading || 0,
          });
          break;

        case "route_update":
          broadcastToCircle(data.circleId || ws.circleId, {
            type: "route_update",
            polyline: data.polyline,
          });
          break;

        case "navigation_cancel":
          broadcastToCircle(data.circleId || ws.circleId, {
            type: "navigation_cancel",
          });
          break;

        case "sos_alert":
          broadcastToCircle(data.circleId || ws.circleId, {
            type: "sos_alert",
            userId: data.userId,
            message: data.message,
            alertId: data.alertId,
          });
          break;

        case "sos_resolve":
          broadcastToCircle(data.circleId || ws.circleId, {
            type: "sos_resolve",
            userId: data.userId,
            alertId: data.alertId,
          });
          break;

        default:
          console.log("⚠ Unknown message type:", data.type);
      }
    } catch (err) {
      console.error("❌ Error processing message:", err.message);
    }
  });

  ws.on("close", () => {
    if (ws.circleId && circles[ws.circleId]) {
      circles[ws.circleId].delete(ws);
      if (circles[ws.circleId].size === 0) {
        delete circles[ws.circleId];
      }
    }
    console.log("❌ Client disconnected");
  });
});

function broadcastToCircle(circleId, payload) {
  if (!circleId || !circles[circleId]) return;

  const message = JSON.stringify(payload);
  circles[circleId].forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

// 3. Start the HTTP server (Render will hit this for health checks)
server.listen(PORT, () => {
  console.log(`🚀 WebSocket + HTTP server running on port ${PORT}`);
});
