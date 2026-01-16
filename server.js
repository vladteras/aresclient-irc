const WebSocket = require('ws');

const PORT = process.env.PORT || 3000;
const wss = new WebSocket.Server({ port: PORT });

const clients = new Map(); // username -> ws

console.log(`AresGhost IRC Server started on port ${PORT}`);

wss.on('connection', (ws) => {
    let username = null;

    ws.on('message', (data) => {
        try {
            const msg = JSON.parse(data);
            
            switch (msg.type) {
                case 'auth':
                    username = msg.username;
                    clients.set(username, ws);
                    console.log(`${username} connected`);
                    broadcast({
                        type: 'system',
                        message: `${username} присоединился к чату`
                    });
                    break;

                case 'message':
                    if (!username) return;
                    broadcast({
                        type: 'message',
                        username: username,
                        role: msg.role,
                        message: msg.message,
                        timestamp: Date.now()
                    });
                    break;

                case 'ping':
                    ws.send(JSON.stringify({ type: 'pong' }));
                    break;
            }
        } catch (e) {
            console.error('Error:', e);
        }
    });

    ws.on('close', () => {
        if (username) {
            clients.delete(username);
            console.log(`${username} disconnected`);
            broadcast({
                type: 'system',
                message: `${username} покинул чат`
            });
        }
    });
});

function broadcast(msg) {
    const data = JSON.stringify(msg);
    clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(data);
        }
    });
}
