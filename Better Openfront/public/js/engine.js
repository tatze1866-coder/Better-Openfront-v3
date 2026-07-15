// Deterministische Spiel-Engine (Lockstep).
// Alle Clients führen turn() mit identischen Intents in identischer
// Reihenfolge aus – dadurch bleibt das Spiel überall exakt gleich.
import { mulberry32 } from './rng.js';
import { generateMap } from './mapgen.js';

export const TURN_MS = 100;          // 10 Ticks pro Sekunde
export const SPAWN_TURNS = 120;      // 12 Sekunden Startpunkt-Wahl

// Wählbare Kartengrößen
export const MAP_SIZES = {
  klein: { w: 320, h: 200, name: 'Klein' },
  mittel: { w: 480, h: 300, name: 'Mittel' },
  gross: { w: 640, h: 400, name: 'Groß' },
};

// Wählbare Kartentypen (Preset-Geografie aus worldmap.js)
export const MAP_TYPES = [
  { id: 'random', name: '🎲 Zufalls-Archipel' },
  { id: 'world', name: '🌍 Weltkarte' },
  { id: 'europe', name: 'Europa' },
  { id: 'asia', name: 'Asien' },
  { id: 'africa', name: 'Afrika' },
  { id: 'namerica', name: 'Nordamerika' },
  { id: 'samerica', name: 'Südamerika' },
  { id: 'australia', name: 'Australien & Ozeanien' },
];

// Wirtschaft (pro Tick)
// Truppenwachstum folgt einer Kurve: Maximum bei 40% des Truppenlimits,
// darunter ansteigend, darüber abfallend (0 bei vollem Limit).
const GROWTH_PEAK = 0.4;
const MAX_PER_TERRITORY = 120;
const MAX_BASE = 800;
const START_TROOPS = 512;

// Geld (€): Basiseinkommen aus Gebiet; mehr über Handel und Züge
const START_MONEY = 300;
const MONEY_BASE = 0.05;             // € pro Tick
const MONEY_PER_TERRITORY = 0.0004;  // € pro Tick und Zelle

// Kampf: Angriffe rücken als geschlossene Linie vor – die komplette
// Front fällt auf einmal, im festen Takt (Ticks pro Vorstoß).
const NEUTRAL_COST = 1.0;
const ENEMY_COST_BASE = 1.4;
const ENEMY_COST_DENSITY = 1.6;
const NEUTRAL_INTERVAL = 3;          // gegen Neutral: Front alle 3 Ticks
const ENEMY_INTERVAL = 5;            // gegen Spieler: etwas langsamer
const WIN_FRACTION = 0.7;            // 70% des Landes = Sieg

// Gebäude – werden mit Geld (€) gebaut.
// Der Preis verdoppelt sich pro gebautem Gebäude des Typs (max. 3x = 8-facher
// Grundpreis). Häfen und Fabriken teilen sich dabei einen Zähler.
export const BUILD_COSTS = { city: 250, fort: 200, port: 250, factory: 400 };
const COST_DOUBLINGS_CAP = 3;
export const WARSHIP_COST = 300;
const KIND_FIELD = { city: 'cities', fort: 'forts', port: 'ports', factory: 'factories' };
const CITY_MAX_BONUS = 2500;         // Stadt: +max. Truppen
const FORT_RADIUS2 = 64;             // Festung schützt im Radius 8
const FORT_DEFENSE = 5;              // Eroberung dort 5x so teuer
const MIN_BUILD_DIST2 = 100;         // Mindestabstand 10 zwischen eigenen Gebäuden

// Häfen & Handel
const TRADE_INTERVAL = 100;          // Hafen versucht alle 10s ein Handelsschiff
const TRADE_CAP_PER_PORT = 2;        // aktive Handelsschiffe je Hafen
const TRADE_SPEED = 1.5;             // Wasserzellen pro Tick
const TRADE_VALUE_BASE = 40;         // € bei Ankunft (beide Seiten)
const TRADE_VALUE_PER_CELL = 0.35;   // € je Wegzelle

// Kriegsschiffe
const WARSHIP_RANGE2 = 36;           // Schussweite 6
const WARSHIP_SHOT_CD = 12;          // Ticks zwischen Schüssen
const WARSHIP_BASE_HP = 5;           // Leben wächst mit Alter bis 8
const WARSHIP_BONUS_HP = 3;
const WARSHIP_HP_GROW = 600;         // +1 Leben je Minute auf dem Feld
const WARSHIP_PATROL_R = 15;         // Patrouillenradius um den Heimathafen
const WARSHIP_CHASE_R2 = 625;        // jagt Handelsschiffe im Radius 25
const CONVERT_DIST2 = 4;             // Berührung: Handelsschiff kapern
const REPAIR_DIST2 = 9;              // Reparatur nahe eigenem Hafen
const REPAIR_INTERVAL = 20;          // 1 Schaden je 2s

// Fabriken & Züge
const FACTORY_RADIUS2 = 900;         // Schienennetz im Radius 30
const TRAIN_INTERVAL = 50;           // alle 5s Chance auf einen Zug
const TRAIN_CHANCE = 0.4;
const TRAIN_CAP = 3;                 // Züge gleichzeitig je Fabrik
const TRAIN_SPEED = 1.4;             // Zellen pro Tick entlang der Schiene
const TRAIN_VISITS = 6;              // Stationsbesuche, dann endet der Zug
const TRAIN_PAY = { own: 6, enemy: 12, ally: 18 }; // aufsteigend: eigene < fremde < verbündete

// Boote
export const MAX_BOATS = 3;
const BOAT_SPEED = 2;                // Wasserzellen pro Tick
const BOAT_MIN_TROOPS = 20;

export const PLAYER_COLORS = [
  '#e63946', '#2a9d8f', '#4361ee', '#f4a261', '#9b5de5',
  '#00b4d8', '#ef476f', '#80b918', '#b5651d', '#5f0f40',
  '#ff9f1c', '#3a5a40', '#7209b7', '#ffd60a', '#06d6a0',
  '#ff70a6', '#003566', '#a3b18a', '#38b000', '#e0aaff',
];

