// Client: Menü, Lobby, Netzwerk und Spielschleife.
// Offline: lokale Turn-Schleife. Online: Server sendet alle 100ms die
// gesammelten Intents – beide Wege füttern dieselbe Engine.
import { Game, TURN_MS, SPAWN_TURNS, BUILD_COSTS, WARSHIP_COST, MAX_BOATS, BOT_LEVELS, WEAK_BOT_LEVEL, NATION_NAMES, MAP_SIZES, MAP_TYPES, GROWTH_PEAK } from './engine.js';
import { Renderer } from './renderer.js';

const $ = id => document.getElementById(id);

// Die drei Vollbild-"Screens": Menue, Lobby, Spiel. Immer genau einer ist aktiv.
const screens = { menu: $('menu'), lobby: $('lobby'), game: $('game') };
// Genau einen Screen sichtbar schalten (per CSS-Klasse 'active').
function showScreen(name) {
  for (const [k, el] of Object.entries(screens)) el.classList.toggle('active', k === name);
}

// ---------- Zustand ----------
let game = null;
let renderer = null;
let myIdx = 0;
let online = false;
let ws = null;
let myCid = null;
let isHost = false;
let localInterval = null;
let localPending = [];
let turnQueue = [];
let deadShown = false;
let buildMode = null; // null | 'city' | 'fort'
let seenAllyRequests = new Set();
let lastLobbyPlayers = [];

// Vom Nutzer eingegebener Name (leer -> "Spieler", auf 16 Zeichen gekuerzt).
function playerName() {
  return ($('nameInput').value.trim() || 'Spieler').slice(0, 16);
}

// ---------- Menü ----------
let soloLevel = 1, lobbyLevel = 1;

// Karten- und Größen-Auswahlfelder befüllen
for (const selId of ['soloMap', 'lobbyMap']) {
  const sel = $(selId);
  for (const t of MAP_TYPES) {
    const o = document.createElement('option');
    o.value = t.id;
    o.textContent = t.name;
    sel.appendChild(o);
  }
}
for (const selId of ['soloSize', 'lobbySize']) {
  const sel = $(selId);
  for (const [id, s] of Object.entries(MAP_SIZES)) {
    const o = document.createElement('option');
    o.value = id;
    o.textContent = `${s.name} (${s.w}×${s.h})`;
    sel.appendChild(o);
  }
  sel.value = 'mittel';
}

