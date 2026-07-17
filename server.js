// OpenFront Klon – Lobby- und Relay-Server
// Der Server simuliert NICHT das Spiel. Er verwaltet Lobbys und verteilt
// die Spieler-Eingaben (Intents) im 100ms-Takt an alle Clients (Lockstep).
//
// Lockstep bedeutet: Jeder Client rechnet das Spiel selbst und deterministisch
// (gleicher Seed -> gleiches Ergebnis). Der Server sagt nur reihum "Zug N mit
// diesen Eingaben" – dadurch bleiben alle synchron, ohne dass der Server den
// Spielzustand kennt.
const express = require('express');
const http = require('http');
const path = require('path');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 3000;
const TURN_MS = 100;          // Takt: alle 100ms ein Zug (10 Zuege/Sekunde)
const MAX_HUMANS = 5;         // max. menschliche Spieler pro Lobby
const MAX_BOTS = 30;          // Masse-Bots (schwach, Engine-Profil 3)
const MAX_NATIONS = 8;        // Nationen (starke Bots, Level 0-2)
const WEAK_BOT_LEVEL = 3;     // Engine-Profil der Masse-Bots
// Muss zur NATION_NAMES-Liste in public/js/engine.js passen (dort ESM, hier
// CommonJS – deshalb dupliziert). Änderungen beidseitig pflegen!
const NATION_NAMES = [
  '🇩🇪 Deutschland', '🇫🇷 Frankreich', '🇬🇧 England', '🇪🇸 Spanien',
  '🇮🇹 Italien', '🇷🇺 Russland', '🇺🇸 USA', '🇯🇵 Japan',
];
const MAP_SIZES = ['klein', 'mittel', 'gross', 'riesig'];
const MAP_TYPES = ['random', 'world', 'europe', 'asia', 'africa', 'namerica', 'samerica', 'australia'];

// Statischer Webserver: liefert die Dateien aus public/ (Spiel-Client) aus.
const app = express();
// Changelog ausliefern, damit das Menue daraus die "Latest News" bauen kann.
// Liegt im Repo-Root, nicht in public/ – deshalb eine eigene Route.
app.get('/CHANGELOG.md', (_req, res) => res.sendFile(path.join(__dirname, 'CHANGELOG.md')));
app.use(express.static(path.join(__dirname, 'public')));

// WebSocket-Server fuer die Echtzeit-Kommunikation (Lobby + Zuege) auf /ws.
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

/** @type {Map<string, Room>} */
const rooms = new Map();      // Lobby-Code -> Room-Objekt
let nextClientId = 1;         // fortlaufende ID pro verbundenem Client

// Eindeutigen 4-stelligen Lobby-Code erzeugen (ohne verwechselbare Buchstaben
// wie I/O). Wiederholen, bis ein noch nicht vergebener Code gefunden ist.
function makeCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  let c;
  do {
    c = '';
    for (let i = 0; i < 4; i++) c += chars[(Math.random() * chars.length) | 0];
  } while (rooms.has(c));
  return c;
}

// Eine Nachricht (Objekt -> JSON) an einen einzelnen Client senden.
function send(ws, obj) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(obj));
}

// Eine Nachricht an alle Clients eines Rooms senden (einmal serialisieren).
function broadcast(room, obj) {
  const raw = JSON.stringify(obj);
  for (const c of room.clients) {
    if (c.ws.readyState === c.ws.OPEN) c.ws.send(raw);
  }
}

const BOT_ICONS = ['🟢', '🟡', '🔴'];   // Icons je Schwierigkeitsgrad (0/1/2)

// Aktuellen Lobby-Zustand als Nachricht zusammenstellen. Wird nach jeder
// Aenderung an alle gesendet, damit die Lobby-Anzeige ueberall gleich ist.
// Der Host ist per Konvention immer der erste Client (clients[0]).
function lobbyState(room) {
  return {
    t: 'lobby',
    code: room.code,
    players: room.clients.map(c => ({ cid: c.cid, name: c.name, color: c.color || null })),
    hostCid: room.clients.length ? room.clients[0].cid : null,
    bots: room.bots,
    nations: room.nations,
    botLevel: room.botLevel,
    mapType: room.mapType,
    mapSize: room.mapSize,
    started: room.started,
  };
}

// Spielernamen saeubern: trimmen, auf 16 Zeichen kuerzen, leer -> "Spieler".
function cleanName(n) {
  n = String(n || '').trim().slice(0, 16);
  return n || 'Spieler';
}

// Room komplett schliessen (Timer stoppen und aus der Liste entfernen).
function closeRoom(room) {
  if (room.interval) clearInterval(room.interval);
  rooms.delete(room.code);
}