// Bot-Schwierigkeitsgrade: 0 = Leicht, 1 = Mittel, 2 = Schwer
export const BOT_LEVELS = [
  { name: 'Leicht', icon: '🟢', interval: 40, minTroops: 250, ratioN: 0.35, ratioE: 0.4, threshold: 1.5, allyAccept: 0.9, city: false, fort: false, boatMin: 700 },
  { name: 'Mittel', icon: '🟡', interval: 25, minTroops: 80, ratioN: 0.45, ratioE: 0.55, threshold: 1.1, allyAccept: 0.6, city: true, fort: false, boatMin: 300 },
  { name: 'Schwer', icon: '🔴', interval: 12, minTroops: 60, ratioN: 0.5, ratioE: 0.6, threshold: 0.95, allyAccept: 0.3, city: true, fort: true, boatMin: 200 },
];

export class Game {
  constructor({ seed, players, mapSize = 'mittel', mapType = 'random' }) {
    this.seed = seed;
    this.rng = mulberry32(seed);
    const size = MAP_SIZES[mapSize] || MAP_SIZES.mittel;
    this.mapSize = MAP_SIZES[mapSize] ? mapSize : 'mittel';
    this.mapType = MAP_TYPES.some(t => t.id === mapType) ? mapType : 'random';
    this.map = generateMap(seed, size.w, size.h, this.mapType);
    const n = this.map.w * this.map.h;
    this.owner = new Int16Array(n).fill(-1);
    this.turnNo = 0;
    this.phase = 'spawn'; // 'spawn' | 'play' | 'ended'
    this.winners = null;  // Array von Spieler-Indizes (Team-Sieg möglich)
    this.attacks = [];             // aktive Angriffe
    this.boats = [];               // Truppen-Transportboote unterwegs
    this.tradeShips = [];          // Handelsschiffe zwischen Häfen
    this.warships = [];            // Kriegsschiffe
    this.trains = [];              // Züge auf Schienennetzen
    this.buildings = [];           // Städte, Festungen, Häfen, Fabriken
    this.buildingAt = new Map();   // Zelle -> Gebäude
    this.alliances = new Set();    // "a:b" (a < b)
    this.allyRequests = new Set(); // "von:zu"
    this.dirty = [];               // in diesem Tick geänderte Zellen (fürs Rendering)

    this.players = players.map((p, i) => ({
      idx: i,
      name: p.name,
      color: PLAYER_COLORS[i % PLAYER_COLORS.length],
      isBot: !!p.bot,
      botLevel: Math.max(0, Math.min(2, (p.level === undefined ? 1 : p.level) | 0)),
      alive: true,
      troops: START_TROOPS,
      money: START_MONEY,
      territory: 0,
      cities: 0,
      forts: 0,
      ports: 0,
      factories: 0,
    }));

    this.landCells = [];
    for (let i = 0; i < n; i++) if (this.map.terrain[i] === 1) this.landCells.push(i);

    this.placeInitialSpawns();
  }

  // ---------- Hilfen ----------
  neighbors4(c, out) {
    const w = this.map.w, h = this.map.h;
    const x = c % w, y = (c / w) | 0;
    let k = 0;
    if (x > 0) out[k++] = c - 1;
    if (x < w - 1) out[k++] = c + 1;
    if (y > 0) out[k++] = c - w;
    if (y < h - 1) out[k++] = c + w;
    return k;
  }

  dist2(a, b) {
    const w = this.map.w;
    const dx = (a % w) - (b % w), dy = ((a / w) | 0) - ((b / w) | 0);
    return dx * dx + dy * dy;
  }

  allianceKey(a, b) { return a < b ? `${a}:${b}` : `${b}:${a}`; }
  isAllied(a, b) { return this.alliances.has(this.allianceKey(a, b)); }

  maxTroopsOf(p) {
    return p.territory * MAX_PER_TERRITORY + MAX_BASE + p.cities * CITY_MAX_BONUS;
  }

  setOwner(cell, p) {
    const prev = this.owner[cell];
    if (prev === p) return;
    if (prev >= 0) this.players[prev].territory--;
    this.owner[cell] = p;
    if (p >= 0) this.players[p].territory++;
    // Gebäude wechseln mit der Zelle den Besitzer
    const b = this.buildingAt.get(cell);
    if (b) {
      if (b.owner >= 0) this.players[b.owner][KIND_FIELD[b.kind]]--;
      if (p >= 0) {
        b.owner = p;
        this.players[p][KIND_FIELD[b.kind]]++;
      } else {
        this.buildingAt.delete(cell);
        this.buildings = this.buildings.filter(x => x !== b);
      }
    }
    this.dirty.push(cell);
  }

  placeBlob(pIdx, center, radius) {
    // BFS über Land, besetzt freie Zellen im Umkreis
    const visited = new Set([center]);
    const queue = [[center, 0]];
    const nb = new Int32Array(4);
    while (queue.length) {
      const [c, d] = queue.shift();
      if (this.owner[c] === -1 && this.map.terrain[c] === 1) this.setOwner(c, pIdx);
      if (d >= radius) continue;
      const k = this.neighbors4(c, nb);
      for (let i = 0; i < k; i++) {
        const m = nb[i];
        if (!visited.has(m) && this.map.terrain[m] === 1) {
          visited.add(m);
          queue.push([m, d + 1]);
        }
      }
    }
  }

  clearPlayerCells(pIdx) {
    const n = this.map.w * this.map.h;
    for (let i = 0; i < n; i++) if (this.owner[i] === pIdx) this.setOwner(i, -1);
  }