// "Neuigkeiten" im Menü aus dem CHANGELOG bauen. Es wird der jüngste
// Versionsblock genommen und pro Aufzählungspunkt die fettgedruckte
// Kurzüberschrift (**...**) angezeigt. Der Server liefert CHANGELOG.md über
// eine eigene Route aus (siehe server.js). Die Versionsnummer daneben zeigt,
// welchen Stand der Server gerade ausliefert – praktisch, um nach einem Deploy
// zu prüfen, ob die neue Version wirklich online ist.
async function loadNews() {
  const list = $('newsList');
  try {
    const res = await fetch('CHANGELOG.md', { cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const text = await res.text();

    // Ersten Versionsblock herausschneiden: von "## [x.y.z] – Datum" bis zur
    // nächsten "## "-Überschrift.
    const head = text.match(/^##\s*\[([^\]]+)\]([^\n]*)$/m);
    if (!head) throw new Error('Kein Versionsblock gefunden');
    const version = head[1];
    const date = (head[2].match(/[0-9]{4}-[0-9]{2}-[0-9]{2}/) || [''])[0];
    const rest = text.slice(head.index + head[0].length);
    const block = rest.split(/^##\s/m)[0];

    // Fette Kurzüberschrift je Aufzählungspunkt "- **Titel**: ..." sammeln;
    // fehlt das Fettgedruckte, den Text bis zum Doppelpunkt nehmen.
    const items = [];
    for (const m of block.matchAll(/^\s*[-*]\s+(.*)$/gm)) {
      const bold = m[1].match(/\*\*(.+?)\*\*/);
      let label = bold ? bold[1] : m[1].split(':')[0];
      label = label.replace(/\*\*/g, '').replace(/`/g, '').trim();
      if (label) items.push(label);
    }

    $('newsVersion').textContent = 'v' + version;
    list.innerHTML = '';
    for (let i = 0; i < items.length && i < 5; i++) {
      const li = document.createElement('li');
      const ico = document.createElement('i');
      ico.textContent = '◆';
      const span = document.createElement('span');
      span.textContent = items[i];       // textContent = sicher gegen HTML
      li.append(ico, span);
      if (i === 0) {
        const badge = document.createElement('b');
        badge.className = 'badge-new';
        badge.textContent = 'NEU';
        li.appendChild(badge);
      }
      list.appendChild(li);
    }
    if (date) {
      const d = document.createElement('div');
      d.className = 'news-date';
      d.textContent = date;
      list.appendChild(d);
    }
  } catch (err) {
    // Fällt der Abruf aus, bleibt eine dezente Meldung statt Platzhalter-Fakes.
    $('newsVersion').textContent = '';
    list.innerHTML = '';
    const li = document.createElement('li');
    li.innerHTML = '<i>◆</i><span>Neuigkeiten nicht verfügbar</span>';
    list.appendChild(li);
    console.warn('Neuigkeiten konnten nicht geladen werden:', err.message);
  }
}
loadNews();

// Host sendet die komplette Lobby-Konfiguration bei jeder Änderung
function sendCfg() {
  if (isHost && ws) {
    wsSend({
      t: 'cfg',
      n: +$('lobbyBots').value,
      nations: +$('lobbyNations').value,
      level: lobbyLevel,
      mapType: $('lobbyMap').value,
      mapSize: $('lobbySize').value,
    });
  }
}
$('lobbyMap').addEventListener('change', sendCfg);
$('lobbySize').addEventListener('change', sendCfg);

function wireSeg(segId, onChange) {
  const seg = $(segId);
  seg.addEventListener('click', e => {
    const btn = e.target.closest('button[data-level]');
    if (!btn || btn.disabled) return;
    setSeg(segId, +btn.dataset.level);
    onChange(+btn.dataset.level);
  });
}
function setSeg(segId, level) {
  for (const b of $(segId).querySelectorAll('button')) {
    b.classList.toggle('sel', +b.dataset.level === level);
  }
}
wireSeg('soloLevelSeg', l => { soloLevel = l; });
wireSeg('lobbyLevelSeg', l => {
  lobbyLevel = l;
  sendCfg();
});

$('botCount').addEventListener('input', e => { $('botCountLabel').textContent = e.target.value; });
$('nationCount').addEventListener('input', e => { $('nationCountLabel').textContent = e.target.value; });
$('lobbyBots').addEventListener('input', e => {
  $('lobbyBotsLabel').textContent = e.target.value;
  sendCfg();
});
$('lobbyNations').addEventListener('input', e => {
  $('lobbyNationsLabel').textContent = e.target.value;
  sendCfg();
});

$('btnSolo').addEventListener('click', () => {
  const bots = +$('botCount').value;
  const nations = +$('nationCount').value;
  const players = [{ name: playerName(), bot: false }];
  // Nationen: wenige, stark (Schwierigkeit aus dem Menü), mit Ländernamen
  for (let i = 0; i < nations; i++) {
    players.push({ name: `${NATION_NAMES[i % NATION_NAMES.length]} ${BOT_LEVELS[soloLevel].icon}`, bot: true, level: soloLevel });
  }
  // Masse-Bots: viele, absichtlich schwach (festes Profil)
  for (let i = 0; i < bots; i++) {
    players.push({ name: `Bot ${i + 1}`, bot: true, level: WEAK_BOT_LEVEL });
  }
  const seed = (Math.random() * 0x7fffffff) | 0;
  startGame(seed, players, 0, false, { mapType: $('soloMap').value, mapSize: $('soloSize').value });
});

$('btnCreate').addEventListener('click', () => connectAnd(() => wsSend({ t: 'create', name: playerName() })));
$('btnJoin').addEventListener('click', () => {
  const code = $('codeInput').value.trim().toUpperCase();
  if (code.length !== 4) return showMenuError('Bitte 4-stelligen Code eingeben.');
  connectAnd(() => wsSend({ t: 'join', code, name: playerName() }));
});

function showMenuError(msg) {
  const el = $('menuError');
  el.textContent = msg;
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 4000);
}

// ---------- Lobby ----------
$('btnStart').addEventListener('click', () => wsSend({ t: 'start' }));
$('btnLeaveLobby').addEventListener('click', () => {
  if (ws) { ws.close(); ws = null; }
  showScreen('menu');
});
$('btnBackToMenu').addEventListener('click', () => {
  stopLocalLoop();
  if (ws) { ws.close(); ws = null; }
  game = null;
  renderer = null;
  hideOverlay();
  showScreen('menu');
});

// "Zurück zur Lobby" (Online, nach Spielende): Server setzt den Room zurück und
// broadcastet 'lobby' -> dadurch kommen ALLE gemeinsam zurück (kein lokaler
// Sofortwechsel, damit alle Clients einheitlich umschalten).
$('btnBackToLobby').addEventListener('click', () => wsSend({ t: 'returnLobby' }));

// "Zuschauen" bzw. "Doch zuschauen": Overlay schließen, Spiel weiter beobachten.
$('btnSpectate').addEventListener('click', hideOverlay);

// "In Lobby warten": Warte-Bildschirm. Das Spiel simuliert im Hintergrund weiter
// (Turns laufen über processTurnQueue); bei Spielende ersetzt checkGameEnd das
// Overlay durch das Ergebnis, oder der Lobby-Broadcast holt uns automatisch zurück.
$('btnWaitLobby').addEventListener('click', () => {
  showOverlay('In der Lobby warten …',
    'Du wartest auf das Spielende. Danach geht es zurück in die Lobby.',
    ['btnSpectate']);
});

// Zurück in die Lobby wechseln und das laufende Spiel abbauen (Frame-Schleife
// stoppt von selbst, sobald game === null ist – siehe frame()).
function returnToLobbyScreen() {
  stopLocalLoop();
  game = null;
  renderer = null;
  hideOverlay();
  showScreen('lobby');
}

// Lobby-Anzeige an den vom Server gemeldeten Zustand anpassen: Code, Spieler-
// liste, Host-Markierung und ob die Einstellungen bedienbar sind (nur der Host
// darf Karte/Groesse/Bots aendern und das Spiel starten).
function updateLobby(m) {
  lastLobbyPlayers = m.players;
  $('lobbyCode').textContent = m.code;
  isHost = m.hostCid === myCid;
  const ul = $('lobbyPlayers');
  ul.innerHTML = '';
  for (const p of m.players) {
    const li = document.createElement('li');
    li.textContent = p.name;
    if (p.cid === m.hostCid) {
      const tag = document.createElement('span');
      tag.className = 'tag';
      tag.textContent = 'Host';
      li.appendChild(tag);
    }
    ul.appendChild(li);
  }
  $('lobbyBots').value = m.bots;
  $('lobbyBotsLabel').textContent = m.bots;
  $('lobbyBots').disabled = !isHost;
  if (m.nations !== undefined) {
    $('lobbyNations').value = m.nations;
    $('lobbyNationsLabel').textContent = m.nations;
  }
  $('lobbyNations').disabled = !isHost;
  lobbyLevel = m.botLevel !== undefined ? m.botLevel : 1;
  setSeg('lobbyLevelSeg', lobbyLevel);
  for (const b of $('lobbyLevelSeg').querySelectorAll('button')) b.disabled = !isHost;
  if (m.mapType) $('lobbyMap').value = m.mapType;
  if (m.mapSize) $('lobbySize').value = m.mapSize;
  $('lobbyMap').disabled = !isHost;
  $('lobbySize').disabled = !isHost;
  $('btnStart').classList.toggle('hidden', !isHost);
  $('lobbyWait').classList.toggle('hidden', isHost);
}

// ---------- Netzwerk ----------
// Objekt als JSON an den Server schicken (nur wenn die Verbindung offen ist).
function wsSend(obj) {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
}

// WebSocket-Verbindung aufbauen und nach dem Verbinden onOpen ausfuehren
// (z.B. Lobby erstellen/beitreten). Bestehende Verbindung wird vorher geschlossen.
function connectAnd(onOpen) {
  if (ws) { ws.close(); ws = null; }
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const sock = new WebSocket(`${proto}//${location.host}/ws`);
  ws = sock;
  sock.onopen = onOpen;
  sock.onmessage = ev => {
    let m;
    try { m = JSON.parse(ev.data); } catch { return; }
    handleServerMsg(m);
  };
  sock.onerror = () => showMenuError('Verbindung zum Server fehlgeschlagen.');
  sock.onclose = () => {
    if (ws !== sock) return;
    ws = null;
    if (screens.lobby.classList.contains('active')) showScreen('menu');
  };
}

// Eingehende Server-Nachrichten je nach Typ verarbeiten (Lobby beigetreten,
// Lobby-Update, Fehler, Spielstart, Zug).
function handleServerMsg(m) {
  switch (m.t) {
    case 'joined':
      myCid = m.cid;
      showScreen('lobby');
      break;
    case 'lobby':
      // Kommt ein Lobby-Update, während bei uns noch ein Spiel läuft/beendet ist
      // (game !== null), hat der Server den Room nach Spielende zurückgesetzt
      // (returnLobby) -> wir gehen zurück in die gemeinsame Lobby. Vor dem Spiel
      // ist game === null, dann ist es ein ganz normales Lobby-Update.
      if (game) returnToLobbyScreen();
      updateLobby(m);
      break;
    case 'error':
      if (screens.menu.classList.contains('active')) showMenuError(m.msg);
      break;
    case 'start':
      startGame(m.seed, m.players, findMyIdx(), true, { mapType: m.mapType, mapSize: m.mapSize });
      break;
    case 'turn':
      turnQueue.push(m);
      processTurnQueue();
      break;
  }
}

// Eigenen Spieler-Index (Position in der Spielerliste) anhand der Client-ID finden.
function findMyIdx() {
  return lastLobbyPlayers.findIndex(p => p.cid === myCid);
}

// ---------- Spiel ----------
// Ein neues Spiel aufsetzen: Zustand zuruecksetzen, Engine + Renderer erzeugen,
// zum Spiel-Screen wechseln. Offline laeuft die Zug-Schleife lokal per Timer;
// online liefert der Server die Zuege (siehe handleServerMsg 'turn').
function startGame(seed, players, idx, isOnline, mapCfg = {}) {
  myIdx = idx;
  online = isOnline;
  turnQueue = [];
  localPending = [];
  deadShown = false;
  buildMode = null;
  seenAllyRequests = new Set();
  keysDown.clear();
  hideCtxMenu();
  lastCam = 0;
  // Rangliste gehört zum alten Spiel -> Zeilen/Hover/Tooltip zurücksetzen
  lbRows.clear();
  lbOrder = '';
  lbHoverIdx = -1;
  $('leaderboard').innerHTML = '';
  $('lbTip').classList.add('hidden');
  $('attackList').classList.add('hidden');
  updateBuildButtons();
  game = new Game({ seed, players, mapType: mapCfg.mapType, mapSize: mapCfg.mapSize });
  window.__game = game; // Debug-Zugriff (Konsole)
  const canvas = $('canvas');
  renderer = new Renderer(canvas, game);
  renderer.myIdx = myIdx;              // fuer den Fabrik-Radius der eigenen Fabriken
  window.__renderer = renderer;
  $('overlay').classList.add('hidden');
  showScreen('game');

  if (!online) {
    stopLocalLoop();
    localInterval = setInterval(() => {
      const intents = localPending;
      localPending = [];
      stepTurn(intents);
    }, TURN_MS);
  }
  requestAnimationFrame(frame);
}

// Lokale Zug-Schleife stoppen (nur im Offline-/Solospiel aktiv).
function stopLocalLoop() {
  if (localInterval) { clearInterval(localInterval); localInterval = null; }
}

// Alle vom Server empfangenen Zuege abarbeiten (holt evtl. Rueckstand auf).
function processTurnQueue() {
  // Alle vorliegenden Turns sofort abarbeiten (holt Rückstand auf)
  while (turnQueue.length) {
    const m = turnQueue.shift();
    stepTurn(m.intents || []);
  }
}

// Einen Simulationsschritt ausfuehren: Intents anwenden, geaenderte Zellen dem
// Renderer melden und pruefen, ob das Spiel vorbei ist.
function stepTurn(intents) {
  if (!game || game.phase === 'ended') return;
  game.turn(intents);
  showMoneyPops();
  if (renderer && game.dirty.length) {
    renderer.markDirty(game.dirty);
    game.dirty.length = 0;
  }
  checkGameEnd();
}

// Eigene Eingabe abschicken: online an den Server, offline direkt in den lokalen
// Puffer fuer den naechsten Zug.
function sendIntent(d) {
  if (online) wsSend({ t: 'intent', d });
  else localPending.push({ p: myIdx, ...d });
}

function checkGameEnd() {
  const me = game.players[myIdx];
  if (game.winners) {
    // Spielende (ein Spieler/eine Allianz hat ≥70% Land oder ist als Einzige übrig)
    const iWon = game.winners.includes(myIdx);
    const names = game.winners.map(i => game.players[i].name).join(', ');
    let title, text;
    if (iWon && game.winners.length > 1) {
      const partners = game.winners.filter(i => i !== myIdx).map(i => game.players[i].name).join(', ');
      title = 'Team-Sieg! 🏆🤝'; text = `Gemeinsam gewonnen mit: ${partners}`;
    } else if (iWon) {
      title = 'Sieg! 🏆'; text = 'Du beherrschst die Karte!';
    } else {
      title = 'Spiel vorbei';
      text = game.winners.length > 1 ? `Das Bündnis ${names} hat gewonnen.` : `${names} hat gewonnen.`;
    }
    // Online: gemeinsam zurück in die Lobby (oder ganz raus ins Menü). Solo: nur Menü.
    showOverlay(title, text, online ? ['btnBackToLobby', 'btnBackToMenu'] : ['btnBackToMenu']);
    stopLocalLoop();
  } else if (me && !me.alive && !deadShown) {
    // Eigener Tod, während das Spiel weiterläuft: Wahl zwischen Zuschauen und
    // (Online) in der Lobby auf das Spielende warten. Nur einmal zeigen.
    deadShown = true;
    showOverlay('Eliminiert 💀', 'Dein Reich wurde erobert.',
      online ? ['btnSpectate', 'btnWaitLobby'] : ['btnSpectate', 'btnBackToMenu']);
  }
}

// Alle Overlay-Buttons, die situationsabhängig ein-/ausgeblendet werden
const OVERLAY_BUTTONS = ['btnSpectate', 'btnWaitLobby', 'btnBackToLobby', 'btnBackToMenu'];

// Overlay mit Titel/Text zeigen und genau die übergebenen Buttons einblenden
function showOverlay(title, text, buttons = []) {
  $('overlayTitle').textContent = title;
  $('overlayText').textContent = text;
  for (const id of OVERLAY_BUTTONS) $(id).classList.toggle('hidden', !buttons.includes(id));
  $('overlay').classList.remove('hidden');
}

function hideOverlay() { $('overlay').classList.add('hidden'); }

// Bei "Eliminiert" darf man das Overlay auch per Klick auf den Hintergrund
// wegklicken und einfach zuschauen (solange das Spiel noch läuft)
$('overlay').addEventListener('click', e => {
  if (e.target === $('overlay') && game && !game.winners) hideOverlay();
});

// ---------- Toast ----------
// Kurze Einblendung unten (Hinweis/Fehler), verschwindet nach 4 Sekunden.
let toastTimer = null;
function showToast(msg) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hidden'), 4000);
}

// ---------- Bauen ----------
const BUILD_KINDS = [
  { kind: 'city', btn: 'btnCity', label: '🏙 Stadt', key: '1' },
  { kind: 'fort', btn: 'btnFort', label: '🛡 Festung', key: '2' },
  { kind: 'port', btn: 'btnPort', label: '⚓ Hafen', key: '3' },
  { kind: 'factory', btn: 'btnFactory', label: '🏭 Fabrik', key: '4' },
];
const KIND_NAMES = { city: 'Stadt', fort: 'Festung', port: 'Hafen', factory: 'Fabrik' };

// Baumodus umschalten (nochmal derselbe -> aus). Danach reagiert ein Klick auf
// die Karte mit "hier bauen" statt "angreifen".
function setBuildMode(mode) {
  buildMode = buildMode === mode ? null : mode;
  updateBuildButtons();
}
// Bau-Buttons und Mauszeiger an den aktuellen Baumodus anpassen.
function updateBuildButtons() {
  for (const bk of BUILD_KINDS) {
    $(bk.btn).classList.toggle('build-active', buildMode === bk.kind);
  }
  $('canvas').style.cursor = buildMode ? 'copy' : 'crosshair';
  // Im Fabrik-Baumodus den Radius der eigenen Fabriken deutlich hervorheben
  if (renderer) renderer.factoryHint = buildMode === 'factory';
}
for (const bk of BUILD_KINDS) {
  $(bk.btn).textContent = `${bk.label} (${BUILD_COSTS[bk.kind]}€)`;
  $(bk.btn).addEventListener('click', () => setBuildMode(bk.kind));
}

// Preise steigen pro gebautem Gebäude – Buttons zeigen den aktuellen Preis
function updateBuildPrices() {
  if (!game) return;
  for (const bk of BUILD_KINDS) {
    $(bk.btn).textContent = `${bk.label} (${game.buildCostOf(myIdx, bk.kind)}€)`;
  }
}

// Shortcut-Legende ein-/ausklappen
$('shToggle').addEventListener('click', () => {
  const help = $('shortcutHelp');
  help.classList.toggle('collapsed');
  $('shToggle').textContent = help.classList.contains('collapsed') ? 'einblenden' : 'ausblenden';
});

// Sind wir gerade aktiv im Spiel-Screen? (Tastatur-/Maus-Steuerung nur dann)
function inGame() {
  return game && screens.game.classList.contains('active');
}

window.addEventListener('keydown', e => {
  // Tasten ignorieren, während in Textfeldern getippt wird
  const tag = e.target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA') return;
  if (!inGame()) return;
  const k = e.key.toLowerCase();

  if (PAN_KEYS.has(k)) {
    keysDown.add(k);
    e.preventDefault();
    return;
  }
  if (k === 'escape') {
    if (!ctxMenu.classList.contains('hidden')) hideCtxMenu();
    else if (buildMode) setBuildMode(buildMode);
    return;
  }
  if (game.phase !== 'play') return;
  const me = game.players[myIdx];
  if (!me || !me.alive) return;
  // Zifferntasten: Baumodus wählen (ohne Maus)
  const bk = BUILD_KINDS.find(x => x.key === k);
  if (bk) {
    setBuildMode(bk.kind);
    showToast(buildMode ? `${KIND_NAMES[bk.kind]}: Zielfeld anklicken.` : 'Baumodus beendet.');
  }
});
window.addEventListener('keyup', e => keysDown.delete(e.key.toLowerCase()));
// Bei Fokusverlust keine „hängenden" Tasten
window.addEventListener('blur', () => keysDown.clear());

// ---------- Allianzen (Klick auf Rangliste) ----------
$('leaderboard').addEventListener('click', e => {
  if (!game || game.phase !== 'play') return;
  const row = e.target.closest('.lb-row');
  if (!row || row.dataset.idx === undefined) return;
  const idx = +row.dataset.idx;
  if (idx === myIdx) return;
  const other = game.players[idx];
  if (!other.alive) return;
  const me = game.players[myIdx];
  if (!me || !me.alive) return;
  if (game.isAllied(myIdx, idx)) {
    sendIntent({ type: 'unally', target: idx });
    showToast(`Allianz mit ${other.name} aufgekündigt.`);
  } else if (game.allyRequests.has(`${idx}:${myIdx}`)) {
    sendIntent({ type: 'ally', target: idx });
    showToast(`Allianz mit ${other.name} geschlossen! 🤝`);
  } else if (game.allyRequests.has(`${myIdx}:${idx}`)) {
    showToast(`Anfrage an ${other.name} läuft bereits …`);
  } else {
    sendIntent({ type: 'ally', target: idx });
    showToast(`Allianz-Anfrage an ${other.name} gesendet.`);
  }
});

// ---------- HUD ----------
// Einnahmen aus Handel & Zügen poppen über der Geldanzeige auf: das Neuste
// steht direkt über dem Geld, Ältere rutschen nach oben (max. 5 gleichzeitig),
// jedes bleibt 3 Sekunden sichtbar und faded dann aus.
const MONEY_POP_MS = 3000;
const MONEY_POP_MAX = 5;
function showMoneyPops() {
  if (!game || myIdx < 0 || game.phase !== 'play') return;
  let sum = 0;
  for (const e of game.moneyEvents) if (e.p === myIdx) sum += e.amount;
  if (sum <= 0) return;
  const box = $('moneyPops');
  const el = document.createElement('div');
  el.className = 'money-pop';
  el.textContent = `+${fmt(sum)} €`;
  box.appendChild(el); // Neustes unten – Ältere werden nach oben gedrückt
  while (box.children.length > MONEY_POP_MAX) box.firstChild.remove();
  setTimeout(() => el.remove(), MONEY_POP_MS);
}

function fmt(n) {
  n = Math.floor(n);
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e4) return (n / 1e3).toFixed(1) + 'k';
  return String(n);
}

// HUD aktualisieren: Truppen, Geld, Phase-Hinweis, Allianz-Meldungen und die
// Rangliste. Gedrosselt auf ~4x/Sekunde, damit es nicht jeden Frame neu baut.
let lastHud = 0;
function updateHud(now) {
  if (now - lastHud < 250 || !game) return;
  lastHud = now;
  const me = game.players[myIdx];
  $('troopsLabel').textContent = me ? `${fmt(me.troops)} / ${fmt(game.maxTroopsOf(me))}` : '0';
  // Truppenanstieg pro Sekunde – orange markiert
  $('growthLabel').textContent = me && me.alive ? ` +${fmt(game.troopGrowthOf(me) * 10)}/s` : '';
  $('moneyLabel').textContent = me ? fmt(me.money) : '0';
  updateBuildPrices();

  const phaseEl = $('phaseInfo');
  if (game.phase === 'spawn') {
    const secs = Math.ceil((SPAWN_TURNS - game.turnNo) * TURN_MS / 1000);
    phaseEl.textContent = `Wähle deinen Startpunkt! (${secs}s)`;
  } else {
    phaseEl.textContent = '';
  }

  // Eingehende Allianz-Anfragen melden
 if (me && me.alive) updateAllyRequests();
      }
    }
  }

  // Truppenbalken: Fuellstand bis zum Limit, oranges Segment = Truppen im
  // Angriff (zaehlen zur Kapazitaet), Marke beim Wachstums-Maximum
  const max = me ? game.maxTroopsOf(me) : 1;
  const out = me ? game.committedTroopsOf(myIdx) : 0;
  $('troopFill').style.width = me ? Math.max(0, Math.min(100, (me.troops / max) * 100)) + '%' : '0%';
  $('troopOut').style.width = me ? Math.max(0, Math.min(100, (out / max) * 100)) + '%' : '0%';
  $('troopPeak').style.left = (GROWTH_PEAK * 100) + '%';

  updateLeaderboard();
  updateLbTip();
  updateAttackList();
}

// ---------- Rangliste ----------
// Die Zeilen werden EINMAL angelegt und danach nur noch aktualisiert (kein
// innerHTML-Neubau): sonst würde der Hover-Tooltip alle 250ms wegflackern.
const lbRows = new Map();   // Spieler-Index -> Zeilen-Element
let lbOrder = '';           // zuletzt gerenderte Reihenfolge (Sortier-Sparfuchs)
let lbHoverIdx = -1;        // Spieler, über dem gerade die Maus steht

function lbRowFor(p) {
  let r = lbRows.get(p.idx);
  if (r) return r;
  r = document.createElement('div');
  r.className = 'lb-row';
  r.dataset.idx = p.idx;
  const dot = document.createElement('span');
  dot.className = 'dot';
  dot.style.background = p.color;
  const name = document.createElement('span');
  name.className = 'lb-name';
  const val = document.createElement('span');
  val.className = 'lb-val';
  r.append(dot, name, val);
  r._name = name;
  r._val = val;
  lbRows.set(p.idx, r);
  return r;
}

const LB_MAX_ROWS = 12; // bei vielen Bots: nur die Top 12 (+ eigene Zeile) zeigen

function updateLeaderboard() {
  const lb = $('leaderboard');
  const sorted = [...game.players].sort((a, b) => b.territory - a.territory);
  // Nur die Spitze anzeigen; die eigene Zeile hängt notfalls unten dran
  const shown = sorted.slice(0, LB_MAX_ROWS);
  if (myIdx >= 0 && game.players[myIdx] && !shown.some(p => p.idx === myIdx)) {
    shown.push(game.players[myIdx]);
  }
  for (const p of shown) {
    const r = lbRowFor(p);
    r.classList.toggle('dead', !p.alive);
    let suffix = p.idx === myIdx ? ' (Du)' : '';
    if (p.idx !== myIdx && game.isAllied(myIdx, p.idx)) suffix = ' 🤝';
    else if (p.idx !== myIdx && game.allyRequests.has(`${p.idx}:${myIdx}`)) suffix = ' 🤝?';
    else if (p.idx !== myIdx && game.allyRequests.has(`${myIdx}:${p.idx}`)) suffix = ' ⏳';
    r._name.textContent = p.name + suffix;
    r._val.textContent = `${(p.territory / game.map.landCount * 100).toFixed(1)}% · ${fmt(p.troops)}`;
  }
  // Nur umsortieren, wenn sich die Reihenfolge wirklich geändert hat
  const order = shown.map(p => p.idx).join(',');
  if (order !== lbOrder) {
    lbOrder = order;
    // Zeilen von Spielern entfernen, die aus der Anzeige gerutscht sind
    for (const [idx, r] of lbRows) {
      if (!shown.some(p => p.idx === idx)) { r.remove(); lbRows.delete(idx); }
    }
    for (const p of shown) lb.appendChild(lbRowFor(p)); // appendChild verschiebt
  }
}

// Maus über einer Zeile -> Spieler merken (Delegation, da Zeilen bestehen bleiben)
$('leaderboard').addEventListener('mouseover', e => {
  const row = e.target.closest('.lb-row');
  lbHoverIdx = row && row.dataset.idx !== undefined ? +row.dataset.idx : -1;
});
$('leaderboard').addEventListener('mouseleave', () => {
  lbHoverIdx = -1;
  $('lbTip').classList.add('hidden');
});

// Details zum gehoverten Spieler: Name, Truppen, Gebiet und Gebäude je Typ.
// Wird im HUD-Takt aktualisiert, damit die Werte live mitlaufen.
function updateLbTip() {
  const tip = $('lbTip');
  const p = lbHoverIdx >= 0 ? game.players[lbHoverIdx] : null;
  const row = p ? lbRows.get(p.idx) : null;
  if (!p || !row) { tip.classList.add('hidden'); return; }

  tip.innerHTML = '';
  const head = document.createElement('div');
  head.className = 'tip-name';
  const dot = document.createElement('span');
  dot.className = 'dot';
  dot.style.background = p.color;
  const nm = document.createElement('span');
  nm.textContent = p.name + (p.idx === myIdx ? ' (Du)' : '');
  head.append(dot, nm);
  tip.appendChild(head);

  const line = (label, value) => {
    const d = document.createElement('div');
    d.className = 'tip-line';
    d.textContent = label;
    const b = document.createElement('b');
    b.textContent = value;
    d.appendChild(b);
    tip.appendChild(d);
  };
  line('Truppen: ', `${fmt(p.troops)} / ${fmt(game.maxTroopsOf(p))}`);
  line('Geld: ', `${fmt(p.money)} €`);
  line('Gebiet: ', `${(p.territory / game.map.landCount * 100).toFixed(1)}%`);

  const builds = document.createElement('div');
  builds.className = 'tip-builds';
  for (const [ico, n] of [['🏙', p.cities], ['🛡', p.forts], ['⚓', p.ports], ['🏭', p.factories]]) {
    const s = document.createElement('span');
    s.textContent = ico + ' ';
    const b = document.createElement('b');
    b.textContent = n;
    s.appendChild(b);
    builds.appendChild(s);
  }
  tip.appendChild(builds);

  if (!p.alive) {
    const d = document.createElement('div');
    d.className = 'tip-dead';
    d.textContent = 'Eliminiert 💀';
    tip.appendChild(d);
  }

  // Links neben der Rangliste, auf Höhe der Zeile (im Fenster halten)
  tip.classList.remove('hidden');
  const r = row.getBoundingClientRect();
  tip.style.left = 'auto';
  tip.style.right = (window.innerWidth - r.left + 10) + 'px';
  tip.style.top = Math.max(4, Math.min(r.top - 6, window.innerHeight - tip.offsetHeight - 6)) + 'px';
}

// ---------- Laufende Angriffe ----------
// Zeigt, welche Angriffe von dir unterwegs sind und wer dich gerade angreift.
function updateAttackList() {
  const el = $('attackList');
  const out = [], inc = [];
  for (const a of game.attacks) {
    if (a.pool <= 0) continue;
    if (a.attacker === myIdx) out.push(a);
    else if (a.target === myIdx) inc.push(a);
  }
  if (!out.length && !inc.length) { el.classList.add('hidden'); return; }

  el.innerHTML = '';
  const section = (title, list, cls, ico, otherOf) => {
    if (!list.length) return;
    const h = document.createElement('div');
    h.className = 'atk-head';
    h.textContent = title;
    el.appendChild(h);
    for (const a of list) {
      const other = otherOf(a);
      const row = document.createElement('div');
      row.className = 'atk-row ' + cls;
      const i = document.createElement('span');
      i.className = 'atk-ico';
      i.textContent = ico;
      const dot = document.createElement('span');
      dot.className = 'dot';
      dot.style.background = other.color;
      const nm = document.createElement('span');
      nm.className = 'atk-name';
      nm.textContent = other.name;
      const n = document.createElement('span');
      n.className = 'atk-n';
      n.textContent = fmt(a.pool);
      row.append(i, dot, nm, n);
      // Eigene Angriffe lassen sich per Klick abbrechen – die restlichen
      // Truppen kehren sofort zurück (Intent 'retreat').
      if (cls === 'atk-out') {
        row.title = 'Klicken, um den Angriff abzubrechen – Truppen kehren zurück';
        const x = document.createElement('span');
        x.className = 'atk-x';
        x.textContent = '✕';
        row.append(x);
        row.addEventListener('click', () => {
          sendIntent({ type: 'retreat', target: a.target });
          showToast(`Angriff auf ${other.name} abgebrochen – Truppen kehren zurück.`);
        });
      }
      el.appendChild(row);
    }
  };
  // Ziel -1 = neutrales Land (kein Spieler)
  section('Deine Angriffe', out, 'atk-out', '⚔',
    a => (a.target < 0 ? { name: 'Neutral', color: '#b5ad8a' } : game.players[a.target]));
  section('Gegen dich', inc, 'atk-in', '🛡', a => game.players[a.attacker]);
  el.classList.remove('hidden');
}

// ---------- Kamera per Tastatur (WASD / Pfeile) ----------
const keysDown = new Set();
const PAN_KEYS = new Set(['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright']);
let lastCam = 0;
// Karte anhand gedrueckter Tasten verschieben. dt = Zeit seit letztem Frame,
// damit die Geschwindigkeit unabhaengig von der Bildrate gleich bleibt.
function updateCamera(now) {
  if (!renderer) return;
  const dt = lastCam ? Math.min(60, now - lastCam) : 16;
  lastCam = now;
  const speed = 0.7 * dt; // Pixel pro ms
  let dx = 0, dy = 0;
  if (keysDown.has('a') || keysDown.has('arrowleft')) dx += speed;
  if (keysDown.has('d') || keysDown.has('arrowright')) dx -= speed;
  if (keysDown.has('w') || keysDown.has('arrowup')) dy += speed;
  if (keysDown.has('s') || keysDown.has('arrowdown')) dy -= speed;
  if (dx || dy) renderer.pan(dx, dy);
}

// Render-Schleife (einmal pro Bildschirm-Frame): Kamera, Karte, HUD. Stoppt von
// selbst, sobald kein Spiel mehr laeuft (game/renderer null) – siehe startGame.
function frame(now) {
  if (!game || !renderer) return;
  updateCamera(now);
  renderer.draw();
  updateHud(now);
  requestAnimationFrame(frame);
}

// ---------- Eingaben ----------
const canvas = $('canvas');
$('ratioSlider').addEventListener('input', e => {
  $('ratioLabel').textContent = e.target.value + '%';
});

let pointerDown = false, panned = false, lastX = 0, lastY = 0;

canvas.addEventListener('pointerdown', e => {
  if (e.button !== 0) return; // nur Linksklick pannt/agiert
  if (!ctxMenu.classList.contains('hidden')) { hideCtxMenu(); return; } // offenes Menü nur schließen
  pointerDown = true;
  panned = false;
  lastX = e.clientX;
  lastY = e.clientY;
  try { canvas.setPointerCapture(e.pointerId); } catch { /* synthetische Events */ }
});

canvas.addEventListener('pointermove', e => {
  if (!pointerDown || !renderer) return;
  const dx = e.clientX - lastX, dy = e.clientY - lastY;
  if (panned || Math.abs(dx) + Math.abs(dy) > 4) {
    panned = true;
    renderer.pan(dx, dy);
    lastX = e.clientX;
    lastY = e.clientY;
  }
});

// Besitze ich Zellen auf dieser Insel? (entscheidet Landangriff vs. Boot)
function ownCellOnIsland(islandId) {
  for (let c = 0; c < game.owner.length; c++) {
    if (game.owner[c] === myIdx && game.map.island[c] === islandId) return true;
  }
  return false;
}

// Linksklick auf die Karte auswerten (nur wenn nicht gepannt wurde): je nach
// Phase/Modus Startpunkt setzen, bauen, angreifen oder ein Boot losschicken.
canvas.addEventListener('pointerup', e => {
  if (!pointerDown) return;
  pointerDown = false;
  if (panned || !game || !renderer) return;
  const cell = renderer.screenToCell(e.clientX, e.clientY);
  if (cell < 0 || game.map.terrain[cell] !== 1) return;

  if (game.phase === 'spawn') {
    if (game.owner[cell] === -1) sendIntent({ type: 'spawn', cell });
    return;
  }
  if (game.phase !== 'play') return;
  const me = game.players[myIdx];
  if (!me || !me.alive) return;

  if (buildMode) {
    // Häfen: Klick in Küstennähe genügt – die Engine snappt zur nächsten
    // Küstenzelle. Hier dieselbe Auflösung, damit die Fehlermeldung passt.
    const bCell = game.resolveBuildCell(myIdx, cell, buildMode);
    const err = game.canBuildAt(myIdx, bCell, buildMode);
    if (err) {
      showToast(err);
    } else {
      sendIntent({ type: 'build', kind: buildMode, cell: bCell });
      setBuildMode(buildMode); // Modus beenden
    }
    return;
  }

  const target = game.owner[cell];
  if (target === myIdx) return;
  if (target >= 0 && game.isAllied(myIdx, target)) {
    showToast('Verbündete kannst du nicht angreifen.');
    return;
  }
  const ratio = +$('ratioSlider').value / 100;
  if (ownCellOnIsland(game.map.island[cell])) {
    sendIntent({ type: 'attack', target, ratio });
  } else {
    // Andere Insel -> Boot schicken
    if (game.boats.filter(b => b.owner === myIdx).length >= MAX_BOATS) {
      showToast(`Maximal ${MAX_BOATS} Boote gleichzeitig.`);
      return;
    }
    if (!game.findBoatPath(myIdx, cell)) {
      showToast('Kein Seeweg – du brauchst eigene Küste mit Verbindung dorthin.');
      return;
    }
    sendIntent({ type: 'boat', cell, ratio });
    showToast('Boot gestartet! 🚢');
  }
});

canvas.addEventListener('wheel', e => {
  if (!renderer) return;
  e.preventDefault();
  renderer.zoomAt(e.clientX, e.clientY, e.deltaY < 0 ? 1.15 : 1 / 1.15);
}, { passive: false });

// ---------- Kontextmenü (Rechtsklick) ----------
const ctxMenu = $('ctxMenu');
function hideCtxMenu() {
  ctxMenu.classList.add('hidden');
  ctxMenu.innerHTML = '';
}

// Nächste Landzelle um eine (evtl. Wasser-)Zelle finden – für Rechtsklick aufs Meer
function nearestLandCell(cell, maxR = 10) {
  if (cell < 0) return -1;
  if (game.map.terrain[cell] === 1) return cell;
  const w = game.map.w, h = game.map.h;
  const cx = cell % w, cy = (cell / w) | 0;
  for (let r = 1; r <= maxR; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue; // nur der Ring
        const x = cx + dx, y = cy + dy;
        if (x < 0 || y < 0 || x >= w || y >= h) continue;
        const c = y * w + x;
        if (game.map.terrain[c] === 1) return c;
      }
    }
  }
  return -1;
}

