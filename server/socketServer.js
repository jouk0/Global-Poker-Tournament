import fs from 'fs';
import express from 'express';
import https from 'https';
import http from 'http'
import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import cors from 'cors';
import path from 'path';
import sqlite3 from 'sqlite3';
import { fileURLToPath } from 'url';
import { betTimer } from './betTimer.js'

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();

// --- HTTPS setup ---
/*
var privateKey = fs.readFileSync(__dirname + '/cert/privkey.pem');
var certificate = fs.readFileSync(__dirname + '/cert/fullchain.pem');
var credentials = { key: privateKey, cert: certificate };
var server = https.createServer(credentials, app);
*/
var server = http.createServer(app)

// --- Socket.IO ---
const io = new Server(server, { cors: { origin: "*" } });

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'client')));

const SECRET = "supersecret";
const rooms = {};
const usersChips = {}
const icons = ['🐶','🦊','🐱','🐸','🐵','🦁','🐯','🦄','🐼','🐷'];

// --- SQLite3 setup ---
const db = new sqlite3.Database(path.join(__dirname,'stats.db'), (err)=>{
    if(err) console.error(err);
    else console.log('Stats DB connected');
});

// Luo taulu, jos ei vielä ole
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS stats (
        key TEXT PRIMARY KEY,
        value INTEGER
    )`);

    // Alusta laskurit (vanhat + uudet)
    const keys = [
        'page_views',
        'total_registered',
        'rooms_created',
        'hands_dealt',
        'total_pot_added',
        'showdowns',

        // Uudet
        'players_connected',
        'players_disconnected',
        'folds',
        'calls',
        'raises',
        'leaveRoom',
        'joinRoom',
        'dealNewHand',
        'dealNextCard',
        'disconnect',
    ];

    keys.forEach(k => {
        db.run(`INSERT OR IGNORE INTO stats (key,value) VALUES (?,0)`, [k]);
    });
});

// --- Stats helpers ---
function incrementStat(key, amount = 1) {
    db.all(`SELECT * FROM stats WHERE key = ${key}`, [], (err, rows) => {
        if(rows) {
            let keyNull = false
            let value = 0
            rows.forEach((row) => {
                if(row.key === key) {
                    if(row.value === null) {
                        keyNull = true
                    } else {
                        value = row.value
                    }
                }
            })
            if(keyNull) {
                db.run(`UPDATE stats SET value = ? WHERE key = ?`, [amount, key]);
            } else {
                db.run(`UPDATE stats SET value = ? + ? WHERE key = ?`, [value, amount, key]);
            }
        } else {
            db.run(`UPDATE stats SET value = value + ? WHERE key = ?`, [amount, key]);
        }
        
    })
}
function sanitizeRoomForPlayer(room, playerId) {
    return {
        name: room.name,
        board: room.board,
        showDown: room.showDown,
        pot: room.pot,
        currentBet: room.currentBet,
        players: Object.fromEntries(
            Object.entries(room.players).map(([id, p]) => [
                id,
                {
                    id: p.id,
                    icon: p.icon,
                    chips: p.chips,
                    folded: p.folded,
                    currentBet: p.currentBet,
                    hand: id === playerId ? p.hand : []
                }
            ])
        )
    };
}
let userData = {};
// --- Socket.IO ---
io.on('connection', socket => {
    socket.on('updateRooms', () => {
        io.emit('updateRoomsFrontend')
    })
    socket.on('initOldPlayer', (token) => {
        if(token !== 'undefined') {
            const decoded = jwt.verify(token, SECRET);
            if(decoded.chips) {
                io.to(socket.id).emit('initOldPlayerFrontend', {
                    token: token,
                    chips: decoded.chips
                })
            } else {
                io.to(socket.id).emit('initOldPlayerFrontend', {
                    token: token,
                    chips: 10000
                })
            }
        }
    })
    socket.on('init', () => {
        let data = {
            id: socket.id,
            chips: 10000
        }
        const token = jwt.sign(data, SECRET);
        userData[socket.id] = data
        io.emit('initialize', {
            token: token
        })
    })
    socket.on('updateChips', (token, roomName) => {
        if(token !== 'undefined') {
            const decoded = jwt.verify(token, SECRET);
            if(decoded) {
                const room = rooms[roomName];
                const chips = room?.players[socket.id].chips
                const newToken = jwt.sign({ id: socket.id, chips: chips }, SECRET);
                Object.keys(room?.players).forEach((playerId) => {
                    io.to(playerId).emit('updateBalance', {
                        token: newToken,
                        chips: (chips) ? chips : 10000
                    })
                })
            }
        }
    })
    socket.on('leaveRoom', (roomName, token) => {
        incrementStat('leaveRoom')
        const room = rooms[roomName.room];
        if(room) {
            let players = {};
            Object.values(room?.players).forEach(p => {
                if(p.id !== socket.id) {
                    players[p.id] = p
                }
            })
            room.players = players
            Object.values(room.players).forEach(p=>{
                io.to(p.id).emit('updateRoom', sanitizeRoomForPlayer(room, p.id));
            });
            io.emit('userLeftRoom', sanitizeRoomForPlayer(room));
            Object.values(room.players).forEach(p=>{
                io.to(p.id).emit('updateFrontPageRooms', {
                    token: token,
                    chips: room?.players[p.id].chips
                })
            });
        }
    })
    socket.on('joinRoom', (roomName, token) => {
        incrementStat('joinRoom')
        if(token !== 'undefined') {
            const decoded = jwt.verify(token, SECRET);
            if(!rooms[roomName]) {
                rooms[roomName] = {
                    name: roomName,
                    players:{},
                    deck: [],
                    board: [],
                    pot: 0,
                    currentBet: 0
                };
            }
    
            const room = rooms[roomName];
            socket.join(roomName);
    
            room.players[socket.id] = {
                id: socket.id,
                icon: icons[Math.floor(Math.random()*icons.length)],
                chips: (decoded.chips) ? decoded.chips : 10000,
                hand: [],
                folded: false,
                currentBet: 0
            };
    
            Object.values(room.players).forEach(p=>{
                io.to(p.id).emit('updateRoom', sanitizeRoomForPlayer(room, p.id));
            });
            const newToken = jwt.sign({ id: socket.id, chips: room?.players[socket.id].chips }, SECRET);
            io.to(socket.id).emit('updateFrontPageRooms', {
                token: newToken,
                chips: room?.players[socket.id].chips
            })
            io.emit('updateRoomsFrontend')
        }
    });
    socket.on('dealNewHand', roomName=>{
        incrementStat('dealNewHand')
        io.emit('startRoom')
        let room = rooms[roomName]
        room.started = true
        room.timer = new betTimer()
        room.timer.dealNewHandTimer(socket, rooms, roomName, io, sanitizeRoomForPlayer, incrementStat)
        
        const newToken = jwt.sign({ id: socket.id, chips: room?.players[socket.id].chips }, SECRET);
        io.to(socket.id).emit('updateFrontPageRooms', {
            token: newToken,
            chips: room?.players[socket.id].chips
        })
    });
    
    socket.on('dealNextCard', roomName => {
        incrementStat('dealNextCard')
        const room = rooms[roomName];
        if (!room) return;
    
        // Ei jaeta liikaa kortteja
        if (room.board.length >= 5) return;
    
        // Varmistetaan että pakassa on kortteja
        if (!Array.isArray(room.deck) || room.deck.length === 0) return;
    
        // Jaetaan seuraava kortti
        const nextCard = room.deck.pop();
        if (!nextCard) return;
    
        room.board.push(nextCard);

        Object.values(room.players).forEach(p=>{
            io.to(p.id).emit('updateRoom', sanitizeRoomForPlayer(room, p.id));
        });
    
        // Lähetä analyysi OIKEALLE pelaajalle
        Object.values(room.players).forEach(p => {
            if (!p.folded) {
                room.timer.runAnalysisInWorker(p, room)
                .then(analysis => {
                    if (analysis) {
                        io.to(p.id).emit('analysis', analysis);
                    }
                })
                .catch(err => {
                    console.error('Analysis worker error:', err);
                });
            }
        });
    });

    socket.on('updateBalanceCall', (data) => {
        console.log(data)
        if(data.token !== 'undefined') {
            const decoded = jwt.verify(data.token, SECRET);
            io.to(socket.id).emit('updateBalanceCallFrontend', {
                data: decoded
            })
        }
    })
    socket.on('playerAction', data => {
        const room = rooms[data.roomName];
        if(!room) return;

        const player = room.players[socket.id];
        if(!player) return;

        if(data.action === 'raise') {
            const amount = parseInt(data.amount);
            if(amount > player.chips) return;

            player.chips -= amount;
            room.pot += amount;
            room.currentBet = Math.max(room.currentBet || 0, amount);
            player.currentBet += amount;

            io.to(data.roomName).emit('log', `${player.icon} raised $${amount}`);
            

            Object.values(room.players).forEach(p=>{
                io.to(p.id).emit('updateRoom', sanitizeRoomForPlayer(room, p.id));
            });
            
            incrementStat('raises');
            //checkNextStep(room);
            
            room.timer.runAnalysisInWorker(player, room)
            .then(analysis => {
                if (analysis) {
                    io.to(player.id).emit('analysis', analysis);
                }
            })
            .catch(err => {
                console.error('Analysis worker error:', err);
            });
        }

        if(data.action === 'call') {
            const toCall = (room.currentBet || 0) - (player.currentBet || 0);
            const callAmount = Math.min(toCall, player.chips);
            player.chips -= callAmount;
            player.currentBet += callAmount;
            room.pot += callAmount;

            io.to(data.roomName).emit('log', `${player.icon} called $${callAmount}`);

            Object.values(room.players).forEach(p=>{
                io.to(p.id).emit('updateRoom', sanitizeRoomForPlayer(room, p.id));
            });

            
            incrementStat('calls');
            //checkNextStep(room);

            room.timer.runAnalysisInWorker(player, room)
            .then(analysis => {
                if (analysis) {
                    io.to(player.id).emit('analysis', analysis);
                }
            })
            .catch(err => {
                console.error('Analysis worker error:', err);
            });
        }

        if(data.action === 'fold') {
            player.folded = true;
            io.to(data.roomName).emit('log', `${player.icon} folded`);
            

            Object.values(room.players).forEach(p=>{
                io.to(p.id).emit('updateRoom', sanitizeRoomForPlayer(room, p.id));
            });
            
            
            room.timer.runAnalysisInWorker(player, room)
            .then(analysis => {
                if (analysis) {
                    io.to(player.id).emit('analysis', analysis);
                    incrementStat('folds');
                    //checkNextStep(room);
                }
            })
            .catch(err => {
                console.error('Analysis worker error:', err);
            });
        }
    });
    socket.on('showdown', roomName => {
        const room = rooms[roomName];
        if(!room) return;
        incrementStat('hands_dealt')
        room.timer.showDownTimer(socket, rooms, roomName, io, sanitizeRoomForPlayer)
        const newToken = jwt.sign({ id: socket.id, chips: room?.players[socket.id].chips }, SECRET);
        io.to(socket.id).emit('updateFrontPageRooms', {
            token: newToken,
            chips: room?.players[socket.id].chips
        })
    });

    socket.on('disconnect', message=>{
        incrementStat('disconnect')
        Object.values(rooms).forEach(room => {
            let players = {};
            Object.values(room.players).forEach((p) => {
                if(p.id !== socket.id) {
                    players[p.id] = p
                }
            })
            room.players = players
            Object.values(room.players).forEach(p=>{
                io.to(p.id).emit('updateRoom', sanitizeRoomForPlayer(room, p.id));
            });
        })
    });
    socket.on('init', () => {
        let data = {
            chips: 10000
        }
        io.to(socket.id).emit('chips', data)
    })
});
app.get('/getBalance', (req, res) => {
    let roomData = []
    Object.keys(rooms).forEach((key) => {
        let room = rooms[key]
        roomData.push({
            name: key,
            playerCount: Object.keys(room.players).length,
            started: room.started
        })
    })
    res.json(roomData)
})
app.get('/rooms', (req, res) => {
    let roomData = []
    Object.keys(rooms).forEach((key) => {
        let room = rooms[key]
        roomData.push({
            name: key,
            playerCount: Object.keys(room.players).length,
            started: room.started
        })
    })
    res.json(roomData)
})
// --- Stats endpoint ---
app.get('/stats', (req, res) => {
    db.all(`SELECT * FROM stats`, [], (err, rows) => {
        if(err) return res.status(500).json({error: err.message});
        const raw = {};
        rows.forEach(r => raw[r.key] = r.value);
        // Johdetut statistiikat
        const derived = {
            avg_pot_per_hand: raw.hands_dealt > 0 
                ? (raw.total_pot_added / raw.hands_dealt).toFixed(2) 
                : 0,

            showdown_rate: raw.hands_dealt > 0 
                ? (raw.showdowns / raw.hands_dealt).toFixed(3) 
                : 0,

            aggression_ratio: (raw.raises + raw.calls) > 0
                ? (raw.raises / (raw.raises + raw.calls)).toFixed(3)
                : 0,

            fold_rate: raw.hands_dealt > 0 
                ? (raw.folds / raw.hands_dealt).toFixed(3)
                : 0,

            active_players_ratio: (raw.players_connected + raw.players_disconnected) > 0
                ? (raw.players_connected / (raw.players_connected + raw.players_disconnected)).toFixed(3)
                : 0
        };

        res.json({ raw, derived });
    });
});

// --- Start server ---
const PORT = 4000;
server.listen(PORT, ()=>console.log(`Server running on port ${PORT}`));