  placeInitialSpawns() {
    // Nur auf ausreichend großen Inseln starten
    const candidates = this.landCells.filter(c => this.map.islandSizes[this.map.island[c]] >= 400);
    const pool = candidates.length ? candidates : this.landCells;
    const spawns = [];
    for (const p of this.players) {
      let best = -1, bestScore = -1;
      for (let t = 0; t < 40; t++) {
        const cand = pool[(this.rng() * pool.length) | 0];
        let score = Infinity;
        for (const s of spawns) {
          const d = this.dist2(cand, s);
          if (d < score) score = d;
        }
        if (spawns.length === 0) score = this.rng() * 1000;
        if (score > bestScore) { bestScore = score; best = cand; }
      }
      spawns.push(best);
      this.placeBlob(p.idx, best, 3);
    }
  }

  // ---------- Intents ----------
  applyIntent(it) {
    const p = this.players[it.p];
    if (!p || !p.alive) return;
    switch (it.type) {
      case 'spawn': {
        if (this.phase !== 'spawn') return;
        const c = it.cell | 0;
        if (c < 0 || c >= this.owner.length) return;
        if (this.map.terrain[c] !== 1 || this.owner[c] !== -1) return;
        this.clearPlayerCells(p.idx);
        this.placeBlob(p.idx, c, 3);
        break;
      }
      case 'attack': {
        if (this.phase !== 'play') return;
        const target = it.target;
        if (target === p.idx) return;
        if (target >= 0) {
          if (!this.players[target] || !this.players[target].alive) return;
          if (this.isAllied(p.idx, target)) return;
        }
        const ratio = Math.max(0.01, Math.min(1, it.ratio || 0.3));
        const troops = Math.floor(p.troops * ratio);
        if (troops < 1) return;
        p.troops -= troops;
        const existing = this.attacks.find(a => a.attacker === p.idx && a.target === target);
        if (existing) {
          existing.pool += troops; // Nachschub für die laufende Front
        } else {
          this.attacks.push({ attacker: p.idx, target, pool: troops, frontier: new Set(), cd: 1, stall: 0 });
        }
        break;
      }
      case 'boat': {
        if (this.phase !== 'play') return;
        const c = it.cell | 0;
        if (c < 0 || c >= this.owner.length || this.map.terrain[c] !== 1) return;
        const o = this.owner[c];
        if (o === p.idx) return;
        if (o >= 0 && (!this.players[o].alive || this.isAllied(p.idx, o))) return;
        if (this.boats.filter(b => b.owner === p.idx).length >= MAX_BOATS) return;
        const ratio = Math.max(0.01, Math.min(1, it.ratio || 0.3));
        const troops = Math.floor(p.troops * ratio);
        if (troops < BOAT_MIN_TROOPS) return;
        const res = this.findBoatPath(p.idx, c);
        if (!res) return;
        p.troops -= troops;
        this.boats.push({ owner: p.idx, troops, path: res.path, landing: res.landing, pos: 0 });
        break;
      }
      case 'build': {
        if (this.phase !== 'play') return;
        const kind = BUILD_COSTS[it.kind] ? it.kind : 'city';
        const c = it.cell | 0;
        if (this.canBuildAt(p.idx, c, kind) !== null) return;
        p.money -= this.buildCostOf(p.idx, kind);
        const b = { owner: p.idx, kind, cell: c };
        this.buildings.push(b);
        this.buildingAt.set(c, b);
        p[KIND_FIELD[kind]]++;
        break;
      }
      case 'warship': {
        if (this.phase !== 'play') return;
        const c = it.cell | 0;
        const b = this.buildingAt.get(c);
        if (!b || b.kind !== 'port' || b.owner !== p.idx) return;
        if (p.money < WARSHIP_COST) return;
        if (this.warships.filter(w => w.owner === p.idx).length >= p.ports * 2) return;
        // Startzelle: Wasser neben dem Hafen
        const nb = new Int32Array(4);
        const k = this.neighbors4(c, nb);
        let spawn = -1;
        for (let i = 0; i < k; i++) if (this.map.terrain[nb[i]] === 0) { spawn = nb[i]; break; }
        if (spawn < 0) return;
        p.money -= WARSHIP_COST;
        this.warships.push({ owner: p.idx, home: c, cell: spawn, path: [], pi: 0, dmg: 0, born: this.turnNo, cd: WARSHIP_SHOT_CD });
        break;
      }
      case 'ally': {
        const t = it.target | 0;
        if (t === p.idx || !this.players[t] || !this.players[t].alive) return;
        if (this.isAllied(p.idx, t)) return;
        if (this.allyRequests.has(`${t}:${p.idx}`)) {
          // Gegenseitige Anfrage -> Allianz kommt zustande
          this.allyRequests.delete(`${t}:${p.idx}`);
          this.allyRequests.delete(`${p.idx}:${t}`);
          this.alliances.add(this.allianceKey(p.idx, t));
          // Laufende Angriffe zwischen den Partnern abbrechen (Truppen zurück)
          for (const atk of this.attacks) {
            if ((atk.attacker === p.idx && atk.target === t) || (atk.attacker === t && atk.target === p.idx)) {
              this.players[atk.attacker].troops += atk.pool;
              atk.pool = 0;
            }
          }
        } else {
          this.allyRequests.add(`${p.idx}:${t}`);
        }
        break;
      }
      case 'unally': {
        const t = it.target | 0;
        if (!this.players[t]) return;
        this.alliances.delete(this.allianceKey(p.idx, t));
        this.allyRequests.delete(`${p.idx}:${t}`);
        this.allyRequests.delete(`${t}:${p.idx}`);
        break;
      }
      case 'leave': {
        // Verlassene Spieler werden von der Bot-KI übernommen (Stufe Mittel)
        p.isBot = true;
        p.botLevel = 1;
        break;
      }
    }
  }