// Menüeinträge je nach angeklicktem Ziel zusammenstellen
function buildCtxItems(owner, cell) {
  const items = [];
  const ratioPct = +$('ratioSlider').value;
  const ratio = ratioPct / 100;

  // Allianz-Aktionen für andere lebende Spieler
  if (owner >= 0 && owner !== myIdx && game.players[owner].alive) {
    const other = game.players[owner];
    if (game.isAllied(myIdx, owner)) {
      items.push({ label: `💔 Allianz mit ${other.name} brechen`, action: () => {
        sendIntent({ type: 'unally', target: owner });
        showToast(`Allianz mit ${other.name} aufgekündigt.`);
      } });
    } else if (game.allyRequests.has(`${owner}:${myIdx}`)) {
      items.push({ label: `🤝 Allianz mit ${other.name} annehmen`, action: () => {
        sendIntent({ type: 'ally', target: owner });
        showToast(`Allianz mit ${other.name} geschlossen! 🤝`);
      } });
    } else if (game.allyRequests.has(`${myIdx}:${owner}`)) {
      items.push({ label: `⏳ Anfrage an ${other.name} läuft …`, disabled: true });
    } else {
      items.push({ label: `🤝 Allianz mit ${other.name} anfragen`, action: () => {
        sendIntent({ type: 'ally', target: owner });
        showToast(`Allianz-Anfrage an ${other.name} gesendet.`);
      } });
    }
  }

  // Angriff / Boot bei konkreter Zielzelle
  if (cell >= 0 && game.map.terrain[cell] === 1 && owner !== myIdx) {
    const allied = owner >= 0 && game.isAllied(myIdx, owner);
    if (!allied) {
      if (ownCellOnIsland(game.map.island[cell])) {
        items.push({ label: `⚔ Angreifen (${ratioPct}%)`, action: () => {
          sendIntent({ type: 'attack', target: owner, ratio });
        } });
      } else if (game.findBoatPath(myIdx, cell)) {
        const boatsOut = game.boats.filter(b => b.owner === myIdx).length;
        items.push({
          label: `🚢 Boot hierher (${ratioPct}%)`,
          disabled: boatsOut >= MAX_BOATS,
          hint: boatsOut >= MAX_BOATS ? `Maximal ${MAX_BOATS} Boote gleichzeitig.` : '',
          action: () => {
            sendIntent({ type: 'boat', cell, ratio });
            showToast('Boot gestartet! 🚢');
          }
        });
      }
    }
  }

  // Auf eigenem Gebiet: hier bauen
  if (cell >= 0 && owner === myIdx) {
    // Eigener Hafen in der Nähe? -> Kriegsschiff bauen
    const ownPort = game.buildings.find(b =>
      b.kind === 'port' && b.owner === myIdx && game.dist2(b.cell, cell) <= 9);
    if (ownPort) {
      const me = game.players[myIdx];
      const capped = game.warships.filter(w => w.owner === myIdx).length >= me.ports * 2;
      const tooPoor = me.money < WARSHIP_COST;
      items.push({
        label: `⛴ Kriegsschiff bauen (${WARSHIP_COST}€)`,
        disabled: capped || tooPoor,
        hint: capped ? 'Maximal 2 Kriegsschiffe je Hafen.' : tooPoor ? 'Nicht genug Geld.' : '',
        action: () => {
          sendIntent({ type: 'warship', cell: ownPort.cell });
          showToast('Kriegsschiff läuft vom Stapel! ⛴');
        }
      });
    }
    for (const bk of BUILD_KINDS) {
      const bCell = game.resolveBuildCell(myIdx, cell, bk.kind);
      const err = game.canBuildAt(myIdx, bCell, bk.kind);
      items.push({
        label: `${bk.label} bauen (${game.buildCostOf(myIdx, bk.kind)}€)`,
        disabled: !!err, hint: err || '',
        action: () => sendIntent({ type: 'build', kind: bk.kind, cell: bCell })
      });
    }
  }

  return items;
}

