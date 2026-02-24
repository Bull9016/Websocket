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
// messageHistory = { circleId: Array of chatPayloads }
const messageHistory = {};

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

          // Send message history if available
          if (messageHistory[data.circleId]) {
            messageHistory[data.circleId].forEach((msg) => {
              ws.send(JSON.stringify(msg));
            });
          }
          break;

        case "location_update": {
          const targetCircleId = data.circleId || ws.circleId;
          if (!targetCircleId) {
            console.log("⚠ No circleId for location update from:", data.userId);
            break;
          }

          broadcastToCircle(targetCircleId, {
            type: "location_update",
            circleId: targetCircleId,
            userId: data.userId,
            lat: data.lat,
            lng: data.lng,
            speed: data.speed,
            userName: data.userName,
            heading: data.heading,
          }, ws);
          break;
        }

        case "location": {
          const targetCircleId = data.circleId || ws.circleId;
          // Legacy/Fallback location update
          console.log("📍 Legacy location update from:", data.user || data.userId);
          broadcastToCircle(targetCircleId, {
            type: "location_update",
            circleId: targetCircleId,
            userId: data.userId || data.user,
            lat: data.lat,
            lng: data.lng,
            speed: data.speed,
            userName: data.userName || data.user,
            heading: data.heading || 0,
          }, ws);
          break;
        }

        case "route_update": {
          const targetCircleId = data.circleId || ws.circleId;
          broadcastToCircle(targetCircleId, {
            type: "route_update",
            circleId: targetCircleId,
            polyline: data.polyline,
          }, ws);
          break;
        }

        case "navigation_cancel": {
          const targetCircleId = data.circleId || ws.circleId;
          broadcastToCircle(targetCircleId, {
            type: "navigation_cancel",
            circleId: targetCircleId,
          }, ws);
          break;
        }

        case "navigation_invite": {
          const targetCircleId = data.circleId || ws.circleId;
          broadcastToCircle(targetCircleId, {
            type: "navigation_invite",
            circleId: targetCircleId,
            userId: data.userId,
            destinationName: data.destinationName,
            destinationLat: data.destinationLat,
            destinationLng: data.destinationLng,
            polyline: data.polyline,
          }, ws);
          break;
        }

        case "sos_alert": {
          const targetCircleId = data.circleId || ws.circleId;
          broadcastToCircle(targetCircleId, {
            type: "sos_alert",
            circleId: targetCircleId,
            userId: data.userId,
            message: data.message,
            alertId: data.alertId,
          }, ws);
          break;
        }

        case "sos_resolve": {
          const targetCircleId = data.circleId || ws.circleId;
          broadcastToCircle(targetCircleId, {
            type: "sos_resolve",
            circleId: targetCircleId,
            userId: data.userId,
            alertId: data.alertId,
          }, ws);
          break;
        }

        case "chat_message": {
          const targetCircleId = data.circleId || ws.circleId;
          const chatPayload = {
            type: "chat_message",
            circleId: targetCircleId,
            userId: data.userId,
            userName: data.userName,
            content: data.content,
            timestamp: data.timestamp || new Date().toISOString(),
            mediaUrl: data.mediaUrl,
            mediaType: data.mediaType,
          };

          // Store in history
          if (targetCircleId) {
            if (!messageHistory[targetCircleId]) {
              messageHistory[targetCircleId] = [];
            }
            messageHistory[targetCircleId].push(chatPayload);
            if (messageHistory[targetCircleId].length > 50) {
              messageHistory[targetCircleId].shift(); // Keep last 50
            }
          }

          broadcastToCircle(targetCircleId, chatPayload, ws);
          break;
        }

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

function broadcastToCircle(circleId, payload, skipClient = null) {
  if (!circleId || !circles[circleId]) return;

  const message = JSON.stringify(payload);
  circles[circleId].forEach((client) => {
    if (client !== skipClient && client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

// 3. Start the HTTP server (Render will hit this for health checks)
server.listen(PORT, () => {
  console.log(`🚀 WebSocket + HTTP server running on port ${PORT}`);
});
