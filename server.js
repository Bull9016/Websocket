const WebSocket = require("ws");

const PORT = process.env.PORT || 10000;
const wss = new WebSocket.Server({ port: PORT });

console.log(`🚀 WebSocket server running on port ${PORT}`);

// circles = { circleId: Set of clients }
const circles = {};

wss.on("connection", (ws) => {
  console.log("✅ Client connected");

  ws.on("message", (message) => {
    try {
      // Ensure we handle Buffer or String correctly
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

        case "location_update":
          // Modern location update with circle-awareness
          // Priority: 1. data.circleId, 2. ws.circleId
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

        case "location":
          // Legacy/Fallback location update
          console.log("📍 Legacy location update from:", data.user || data.userId);
          broadcastToCircle(ws.circleId, {
            type: "location_update", // Convert to modern type for clients
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
          });
          break;

        case "sos_resolve":
          broadcastToCircle(data.circleId || ws.circleId, {
            type: "sos_resolve",
            userId: data.userId,
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