  // Aktueller Preis: verdoppelt sich je gebautem Gebäude des Typs (max. 8x).
  // Häfen und Fabriken teilen sich den Zähler.
  buildCostOf(pIdx, kind) {
    const p = this.players[pIdx];
    let count = 0;
    if (kind === 'city') count = p.cities;
    else if (kind === 'port' || kind === 'factory') count = p.ports + p.factories;
    return BUILD_COSTS[kind] * Math.pow(2, Math.min(COST_DOUBLINGS_CAP, count));
  }

  // null = Bauen erlaubt, sonst Fehlermeldung
  canBuildAt(pIdx, cell, kind) {
    const p = this.players[pIdx];
    if (cell < 0 || cell >= this.owner.length || this.owner[cell] !== pIdx) return 'Nur auf eigenem Gebiet baubar.';
    const cost = this.buildCostOf(pIdx, kind);
    if (p.money < cost) return `Nicht genug Geld (${cost} € nötig).`;
    if (kind === 'port') {
      const nb = new Int32Array(4);
      const k = this.neighbors4(cell, nb);
      let coastal = false;
      for (let i = 0; i < k; i++) if (this.map.terrain[nb[i]] === 0) coastal = true;
      if (!coastal) return 'Ein Hafen braucht Küste (Zelle am Wasser).';
    }
    for (const b of this.buildings) {
      if (b.owner === pIdx && this.dist2(b.cell, cell) < MIN_BUILD_DIST2) return 'Zu nah an einem eigenen Gebäude.';
    }
    return null;
  }

  scanFrontier(attacker, target) {
    const frontier = new Set();
    const n = this.map.w * this.map.h;
    const nb = new Int32Array(4);
    for (let c = 0; c < n; c++) {
      if (this.owner[c] !== attacker) continue;
      const k = this.neighbors4(c, nb);
      for (let i = 0; i < k; i++) {
        const m = nb[i];
        if (this.map.terrain[m] === 1 && this.owner[m] === target) frontier.add(m);
      }
    }
    return frontier;
  }

  // Festungs-Bonus des Verteidigers für eine Zelle
  fortBonus(cell, defIdx) {
    if (defIdx < 0) return 1;
    for (const b of this.buildings) {
      if (b.kind === 'fort' && b.owner === defIdx && this.dist2(b.cell, cell) <= FORT_RADIUS2) return FORT_DEFENSE;
    }
    return 1;
  }

  // ---------- Boote ----------
  // BFS über Wasser von den eigenen Küsten zur Ziel-Insel.
  // Bevorzugt eine Landung auf Zellen des angeklickten Besitzers,
  // sonst neutral, sonst ein beliebiger Feind auf der Insel.
  findBoatPath(pIdx, targetCell) {
    const { w, terrain, island } = this.map;
    const n = this.owner.length;
    const targetIsland = island[targetCell];
    const wantOwner = this.owner[targetCell];
    const prev = new Int32Array(n).fill(-2); // -2 = unbesucht, -1 = Startzelle
    const queue = new Int32Array(n);
    let head = 0, tail = 0;
    const nb = new Int32Array(4);
    for (let c = 0; c < n; c++) {
      if (this.owner[c] !== pIdx) continue;
      const k = this.neighbors4(c, nb);
      for (let i = 0; i < k; i++) {
        const m = nb[i];
        if (terrain[m] === 0 && prev[m] === -2) { prev[m] = -1; queue[tail++] = m; }
      }
    }
    let best = -1, bestLanding = -1;
    let fbNeutral = -1, fbNeutralLanding = -1;
    let fbEnemy = -1, fbEnemyLanding = -1;
    while (head < tail && best < 0) {
      const c = queue[head++];
      const k = this.neighbors4(c, nb);
      for (let i = 0; i < k; i++) {
        const m = nb[i];
        if (terrain[m] === 0) {
          if (prev[m] === -2) { prev[m] = c; queue[tail++] = m; }
          continue;
        }
        if (island[m] !== targetIsland) continue;
        const o = this.owner[m];
        if (o === wantOwner && best < 0) { best = c; bestLanding = m; }
        else if (o === -1 && fbNeutral < 0) { fbNeutral = c; fbNeutralLanding = m; }
        else if (o >= 0 && o !== pIdx && !this.isAllied(o, pIdx) && fbEnemy < 0) { fbEnemy = c; fbEnemyLanding = m; }
      }
    }
    let end = best, landing = bestLanding;
    if (end < 0) { end = fbNeutral; landing = fbNeutralLanding; }
    if (end < 0) { end = fbEnemy; landing = fbEnemyLanding; }
    if (end < 0) return null;
    const path = [];
    for (let c = end; c !== -1; c = prev[c]) path.push(c);
    path.reverse();
    return { path, landing };
  }

  processBoats() {
    for (const boat of this.boats) {
      const p = this.players[boat.owner];
      if (!p.alive) { boat.done = true; continue; }
      boat.pos += BOAT_SPEED;
      if (boat.pos < boat.path.length - 1) continue;
      boat.done = true;
      const cell = boat.landing;
      const o = this.owner[cell];
      if (o === boat.owner || (o >= 0 && this.isAllied(o, boat.owner))) {
        p.troops += boat.troops; // Landung unnötig/blockiert – Truppen zurück
        continue;
      }
      const defender = o >= 0 ? this.players[o] : null;
      const density = defender ? defender.troops / Math.max(1, defender.territory) : 0;
      const cost = (defender ? ENEMY_COST_BASE + density * ENEMY_COST_DENSITY : NEUTRAL_COST) * this.fortBonus(cell, o);
      if (boat.troops <= cost) continue; // Landung abgewehrt
      let pool = boat.troops - cost;
      if (defender) defender.troops = Math.max(0, defender.troops - density * 0.9);
      this.setOwner(cell, boat.owner);
      if (defender && defender.territory === 0) this.eliminate(defender);
      if (pool >= 1) {
        // Brückenkopf: Rest kämpft als normaler Angriff weiter
        const existing = this.attacks.find(a => a.attacker === boat.owner && a.target === o);
        if (existing) existing.pool += pool;
        else this.attacks.push({ attacker: boat.owner, target: o, pool, frontier: new Set(), cd: 1, stall: 0 });
      }
    }
    this.boats = this.boats.filter(b => !b.done);
  }