// Kontextmenue an der Mausposition aufbauen und anzeigen. Kopfzeile nennt das
// Ziel (eigenes/fremdes/neutrales Gebiet), darunter die passenden Aktionen.
// Die Position wird so begrenzt, dass das Menue im Fenster bleibt.
function openCtxMenu(clientX, clientY, owner, cell) {
  const items = buildCtxItems(owner, cell);
  if (items.length === 0) { hideCtxMenu(); return; }

  ctxMenu.innerHTML = '';
  const head = document.createElement('div');
  head.className = 'ctx-head';
  let title;
  if (owner === myIdx) title = 'Dein Gebiet';
  else if (owner >= 0) {
    title = game.players[owner].name;
    const dot = document.createElement('span');
    dot.className = 'dot';
    dot.style.background = game.players[owner].color;
    head.appendChild(dot);
  } else title = 'Neutrales Land';
  const tspan = document.createElement('span');
  tspan.textContent = title;
  head.appendChild(tspan);
  ctxMenu.appendChild(head);

  for (const it of items) {
    const b = document.createElement('button');
    b.textContent = it.label;
    if (it.disabled) {
      b.disabled = true;
      if (it.hint) b.title = it.hint;
    } else {
      b.addEventListener('click', () => { it.action(); hideCtxMenu(); });
    }
    ctxMenu.appendChild(b);
  }

  ctxMenu.classList.remove('hidden');
  const mw = ctxMenu.offsetWidth, mh = ctxMenu.offsetHeight;
  ctxMenu.style.left = Math.max(4, Math.min(clientX, window.innerWidth - mw - 8)) + 'px';
  ctxMenu.style.top = Math.max(4, Math.min(clientY, window.innerHeight - mh - 8)) + 'px';
}

