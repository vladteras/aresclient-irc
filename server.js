const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');

const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('AresClient IRC Server');
});

const wss = new WebSocket.Server({ server });

// База ролей по Discord ID
// Формат: "discord_id": "ROLE"
const rolesDB = {
    // Добавь сюда свой Discord ID как админа
    // "123456789012345678": "ADMIN",
    // "987654321098765432": "YOUTUBE",
    // "111222333444555666": "BETA"
};

// Файл для хранения ролей (чтобы не терялись при рестарте)
const ROLES_FILE = './roles.json';

// Загрузка ролей из файла
function loadRoles() {
    try {
        if (fs.existsSync(ROLES_FILE)) {
            const data = fs.readFileSync(ROLES_FILE, 'utf8');
            Object.assign(rolesDB, JSON.parse(data));
            console.log('Roles loaded:', Object.keys(rolesDB).length);
        }
    } catch (e) {
        console.log('No roles file found, starting fresh');
    }
}

// Сохранение ролей в файл
function saveRoles() {
    try {
        fs.writeFileSync(ROLES_FILE, JSON.stringify(rolesDB, null, 2));
    } catch (e) {
        console.error('Failed to save roles:', e);
    }
}

loadRoles();

const clients = new Map();

wss.on('connection', (ws) => {
    let username = null;
    let discordId = null;
    let role = 'USER';

    ws.on('message', (data) => {
        try {
            const msg = JSON.parse(data.toString());

            switch (msg.type) {
                case 'auth':
                    username = msg.username || 'Anonymous';
                    discordId = msg.discordId || null;
                    
                    // Проверяем роль по Discord ID
                    if (discordId && rolesDB[discordId]) {
                        role = rolesDB[discordId];
                    } else {
                        role = 'USER';
                    }
                    
                    clients.set(ws, { username, discordId, role });
                    
                    // Отправляем роль клиенту
                    ws.send(JSON.stringify({
                        type: 'auth_success',
                        role: role,
                        message: `Авторизован как ${role}`
                    }));
                    
                    // Уведомляем всех о входе
                    broadcast({
                        type: 'system',
                        message: `${username} присоединился к чату`
                    }, ws);
                    
                    console.log(`${username} connected with role ${role}`);
                    break;

                case 'message':
                    if (!username) return;
                    
                    broadcast({
                        type: 'message',
                        username: username,
                        role: role,
                        message: msg.message
                    });
                    break;

                // Админ команды
                case 'admin_set_role':
                    if (role !== 'ADMIN') {
                        ws.send(JSON.stringify({
                            type: 'error',
                            message: 'Недостаточно прав'
                        }));
                        return;
                    }
                    
                    const targetDiscordId = msg.targetDiscordId;
                    const newRole = msg.newRole;
                    
                    if (!targetDiscordId || !newRole) {
                        ws.send(JSON.stringify({
                            type: 'error',
                            message: 'Укажи Discord ID и роль'
                        }));
                        return;
                    }
                    
                    if (!['USER', 'BETA', 'YOUTUBE', 'ADMIN'].includes(newRole)) {
                        ws.send(JSON.stringify({
                            type: 'error',
                            message: 'Неверная роль. Доступны: USER, BETA, YOUTUBE, ADMIN'
                        }));
                        return;
                    }
                    
                    rolesDB[targetDiscordId] = newRole;
                    saveRoles();
                    
                    ws.send(JSON.stringify({
                        type: 'system',
                        message: `Роль ${newRole} выдана Discord ID: ${targetDiscordId}`
                    }));
                    
                    // Обновляем роль если пользователь онлайн
                    clients.forEach((client, clientWs) => {
                        if (client.discordId === targetDiscordId) {
                            client.role = newRole;
                            clientWs.send(JSON.stringify({
                                type: 'role_update',
                                role: newRole,
                                message: `Твоя роль изменена на ${newRole}`
                            }));
                        }
                    });
                    
                    console.log(`Admin ${username} set role ${newRole} for ${targetDiscordId}`);
                    break;

                case 'admin_remove_role':
                    if (role !== 'ADMIN') {
                        ws.send(JSON.stringify({
                            type: 'error',
                            message: 'Недостаточно прав'
                        }));
                        return;
                    }
                    
                    const removeDiscordId = msg.targetDiscordId;
                    
                    if (rolesDB[removeDiscordId]) {
                        delete rolesDB[removeDiscordId];
                        saveRoles();
                        
                        ws.send(JSON.stringify({
                            type: 'system',
                            message: `Роль удалена для Discord ID: ${removeDiscordId}`
                        }));
                    }
                    break;

                case 'admin_list_roles':
                    if (role !== 'ADMIN') {
                        ws.send(JSON.stringify({
                            type: 'error',
                            message: 'Недостаточно прав'
                        }));
                        return;
                    }
                    
                    ws.send(JSON.stringify({
                        type: 'roles_list',
                        roles: rolesDB
                    }));
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
            broadcast({
                type: 'system',
                message: `${username} покинул чат`
            });
            clients.delete(ws);
            console.log(`${username} disconnected`);
        }
    });
});

function broadcast(message, exclude = null) {
    const data = JSON.stringify(message);
    wss.clients.forEach((client) => {
        if (client !== exclude && client.readyState === WebSocket.OPEN) {
            client.send(data);
        }
    });
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`AresClient IRC Server running on port ${PORT}`);
});