  // ---------- Wasser-Wegsuche (generisch) ----------
  bfsWater(sources, goalFn) {
    const { terrain } = this.map;
    const n = this.owner.length;
    const prev = new Int32Array(n).fill(-2);
    const queue = new Int32Array(n);
    let head = 0, tail = 0;
    for (const s of sources) {
      if (terrain[s] === 0 && prev[s] === -2) { prev[s] = -1; queue[tail++] = s; }
    }
    const nb = new Int32Array(4);
    while (head < tail) {
      const c = queue[head++];
      if (goalFn(c)) {
        const path = [];
        for (let x = c; x !== -1; x = prev[x]) path.push(x);
        path.reverse();
        return path;
      }
      const k = this.neighbors4(c, nb);
      for (let i = 0; i < k; i++) {
        const m = nb[i];
        if (terrain[m] === 0 && prev[m] === -2) { prev[m] = c; queue[tail++] = m; }
      }
    }
    return null;
  }

  waterAdjacent(cell) {
    const nb = new Int32Array(4);
    const k = this.neighbors4(cell, nb);
    const out = [];
    for (let i = 0; i < k; i++) if (this.map.terrain[nb[i]] === 0) out.push(nb[i]);
    return out;
  }

  portWaterPath(fromCell, toCell) {
    const sources = this.waterAdjacent(fromCell);
    if (!sources.length) return null;
    const targets = new Set(this.waterAdjacent(toCell));
    if (!targets.size) return null;
    return this.bfsWater(sources, c => targets.has(c));
  }

  // ---------- Handel (Häfen & Handelsschiffe) ----------
  tradeShipCell(s) {
    return s.path[Math.min(s.path.length - 1, s.pos | 0)];
  }

  processTrade() {
    // Häfen schicken Handelsschiffe zu fremden Häfen
    for (const b of this.buildings) {
      if (b.kind !== 'port' || !this.players[b.owner].alive) continue;
      if ((this.turnNo + b.cell) % TRADE_INTERVAL !== 0) continue;
      const own = this.tradeShips.filter(s => s.owner === b.owner).length;
      if (own >= this.players[b.owner].ports * TRADE_CAP_PER_PORT) continue;
      const targets = this.buildings.filter(x => x.kind === 'port' && x.owner !== b.owner && this.players[x.owner].alive);
      if (!targets.length) continue;
      for (let t = 0; t < 3; t++) {
        const target = targets[(this.rng() * targets.length) | 0];
        const path = this.portWaterPath(b.cell, target.cell);
        if (path) {
          this.tradeShips.push({ owner: b.owner, to: target.cell, path, pos: 0 });
          break;
        }
      }
    }
    // Bewegung & Ankunft: beide Seiten verdienen
    for (const s of this.tradeShips) {
      if (s.done) continue;
      if (!this.players[s.owner].alive) { s.done = true; continue; }
      s.pos += TRADE_SPEED;
      if (s.pos >= s.path.length - 1) {
        s.done = true;
        const port = this.buildingAt.get(s.to);
        if (port && port.kind === 'port') {
          const value = TRADE_VALUE_BASE + s.path.length * TRADE_VALUE_PER_CELL;
          this.players[s.owner].money += value;
          if (this.players[port.owner].alive) this.players[port.owner].money += value;
        }
      }
    }
    this.tradeShips = this.tradeShips.filter(s => !s.done);
  }

  // ---------- Kriegsschiffe ----------
  warshipMaxHp(w) {
    return WARSHIP_BASE_HP + Math.min(WARSHIP_BONUS_HP, ((this.turnNo - w.born) / WARSHIP_HP_GROW) | 0);
  }

  retargetWarship(w, maxHp) {
    let goal = null; // Zielzelle (Wasser) oder Prädikat
    if (w.dmg >= maxHp - 1) {
      // Schwer beschädigt: zum nächsten eigenen/verbündeten Hafen zur Reparatur
      let best = -1, bestD = Infinity;
      for (const b of this.buildings) {
        if (b.kind !== 'port') continue;
        if (b.owner !== w.owner && !this.isAllied(b.owner, w.owner)) continue;
        const d = this.dist2(b.cell, w.cell);
        if (d < bestD) { bestD = d; best = b.cell; }
      }
      if (best >= 0) {
        const targets = new Set(this.waterAdjacent(best));
        if (targets.size) goal = c => targets.has(c);
      }
    }
    if (!goal) {
      // Nicht-verbündetes Handelsschiff in der Nähe jagen
      let prey = null, preyD = Infinity;
      for (const s of this.tradeShips) {
        if (s.owner === w.owner || this.isAllied(s.owner, w.owner)) continue;
        const d = this.dist2(this.tradeShipCell(s), w.cell);
        if (d < preyD && d <= WARSHIP_CHASE_R2) { preyD = d; prey = s; }
      }
      if (prey) {
        const target = this.tradeShipCell(prey);
        goal = c => this.dist2(c, target) <= 2;
      }
    }
    if (!goal) {
      // Patrouille: zufälliger Wasserpunkt um den Heimathafen
      const w0 = this.map.w;
      const hx = w.home % w0, hy = (w.home / w0) | 0;
      for (let t = 0; t < 12 && !goal; t++) {
        const x = hx + ((this.rng() * 2 - 1) * WARSHIP_PATROL_R) | 0;
        const y = hy + ((this.rng() * 2 - 1) * WARSHIP_PATROL_R) | 0;
        if (x < 0 || y < 0 || x >= this.map.w || y >= this.map.h) continue;
        const c = y * w0 + x;
        if (this.map.terrain[c] === 0) goal = q => q === c;
      }
    }
    if (goal) {
      const path = this.bfsWater([w.cell], goal);
      if (path) { w.path = path; w.pi = 0; }
    }
  }

