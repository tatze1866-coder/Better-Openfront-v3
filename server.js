// OpenFront Klon – Lobby- und Relay-Server
// Der Server simuliert NICHT das Spiel. Er verwaltet Lobbys und verteilt
// die Spieler-Eingaben (Intents) im 100ms-Takt an alle Clients (Lockstep).
const express = require('express');
const http = require('http');
const path = require('path');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 3000;
const TURN_MS = 100;
const MAX_HUMANS = 5;
const MAX_BOTS = 15;
const MAP_SIZES = ['klein', 'mittel', 'gross'];
const MAP_TYPES = ['random', 'world', 'europe', 'asia', 'africa', 'namerica', 'samerica', 'australia'];

const app = express();
app.use(express.static(path.join(__dirname, 'public')));

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

/** @type {Map<string, Room>} */
const rooms = new Map();
let nextClientId = 1;

function makeCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  let c;
  do {
    c = '';
    for (let i = 0; i < 4; i++) c += chars[(Math.random() * chars.length) | 0];
  } while (rooms.has(c));
  return c;
}

function send(ws, obj) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(obj));
}

function broadcast(room, obj) {
  const raw = JSON.stringify(obj);
  for (const c of room.clients) {
    if (c.ws.readyState === c.ws.OPEN) c.ws.send(raw);
  }
}

const BOT_ICONS = ['🟢', '🟡', '🔴'];

function lobbyState(room) {
  return {
    t: 'lobby',
    code: room.code,
    players: room.clients.map(c => ({ cid: c.cid, name: c.name })),
    hostCid: room.clients.length ? room.clients[0].cid : null,
    bots: room.bots,
    botLevel: room.botLevel,
    mapType: room.mapType,
    mapSize: room.mapSize,
    started: room.started,
  };
}

function cleanName(n) {
  n = String(n || '').trim().slice(0, 16);
  return n || 'Spieler';
}

function closeRoom(room) {
  if (room.interval) clearInterval(room.interval);
  rooms.delete(room.code);
}

function handleMessage(ws, m) {
  switch (m.t) {
    case 'create': {
      if (ws.room) return;
      const room = {
        code: makeCode(),
        clients: [],
        bots: 3,
        botLevel: 1,
        mapType: 'random',
        mapSize: 'mittel',
        started: false,
        turn: 0,
        pending: [],
        interval: null,
      };
      rooms.set(room.code, room);
      const client = { ws, cid: nextClientId++, name: cleanName(m.name), idx: -1 };
      room.clients.push(client);
      ws.room = room;
      ws.client = client;
      send(ws, { t: 'joined', code: room.code, cid: client.cid });
      broadcast(room, lobbyState(room));
      break;
    }
    case 'join': {
      if (ws.room) return;
      const room = rooms.get(String(m.code || '').toUpperCase().trim());
      if (!room) return send(ws, { t: 'error', msg: 'Lobby nicht gefunden.' });
      if (room.started) return send(ws, { t: 'error', msg: 'Spiel läuft bereits.' });
      if (room.clients.length >= MAX_HUMANS) return send(ws, { t: 'error', msg: 'Lobby ist voll (max. 5 Spieler).' });
      const client = { ws, cid: nextClientId++, name: cleanName(m.name), idx: -1 };
      room.clients.push(client);
      ws.room = room;
      ws.client = client;
      send(ws, { t: 'joined', code: room.code, cid: client.cid });
      broadcast(room, lobbyState(room));
      break;
    }
    case 'cfg': {
      const room = ws.room;
      if (!room || room.started) return;
      if (room.clients[0] !== ws.client) return; // nur Host
      if (m.n !== undefined) room.bots = Math.max(0, Math.min(MAX_BOTS, m.n | 0));
      if (m.level !== undefined) room.botLevel = Math.max(0, Math.min(2, m.level | 0));
      if (MAP_TYPES.includes(m.mapType)) room.mapType = m.mapType;
      if (MAP_SIZES.includes(m.mapSize)) room.mapSize = m.mapSize;
      broadcast(room, lobbyState(room));
      break;
    }
    case 'start': {
      const room = ws.room;
      if (!room || room.started) return;
      if (room.clients[0] !== ws.client) return; // nur Host
      room.started = true;
      const players = room.clients.map((c, i) => {
        c.idx = i;
        return { name: c.name, bot: false };
      });
      for (let i = 0; i < room.bots; i++) {
        players.push({ name: `Bot ${i + 1} ${BOT_ICONS[room.botLevel]}`, bot: true, level: room.botLevel });
      }
      const seed = (Math.random() * 0x7fffffff) | 0;
      broadcast(room, { t: 'start', seed, players, mapType: room.mapType, mapSize: room.mapSize });
      room.interval = setInterval(() => {
        broadcast(room, { t: 'turn', n: room.turn++, intents: room.pending });
        room.pending = [];
      }, TURN_MS);
      break;
    }
    case 'intent': {
      const room = ws.room;
      if (!room || !room.started || !m.d) return;
      const d = m.d;
      // Nur bekannte Felder durchreichen
      const intent = { p: ws.client.idx, type: String(d.type || '') };
      if (typeof d.target === 'number') intent.target = d.target | 0;
      if (typeof d.ratio === 'number') intent.ratio = Math.max(0.01, Math.min(1, d.ratio));
      if (typeof d.cell === 'number') intent.cell = d.cell | 0;
      if (typeof d.kind === 'string') {
        intent.kind = ['city', 'fort', 'port', 'factory'].includes(d.kind) ? d.kind : 'city';
      }
      room.pending.push(intent);
      break;
    }
    case 'leave': {
      handleClose(ws);
      break;
    }
  }
}

function handleClose(ws) {
  const room = ws.room;
  if (!room) return;
  ws.room = null;
  const i = room.clients.indexOf(ws.client);
  if (i >= 0) room.clients.splice(i, 1);
  if (room.clients.length === 0) {
    closeRoom(room);
    return;
  }
  if (room.started) {
    // Spieler wird im Spiel von einem Bot übernommen
    if (ws.client.idx >= 0) room.pending.push({ p: ws.client.idx, type: 'leave' });
  } else {
    broadcast(room, lobbyState(room));
  }
}

wss.on('connection', ws => {
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
  ws.on('message', raw => {
    let m;
    try { m = JSON.parse(raw); } catch { return; }
    if (m && typeof m === 'object') handleMessage(ws, m);
  });
  ws.on('close', () => handleClose(ws));
  ws.on('error', () => {});
});

// Keepalive: verhindert, dass Proxies (z.B. bei Cloud-Hosting) stille
// Verbindungen trennen, und räumt tote Verbindungen auf.
setInterval(() => {
  for (const ws of wss.clients) {
    if (ws.isAlive === false) { ws.terminate(); continue; }
    ws.isAlive = false;
    ws.ping();
  }
}, 30000);

server.listen(PORT, '0.0.0.0', () => {
  console.log(`OpenFront Klon läuft auf http://localhost:${PORT}`);
  console.log('Freunde im gleichen Netzwerk: http://<deine-IP>:' + PORT);
});
