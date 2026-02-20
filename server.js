wss.on("connection", (ws) => {
  console.log("✅ Client connected");

  ws.on("message", (message) => {
    try {
      const data = JSON.parse(message.toString());
      console.log("📨 Received:", data);

      switch (data.type) {

        case "ping":
          ws.send(JSON.stringify({ type: "pong" }));
          break;

        case "location":
          console.log("📍 Location update from:", data.user);

          // Broadcast to other clients
          wss.clients.forEach((client) => {
            if (client !== ws && client.readyState === WebSocket.OPEN) {
              client.send(JSON.stringify({
                type: "location",
                user: data.user,
                lat: data.lat,
                lng: data.lng,
                speed: data.speed
              }));
            }
          });
          break;

        default:
          console.log("⚠ Unknown message type:", data.type);
      }

    } catch (err) {
      console.log("❌ Invalid JSON:", message.toString());
    }
  });

  ws.on("close", () => {
    console.log("❌ Client disconnected");
  });
});