  processWarships() {
    for (const w of this.warships) {
      if (!this.players[w.owner].alive) { w.dead = true; continue; }
      const maxHp = this.warshipMaxHp(w);
      if (w.dmg >= maxHp) { w.dead = true; continue; }
      // Reparatur nahe eigenem/verbündetem Hafen
      if (w.dmg > 0 && this.turnNo % REPAIR_INTERVAL === 0) {
        for (const b of this.buildings) {
          if (b.kind !== 'port') continue;
          if (b.owner !== w.owner && !this.isAllied(b.owner, w.owner)) continue;
          if (this.dist2(b.cell, w.cell) <= REPAIR_DIST2) { w.dmg--; break; }
        }
      }
      // Kurs setzen / erneuern
      if (w.pi >= w.path.length || this.turnNo % 25 === w.born % 25) {
        this.retargetWarship(w, maxHp);
      }
      if (w.pi < w.path.length) w.cell = w.path[w.pi++];
      // Nicht-verbündete Handelsschiffe durch Berührung kapern
      for (const s of this.tradeShips) {
        if (s.owner !== w.owner && !this.isAllied(s.owner, w.owner) &&
            this.dist2(this.tradeShipCell(s), w.cell) <= CONVERT_DIST2) {
          s.owner = w.owner;
        }
      }
      // Schießen: Transportboote (1 Treffer) und feindliche Kriegsschiffe
      if (--w.cd <= 0) {
        let target = null, targetD = Infinity, isBoat = false;
        for (const b of this.boats) {
          if (b.done || b.owner === w.owner || this.isAllied(b.owner, w.owner)) continue;
          const c = b.path[Math.min(b.path.length - 1, b.pos | 0)];
          const d = this.dist2(c, w.cell);
          if (d <= WARSHIP_RANGE2 && d < targetD) { targetD = d; target = b; isBoat = true; }
        }
        for (const e of this.warships) {
          if (e === w || e.dead || e.owner === w.owner || this.isAllied(e.owner, w.owner)) continue;
          const d = this.dist2(e.cell, w.cell);
          if (d <= WARSHIP_RANGE2 && d < targetD) { targetD = d; target = e; isBoat = false; }
        }
        if (target) {
          w.cd = WARSHIP_SHOT_CD;
          if (isBoat) target.done = true; // Transportschiffe sinken nach einem Treffer
          else {
            target.dmg++;
            if (target.dmg >= this.warshipMaxHp(target)) target.dead = true;
          }
        }
      }
    }
    this.warships = this.warships.filter(w => !w.dead);
  }

  // ---------- Fabriken & Züge ----------
  factoryStations(factory) {
    return this.buildings.filter(b =>
      (b.kind === 'city' || b.kind === 'port') && this.dist2(b.cell, factory.cell) <= FACTORY_RADIUS2);
  }

  trainPos(tr) {
    // Position auf der Schiene (für Renderer): Fabrik <-> Station
    const w = this.map.w;
    const fx = tr.factory % w, fy = (tr.factory / w) | 0;
    const sx = tr.station % w, sy = (tr.station / w) | 0;
    const t = tr.out ? tr.t : 1 - tr.t;
    return [fx + (sx - fx) * t, fy + (sy - fy) * t];
  }

  processTrains() {
    // Chance auf neue Züge je Fabrik
    for (const b of this.buildings) {
      if (b.kind !== 'factory' || !this.players[b.owner].alive) continue;
      if ((this.turnNo + b.cell) % TRAIN_INTERVAL !== 0) continue;
      if (this.trains.filter(t => t.factory === b.cell).length >= TRAIN_CAP) continue;
      const stations = this.factoryStations(b);
      if (!stations.length) continue;
      if (this.rng() < TRAIN_CHANCE) {
        this.trains.push({
          owner: b.owner,
          factory: b.cell,
          station: stations[(this.rng() * stations.length) | 0].cell,
          t: 0,
          out: true,
          visits: 0,
        });
      }
    }
    // Fahren, Stationen berühren, Geld einsammeln
    for (const tr of this.trains) {
      if (!this.players[tr.owner].alive) { tr.dead = true; continue; }
      const fac = this.buildingAt.get(tr.factory);
      if (!fac || fac.kind !== 'factory') { tr.dead = true; continue; }
      const len = Math.max(1, Math.sqrt(this.dist2(tr.factory, tr.station)));
      tr.t += TRAIN_SPEED / len;
      if (tr.t < 1) continue;
      tr.t = 0;
      if (tr.out) {
        // Station erreicht: Geld – eigene < fremde < verbündete
        const st = this.buildingAt.get(tr.station);
        if (st) {
          const pay = st.owner === tr.owner ? TRAIN_PAY.own
            : this.isAllied(st.owner, tr.owner) ? TRAIN_PAY.ally
            : TRAIN_PAY.enemy;
          this.players[tr.owner].money += pay;
        }
        tr.out = false;
      } else {
        tr.visits++;
        if (tr.visits >= TRAIN_VISITS) { tr.dead = true; continue; }
        const stations = this.factoryStations(fac);
        if (!stations.length) { tr.dead = true; continue; }
        tr.station = stations[(this.rng() * stations.length) | 0].cell;
        tr.out = true;
      }
    }
    this.trains = this.trains.filter(t => !t.dead);
  }

  // ---------- Tick ----------
  turn(intents) {
    if (this.phase === 'ended') return;
    for (const it of intents) this.applyIntent(it);

    if (this.phase === 'spawn') {
      this.turnNo++;
      if (this.turnNo >= SPAWN_TURNS) this.phase = 'play';
      return;
    }

    this.botThink();
    this.economy();
    this.processBoats();
    this.processTrade();
    this.processWarships();
    this.processTrains();
    this.processAttacks();
    if (this.turnNo % 10 === 0) this.checkWin();
    this.turnNo++;
  }

