const WebSocket = require('ws');
const http = require('http');

const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Radar WebSocket Server v2.0 - All message types supported');
});

const wss = new WebSocket.Server({ server });

// Room-based broadcasting
// rooms = { circleId: Set<ws> }
const rooms = new Map();
// Track which circle each connection belongs to
const clientRooms = new Map();

wss.on('connection', (ws) => {
    console.log(`🟢 Client connected. Total: ${wss.clients.size}`);

    ws.on('message', (raw) => {
        try {
            const data = JSON.parse(raw);
            const type = (data.type || '').toLowerCase().trim();
            const circleId = (data.circleId || '').trim();

            if (!type) return;

            switch (type) {
                case 'join_circle': {
                    // Track room membership
                    if (!rooms.has(circleId)) rooms.set(circleId, new Set());
                    rooms.get(circleId).add(ws);
                    clientRooms.set(ws, circleId);

                    const userName = data.userName || data.userId || 'Unknown';
                    console.log(`📡 ${userName} joined circle ${circleId} (${rooms.get(circleId).size} members)`);

                    // Notify other members
                    broadcast(circleId, {
                        type: 'member_joined',
                        circleId,
                        userId: data.userId,
                        userName,
                    }, ws);
                    break;
                }

                case 'leave_circle': {
                    if (rooms.has(circleId)) {
                        rooms.get(circleId).delete(ws);
                        if (rooms.get(circleId).size === 0) rooms.delete(circleId);
                    }
                    clientRooms.delete(ws);

                    console.log(`📡 ${data.userId} left circle ${circleId}`);

                    broadcast(circleId, {
                        type: 'member_left',
                        circleId,
                        userId: data.userId,
                    }, ws);
                    break;
                }

                case 'location': {
                    // Broadcast location to all members in same circle (except sender)
                    broadcast(circleId, data, ws);
                    break;
                }

                case 'set_navigation':
                case 'cancel_navigation': {
                    // Navigation events: broadcast to ALL members including sender
                    console.log(`🧭 Nav event: ${type} in circle ${circleId}`);
                    broadcast(circleId, data, null); // null = include sender
                    break;
                }

                case 'sos_alert': {
                    // SOS: broadcast to ALL members INCLUDING sender (sender needs confirmation)
                    console.log(`🚨 SOS ALERT from ${data.userName || data.userId} in circle ${circleId}`);
                    broadcast(circleId, data, null); // Include sender so they see their own alert
                    break;
                }

                case 'sos_resolve': {
                    // SOS resolve: broadcast to ALL members INCLUDING sender
                    console.log(`✅ SOS RESOLVED by ${data.userId} in circle ${circleId}`);
                    broadcast(circleId, data, null);
                    break;
                }

                case 'ride_command': {
                    // Ride commands: broadcast to all members EXCEPT sender
                    console.log(`🎮 Ride command "${data.command}" from ${data.sender_name} in circle ${circleId}`);
                    broadcast(circleId, data, ws); // Exclude sender
                    break;
                }

                case 'chat_message': {
                    // Chat: broadcast to all members EXCEPT sender
                    console.log(`💬 Chat from ${data.userName} in circle ${circleId}`);
                    broadcast(circleId, data, ws);
                    break;
                }

                default: {
                    // FORWARD ANY UNKNOWN TYPES to the circle (future-proof)
                    console.log(`📤 Forwarding unknown type '${type}' in circle ${circleId}`);
                    broadcast(circleId, data, ws);
                    break;
                }
            }
        } catch (e) {
            console.error('❌ Error parsing message:', e.message);
        }
    });

    ws.on('close', () => {
        // Clean up room membership
        const circleId = clientRooms.get(ws);
        if (circleId && rooms.has(circleId)) {
            rooms.get(circleId).delete(ws);
            if (rooms.get(circleId).size === 0) rooms.delete(circleId);
        }
        clientRooms.delete(ws);
        console.log(`🔴 Client disconnected. Total: ${wss.clients.size}`);
    });

    ws.on('error', (err) => {
        console.error('❌ WebSocket error:', err.message);
    });
});

/**
 * Broadcast a message to all clients in a room.
 * @param {string} circleId - The room/circle to broadcast to
 * @param {object} data - The message data to send
 * @param {WebSocket|null} exclude - Client to exclude (null = include everyone)
 */
function broadcast(circleId, data, exclude) {
    if (!circleId || !rooms.has(circleId)) return;

    const message = JSON.stringify(data);
    let sent = 0;

    for (const client of rooms.get(circleId)) {
        if (client !== exclude && client.readyState === WebSocket.OPEN) {
            client.send(message);
            sent++;
        }
    }
}

// Health check logging
setInterval(() => {
    let totalClients = 0;
    for (const [circleId, members] of rooms) {
        totalClients += members.size;
    }
    console.log(`📊 Rooms: ${rooms.size}, Total clients: ${totalClients}`);
}, 60000);

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
    console.log(`🚀 Radar WebSocket Server v2.0 listening on port ${PORT}`);
    console.log(`   Supported types: location, join_circle, leave_circle,`);
    console.log(`   set_navigation, cancel_navigation, sos_alert, sos_resolve,`);
    console.log(`   ride_command, chat_message + any future types`);
});