// Zentrale Nachrichtenverarbeitung: je nach Typ (m.t) die passende Aktion.
function handleMessage(ws, m) {
  switch (m.t) {
    // Neue Lobby erstellen: Room anlegen, Ersteller als (Host-)Client eintragen.
    case 'create': {
      if (ws.room) return;   // schon in einer Lobby -> ignorieren
      const room = {
        code: makeCode(),
        clients: [],
        bots: 10,
        nations: 3,
        botLevel: 1,
        mapType: 'random',
        mapSize: 'mittel',
        started: false,      // laeuft gerade ein Spiel?
        turn: 0,             // aktuelle Zugnummer im laufenden Spiel
        pending: [],         // gesammelte Intents fuer den naechsten Zug
        interval: null,      // Timer-Handle der Zug-Schleife
      };
      rooms.set(room.code, room);
      const client = { ws, cid: nextClientId++, name: cleanName(m.name), idx: -1, color: null };
      room.clients.push(client);
      ws.room = room;        // Room/Client am Socket vermerken (Rueckverweis)
      ws.client = client;
      send(ws, { t: 'joined', code: room.code, cid: client.cid });
      broadcast(room, lobbyState(room));
      break;
    }
    // Bestehender Lobby beitreten (per Code). Diverse Absagen moeglich.
    case 'join': {
      if (ws.room) return;
      const room = rooms.get(String(m.code || '').toUpperCase().trim());
      if (!room) return send(ws, { t: 'error', msg: 'Lobby nicht gefunden.' });
      if (room.started) return send(ws, { t: 'error', msg: 'Spiel läuft bereits.' });
      if (room.clients.length >= MAX_HUMANS) return send(ws, { t: 'error', msg: 'Lobby ist voll (max. 5 Spieler).' });
      const client = { ws, cid: nextClientId++, name: cleanName(m.name), idx: -1, color: null };
      room.clients.push(client);
      ws.room = room;
      ws.client = client;
      send(ws, { t: 'joined', code: room.code, cid: client.cid });
      broadcast(room, lobbyState(room));
      break;
    }
    // Lobby-Einstellungen aendern (Bots, Schwierigkeit, Karte, Groesse).
    // Nur der Host darf das und nur solange kein Spiel laeuft.
    case 'cfg': {
      const room = ws.room;
      if (!room || room.started) return;
      if (room.clients[0] !== ws.client) return; // nur Host
      // Werte defensiv begrenzen/pruefen, bevor sie uebernommen werden
      if (m.n !== undefined) room.bots = Math.max(0, Math.min(MAX_BOTS, m.n | 0));
      if (m.nations !== undefined) room.nations = Math.max(0, Math.min(MAX_NATIONS, m.nations | 0));
      if (m.level !== undefined) room.botLevel = Math.max(0, Math.min(2, m.level | 0));
      if (MAP_TYPES.includes(m.mapType)) room.mapType = m.mapType;
      if (MAP_SIZES.includes(m.mapSize)) room.mapSize = m.mapSize;
      broadcast(room, lobbyState(room));
      break;
    }
    // Eigene Spielerfarbe waehlen (jeder Spieler, nur in der Lobby).
    // Ungueltig/null = Automatik; bereits vergebene Farben werden abgelehnt.
    case 'color': {
      const room = ws.room;
      if (!room || room.started) return;
      const c = typeof m.color === 'string' ? m.color.toLowerCase() : null;
      if (c && !/^#[0-9a-f]{6}$/.test(c)) return;
      if (c && room.clients.some(cl => cl !== ws.client && cl.color === c)) return;
      ws.client.color = c;
      broadcast(room, lobbyState(room));
      break;
    }
    // Spiel starten (nur Host): Spielerliste + Bots festlegen, gemeinsamen Seed
    // an alle schicken und die Zug-Schleife starten.
    case 'start': {
      const room = ws.room;
      if (!room || room.started) return;
      if (room.clients[0] !== ws.client) return; // nur Host
      room.started = true;
      // Menschliche Spieler bekommen ihren Index (idx) = Reihenfolge in clients
      const players = room.clients.map((c, i) => {
        c.idx = i;
        return { name: c.name, bot: false, color: c.color || undefined };
      });
      // Nationen (starke Bots, Schwierigkeit aus der Lobby) und dahinter die
      // vielen schwachen Masse-Bots anhaengen
      for (let i = 0; i < room.nations; i++) {
        players.push({ name: `${NATION_NAMES[i % NATION_NAMES.length]} ${BOT_ICONS[room.botLevel]}`, bot: true, level: room.botLevel });
      }
      for (let i = 0; i < room.bots; i++) {
        players.push({ name: `Bot ${i + 1}`, bot: true, level: WEAK_BOT_LEVEL });
      }
      // Gemeinsamer Seed -> alle Clients erzeugen dieselbe Karte/Simulation
      const seed = (Math.random() * 0x7fffffff) | 0;
      broadcast(room, { t: 'start', seed, players, mapType: room.mapType, mapSize: room.mapSize });
      // Zug-Schleife: alle 100ms die gesammelten Intents als "Zug" verteilen.
      room.interval = setInterval(() => {
        broadcast(room, { t: 'turn', n: room.turn++, intents: room.pending });
        room.pending = [];   // Puffer fuer den naechsten Zug leeren
      }, TURN_MS);
      break;
    }
    // Spieler-Eingabe (Angriff, Boot, Bauen, Allianz …) fuer den naechsten Zug
    // sammeln. Der Server prueft nur grob die Felder; die Spiellogik entscheidet.
    case 'intent': {
      const room = ws.room;
      if (!room || !room.started || !m.d) return;
      const d = m.d;
      // Nur bekannte Felder durchreichen (nichts Fremdes in die Simulation lassen)
      const intent = { p: ws.client.idx, type: String(d.type || '') };
      if (typeof d.target === 'number') intent.target = d.target | 0;
      if (typeof d.ratio === 'number') intent.ratio = Math.max(0.01, Math.min(1, d.ratio));
      if (typeof d.cell === 'number') intent.cell = d.cell | 0;
      // Kriegsschiff-ID fuer 'warship_move' (Feldname muss zu engine.js passen)
      if (typeof d.ship === 'number') intent.ship = d.ship | 0;
      if (typeof d.kind === 'string') {
        intent.kind = ['city', 'fort', 'port', 'factory'].includes(d.kind) ? d.kind : 'city';
      }
      room.pending.push(intent);
      break;
    }
    // Nach Spielende: Room in den Lobby-Zustand zurücksetzen, damit alle
    // (Sieger wie Verlierer) gemeinsam in derselben Lobby landen und eine
    // neue Runde starten können. Darf jeder auslösen; der !started-Guard
    // macht doppelte Klicks (zwei Spieler klicken gleichzeitig) harmlos.
    case 'returnLobby': {
      const room = ws.room;
      if (!room || !room.started) return;
      if (room.interval) { clearInterval(room.interval); room.interval = null; }
      room.started = false;
      room.turn = 0;
      room.pending = [];
      for (const c of room.clients) c.idx = -1; // Spielplätze für neue Runde freigeben
      broadcast(room, lobbyState(room));        // started:false -> Clients zeigen wieder die Lobby
      break;
    }
    // Freiwilliges Verlassen (Button): wie ein Verbindungsabbruch behandeln.
    case 'leave': {
      handleClose(ws);
      break;
    }
  }
}

// Aufraeumen, wenn ein Client die Verbindung verliert oder verlaesst.
function handleClose(ws) {
  const room = ws.room;
  if (!room) return;
  ws.room = null;
  const i = room.clients.indexOf(ws.client);
  if (i >= 0) room.clients.splice(i, 1);
  if (room.clients.length === 0) {
    closeRoom(room);   // niemand mehr da -> Room schliessen
    return;
  }
  if (room.started) {
    // Spieler wird im Spiel von einem Bot übernommen: ein 'leave'-Intent sorgt
    // dafuer, dass die Clients sein Reich an die KI uebergeben.
    if (ws.client.idx >= 0) room.pending.push({ p: ws.client.idx, type: 'leave' });
  } else {
    broadcast(room, lobbyState(room));   // in der Lobby: Liste aktualisieren
  }
}

// Neue WebSocket-Verbindung: Handler fuer Nachrichten, Schliessen und Keepalive.
wss.on('connection', ws => {
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });   // Antwort auf unseren Ping
  ws.on('message', raw => {
    let m;
    try { m = JSON.parse(raw); } catch { return; }   // ungueltiges JSON ignorieren
    if (m && typeof m === 'object') handleMessage(ws, m);
  });
  ws.on('close', () => handleClose(ws));
  ws.on('error', () => {});
});

// Keepalive: verhindert, dass Proxies (z.B. bei Cloud-Hosting) stille
// Verbindungen trennen, und räumt tote Verbindungen auf. Wer auf den letzten
// Ping nicht mit 'pong' geantwortet hat (isAlive === false), fliegt raus.
setInterval(() => {
  for (const ws of wss.clients) {
    if (ws.isAlive === false) { ws.terminate(); continue; }
    ws.isAlive = false;
    ws.ping();
  }
}, 30000);

// Server starten und auf allen Netzwerk-Interfaces (0.0.0.0) lauschen, damit
// Freunde im gleichen Netzwerk ueber die IP beitreten koennen.
server.listen(PORT, '0.0.0.0', () => {
  console.log(`OpenFront Klon läuft auf http://localhost:${PORT}`);
  console.log('Freunde im gleichen Netzwerk: http://<deine-IP>:' + PORT);
});