  // Truppenwachstum pro Tick: Kurve mit Maximum bei 40% des Limits
  troopGrowthOf(p) {
    const max = this.maxTroopsOf(p);
    const f = p.troops / max;
    const curve = f < GROWTH_PEAK
      ? 0.3 + 0.7 * (f / GROWTH_PEAK)
      : Math.max(0, (1 - f) / (1 - GROWTH_PEAK));
    return (3 + p.territory * 0.028 + p.cities * 4) * curve;
  }

  economy() {
    for (const p of this.players) {
      if (!p.alive || p.territory === 0) continue;
      const max = this.maxTroopsOf(p);
      p.troops = Math.min(max, p.troops + this.troopGrowthOf(p));
      p.money += MONEY_BASE + p.territory * MONEY_PER_TERRITORY;
    }
  }

  processAttacks() {
    for (const atk of this.attacks) {
      const attacker = this.players[atk.attacker];
      if (!attacker.alive) { atk.pool = 0; continue; }
      const defender = atk.target >= 0 ? this.players[atk.target] : null;
      if (defender && !defender.alive) {
        attacker.troops += atk.pool; // Ziel bereits eliminiert – Rest zurück
        atk.pool = 0;
        continue;
      }
      if (defender && this.isAllied(atk.attacker, atk.target)) {
        attacker.troops += atk.pool; // Allianz kam zustande
        atk.pool = 0;
        continue;
      }
      // Front rückt im Takt vor (nicht jeden Tick)
      if (--atk.cd > 0) continue;
      atk.cd = defender ? ENEMY_INTERVAL : NEUTRAL_INTERVAL;

      // Die Front wird vor jedem Vorstoß frisch von der aktuellen Grenze
      // berechnet – so bleibt sie auch bei Gegenangriffen korrekt und
      // rückt als geschlossene Linie vor statt in Flecken.
      atk.frontier = this.scanFrontier(atk.attacker, atk.target);
      if (atk.frontier.size === 0) {
        attacker.troops += atk.pool; // keine gemeinsame Grenze – Truppen zurück
        atk.pool = 0;
        continue;
      }

      const density = defender ? defender.troops / Math.max(1, defender.territory) : 0;
      const baseCost = defender ? ENEMY_COST_BASE + density * ENEMY_COST_DENSITY : NEUTRAL_COST;
      let captured = 0;
      for (const cell of atk.frontier) {
        const cellCost = baseCost * this.fortBonus(cell, atk.target);
        if (atk.pool < cellCost) continue; // z.B. Festungszelle zu teuer
        atk.pool -= cellCost;
        if (defender) {
          defender.troops = Math.max(0, defender.troops - density * 0.9);
        }
        this.setOwner(cell, atk.attacker);
        captured++;
        if (defender && defender.territory === 0) {
          this.eliminate(defender);
          break;
        }
      }

      if (captured === 0) {
        // Front steht (z.B. alles festungsgeschützt) – nach 6 Anläufen abbrechen
        atk.stall = (atk.stall || 0) + 1;
        if (atk.stall >= 6) {
          attacker.troops += atk.pool;
          atk.pool = 0;
        }
        continue;
      }
      atk.stall = 0;
      if (atk.pool < 1) {
        atk.pool = 0;
      } else if (atk.pool < baseCost) {
        attacker.troops += atk.pool; // zu wenig für den nächsten Vorstoß
        atk.pool = 0;
      }
    }
    this.attacks = this.attacks.filter(a => a.pool > 0);
  }

  eliminate(p) {
    p.alive = false;
    p.troops = 0;
    for (const atk of this.attacks) {
      if (atk.attacker === p.idx) atk.pool = 0;
    }
    for (const boat of this.boats) {
      if (boat.owner === p.idx) boat.done = true;
    }
    for (const key of [...this.allyRequests]) {
      const [a, b] = key.split(':');
      if (+a === p.idx || +b === p.idx) this.allyRequests.delete(key);
    }
  }

  // Allianz-Gruppen (zusammenhängende Bündnisse) unter den Lebenden
  allianceGroups(alive) {
    const groups = [];
    const seen = new Set();
    for (const p of alive) {
      if (seen.has(p.idx)) continue;
      const grp = [p.idx];
      seen.add(p.idx);
      const stack = [p.idx];
      while (stack.length) {
        const a = stack.pop();
        for (const q of alive) {
          if (!seen.has(q.idx) && this.isAllied(a, q.idx)) {
            seen.add(q.idx);
            grp.push(q.idx);
            stack.push(q.idx);
          }
        }
      }
      groups.push(grp.sort((a, b) => a - b));
    }
    return groups;
  }

  checkWin() {
    const alive = this.players.filter(p => p.alive);
    if (alive.length === 0) return;
    const groups = this.allianceGroups(alive);
    // Nur noch ein Spieler / ein Bündnis übrig -> (Team-)Sieg
    if (groups.length === 1) {
      this.winners = groups[0];
      this.phase = 'ended';
      return;
    }
    // Ein Bündnis kontrolliert gemeinsam 70% des Landes
    for (const grp of groups) {
      let sum = 0;
      for (const idx of grp) sum += this.players[idx].territory;
      if (sum / this.map.landCount >= WIN_FRACTION) {
        this.winners = grp;
        this.phase = 'ended';
        return;
      }
    }
  }

  // ---------- Bot-KI ----------
  botThink() {
    for (const p of this.players) {
      if (!p.isBot || !p.alive) continue;
      const L = BOT_LEVELS[p.botLevel];
      if (this.turnNo % L.interval !== (p.idx * 5) % L.interval) continue;
      this.botAct(p, L);
    }
  }

  randomOwnCell(pIdx, tries) {
    for (let t = 0; t < tries; t++) {
      const c = this.landCells[(this.rng() * this.landCells.length) | 0];
      if (this.owner[c] === pIdx) return c;
    }
    return -1;
  }