canvas.addEventListener('contextmenu', e => {
  e.preventDefault();
  if (!game || game.phase !== 'play' || !renderer) return;
  const me = game.players[myIdx];
  if (!me || !me.alive) return;
  let cell = renderer.screenToCell(e.clientX, e.clientY);
  if (cell >= 0 && game.map.terrain[cell] === 0) cell = nearestLandCell(cell); // Wasser -> nächstes Land
  const owner = cell >= 0 ? game.owner[cell] : -2;
  openCtxMenu(e.clientX, e.clientY, owner, cell);
});

// Rechtsklick auf einen Namen in der Rangliste -> Allianz-Menü
$('leaderboard').addEventListener('contextmenu', e => {
  e.preventDefault();
  if (!game || game.phase !== 'play') return;
  const row = e.target.closest('.lb-row');
  if (!row || row.dataset.idx === undefined) return;
  const idx = +row.dataset.idx;
  const me = game.players[myIdx];
  if (idx === myIdx || !me || !me.alive) return;
  openCtxMenu(e.clientX, e.clientY, idx, -1);
});

// Menü schließen, wenn woanders hingeklickt wird
document.addEventListener('click', e => {
  if (!ctxMenu.classList.contains('hidden') && !ctxMenu.contains(e.target)) hideCtxMenu();
});