  // Bots geben ihr Geld für Gebäude und Schiffe aus
  botBuild(p, L) {
    if (!L.city || p.territory < 150) return;
    // 1. Hafen an der Küste (Handel = Haupteinnahmequelle)
    if (p.ports < 2 && p.money > this.buildCostOf(p.idx, 'port') + 100) {
      for (let t = 0; t < 30; t++) {
        const c = this.randomOwnCell(p.idx, 5);
        if (c >= 0 && this.canBuildAt(p.idx, c, 'port') === null) {
          this.applyIntent({ p: p.idx, type: 'build', kind: 'port', cell: c });
          return;
        }
      }
    }
    // 2. Stadt, wenn das Truppenlimit drückt
    if (p.troops > this.maxTroopsOf(p) * 0.6 && p.money > this.buildCostOf(p.idx, 'city')) {
      const c = this.randomOwnCell(p.idx, 20);
      if (c >= 0 && this.canBuildAt(p.idx, c, 'city') === null) {
        this.applyIntent({ p: p.idx, type: 'build', kind: 'city', cell: c });
        return;
      }
    }
    // 3. Fabrik nahe eigener Stationen (Züge = Geld)
    if (p.factories < 2 && (p.cities + p.ports) >= 2 && p.money > this.buildCostOf(p.idx, 'factory') + 100) {
      const stations = this.buildings.filter(b => b.owner === p.idx && (b.kind === 'city' || b.kind === 'port'));
      for (let t = 0; t < 30 && stations.length; t++) {
        const c = this.randomOwnCell(p.idx, 5);
        if (c < 0) continue;
        const near = stations.some(s => this.dist2(s.cell, c) <= FACTORY_RADIUS2 * 0.6);
        if (near && this.canBuildAt(p.idx, c, 'factory') === null) {
          this.applyIntent({ p: p.idx, type: 'build', kind: 'factory', cell: c });
          return;
        }
      }
    }
    // 4. Schwere Bots: Festungen und Kriegsschiffe
    if (L.fort) {
      if (p.forts < 3 && p.money > BUILD_COSTS.fort + 300) {
        const c = this.randomOwnCell(p.idx, 20);
        if (c >= 0 && this.canBuildAt(p.idx, c, 'fort') === null) {
          this.applyIntent({ p: p.idx, type: 'build', kind: 'fort', cell: c });
          return;
        }
      }
      if (p.ports > 0 && p.money > WARSHIP_COST + 300 &&
          this.warships.filter(w => w.owner === p.idx).length < 2) {
        const port = this.buildings.find(b => b.owner === p.idx && b.kind === 'port');
        if (port) this.applyIntent({ p: p.idx, type: 'warship', cell: port.cell });
      }
    }
  }

  botAct(p, L) {
    // Allianz-Anfragen beantworten (Zustimmung je nach Schwierigkeit)
    for (let x = 0; x < this.players.length; x++) {
      const key = `${x}:${p.idx}`;
      if (this.allyRequests.has(key)) {
        if (this.rng() < L.allyAccept) this.applyIntent({ p: p.idx, type: 'ally', target: x });
        else this.allyRequests.delete(key);
      }
    }

    this.botBuild(p, L);

    if (p.troops < L.minTroops) return;
    let committed = 0;
    for (const a of this.attacks) if (a.attacker === p.idx) committed += a.pool;
    if (committed > p.troops * 0.8) return;

    // Nachbarn und eigene Inseln ermitteln (voller Scan, nur alle 2,5s pro Bot)
    const neighborOwners = new Set();
    const myIslands = new Set();
    const n = this.map.w * this.map.h;
    const nb = new Int32Array(4);
    for (let c = 0; c < n; c++) {
      if (this.owner[c] !== p.idx) continue;
      myIslands.add(this.map.island[c]);
      const k = this.neighbors4(c, nb);
      for (let i = 0; i < k; i++) {
        const m = nb[i];
        if (this.map.terrain[m] !== 1) continue;
        const o = this.owner[m];
        if (o !== p.idx) neighborOwners.add(o);
      }
    }

    if (neighborOwners.has(-1) && this.rng() < 0.9) {
      this.applyIntent({ p: p.idx, type: 'attack', target: -1, ratio: L.ratioN });
      return;
    }
    let weakest = null;
    for (const o of neighborOwners) {
      if (o < 0) continue;
      const e = this.players[o];
      if (!e.alive || this.isAllied(p.idx, o)) continue;
      if (!weakest || e.troops < weakest.troops) weakest = e;
    }
    if (weakest && p.troops > weakest.troops * L.threshold) {
      this.applyIntent({ p: p.idx, type: 'attack', target: weakest.idx, ratio: L.ratioE });
      return;
    }

    // Keine Ziele auf den eigenen Inseln -> per Boot expandieren
    if (this.boats.filter(b => b.owner === p.idx).length < 2 && p.troops > L.boatMin) {
      for (let t = 0; t < 40; t++) {
        const c = this.landCells[(this.rng() * this.landCells.length) | 0];
        if (this.owner[c] === -1 && !myIslands.has(this.map.island[c])) {
          this.applyIntent({ p: p.idx, type: 'boat', cell: c, ratio: 0.5 });
          return;
        }
      }
      // Kein neutrales Land mehr -> schwächsten Feind per Boot angreifen
      let target = null;
      for (const e of this.players) {
        if (!e.alive || e.idx === p.idx || this.isAllied(p.idx, e.idx)) continue;
        if (!target || e.troops < target.troops) target = e;
      }
      if (target && p.troops > target.troops * 1.2) {
        for (let t = 0; t < 40; t++) {
          const c = this.landCells[(this.rng() * this.landCells.length) | 0];
          if (this.owner[c] === target.idx) {
            this.applyIntent({ p: p.idx, type: 'boat', cell: c, ratio: 0.5 });
            return;
          }
        }
      }
    }
  }
}