// ---------- Minimap ----------
const mini = $('minimap');
let miniDown = false;
function miniJump(e) {
  if (!renderer || !game) return;
  const r = mini.getBoundingClientRect();
  const mx = (e.clientX - r.left) / r.width * game.map.w;
  const my = (e.clientY - r.top) / r.height * game.map.h;
  renderer.centerOn(mx, my);
}
mini.addEventListener('pointerdown', e => {
  miniDown = true;
  miniJump(e);
  try { mini.setPointerCapture(e.pointerId); } catch { /* synthetische Events */ }
});
mini.addEventListener('pointermove', e => { if (miniDown) miniJump(e); });
mini.addEventListener('pointerup', () => { miniDown = false; });

window.addEventListener('resize', () => {
  if (renderer) {
    renderer.resize();
    renderer.imgDirty = true;
  }
});

// Verlassen der Seite dem Server melden
window.addEventListener('beforeunload', () => {
  if (ws) wsSend({ t: 'leave' });
});
// ---------- Allianz-Anfragen (Karten mit Annehmen/Ablehnen) ----------
const allyReqCards = new Map(); // "from:to" -> Karten-Element

function updateAllyRequests() {
  const activeKeys = new Set();
  for (const key of game.allyRequests) {
    const [from, to] = key.split(':').map(Number);
    if (to !== myIdx) continue;
    activeKeys.add(key);
    if (allyReqCards.has(key)) continue;

    const fromPlayer = game.players[from];
    if (!fromPlayer) continue;

    const card = document.createElement('div');
    card.className = 'ally-req-card';

    const dot = document.createElement('span');
    dot.className = 'dot';
    dot.style.background = fromPlayer.color;

    const text = document.createElement('span');
    text.className = 'ally-req-text';
    text.textContent = `${fromPlayer.name} bietet eine Allianz an`;

    const btnRow = document.createElement('div');
    btnRow.className = 'ally-req-btns';

    const acceptBtn = document.createElement('button');
    acceptBtn.className = 'ally-accept';
    acceptBtn.textContent = '🤝 Annehmen';
    acceptBtn.addEventListener('click', () => {
      sendIntent({ type: 'ally', target: from });
      showToast(`Allianz mit ${fromPlayer.name} geschlossen! 🤝`);
      removeAllyCard(key);
    });

    const declineBtn = document.createElement('button');
    declineBtn.className = 'ally-decline';
    declineBtn.textContent = '✕ Ablehnen';
    declineBtn.addEventListener('click', () => {
      sendIntent({ type: 'unally', target: from });
      showToast(`Allianz-Anfrage von ${fromPlayer.name} abgelehnt.`);
      removeAllyCard(key);
    });

    btnRow.append(acceptBtn, declineBtn);
    card.append(dot, text, btnRow);
    $('allyRequests').appendChild(card);
    allyReqCards.set(key, card);
  }

// ---------- Allianz-Anfragen (Karten mit Annehmen/Ablehnen) ----------
const allyReqCards = new Map(); // "from:to" -> Karten-Element

function updateAllyRequests() {
  const activeKeys = new Set();
  for (const key of game.allyRequests) {
    const [from, to] = key.split(':').map(Number);
    if (to !== myIdx) continue;
    activeKeys.add(key);
    if (allyReqCards.has(key)) continue;

    const fromPlayer = game.players[from];
    if (!fromPlayer) continue;

    const card = document.createElement('div');
    card.className = 'ally-req-card';

    const dot = document.createElement('span');
    dot.className = 'dot';
    dot.style.background = fromPlayer.color;

    const text = document.createElement('span');
    text.className = 'ally-req-text';
    text.textContent = `${fromPlayer.name} bietet eine Allianz an`;

    const btnRow = document.createElement('div');
    btnRow.className = 'ally-req-btns';

    const acceptBtn = document.createElement('button');
    acceptBtn.className = 'ally-accept';
    acceptBtn.textContent = '🤝 Annehmen';
    acceptBtn.addEventListener('click', () => {
      sendIntent({ type: 'ally', target: from });
      showToast(`Allianz mit ${fromPlayer.name} geschlossen! 🤝`);
      removeAllyCard(key);
    });

    const declineBtn = document.createElement('button');
    declineBtn.className = 'ally-decline';
    declineBtn.textContent = '✕ Ablehnen';
    declineBtn.addEventListener('click', () => {
      sendIntent({ type: 'unally', target: from });
      showToast(`Allianz-Anfrage von ${fromPlayer.name} abgelehnt.`);
      removeAllyCard(key);
    });

    btnRow.append(acceptBtn, declineBtn);
    card.append(dot, text, btnRow);
    $('allyRequests').appendChild(card);
    allyReqCards.set(key, card);
  }

  // Karten entfernen, deren Anfrage nicht mehr existiert (angenommen/abgelaufen)
  for (const [key, card] of allyReqCards) {
    if (!activeKeys.has(key)) { card.remove(); allyReqCards.delete(key); }
  }
}

function removeAllyCard(key) {
  const card = allyReqCards.get(key);
  if (card) { card.remove(); allyReqCards.delete(key); }
}
