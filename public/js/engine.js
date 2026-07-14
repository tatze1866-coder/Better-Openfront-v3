// Deterministische Spiel-Engine (Lockstep).
// Alle Clients führen turn() mit identischen Intents in identischer
// Reihenfolge aus – dadurch bleibt das Spiel überall exakt gleich.
import { mulberry32 } from './rng.js';
import { generateMap } from './mapgen.js';

export const TURN_MS = 100;          // 10 Ticks pro Sekunde
export const SPAWN_TURNS = 120;      // 12 Sekunden Startpunkt-Wahl
export const MAP_W = 320;
export const MAP_H = 200;

// Wirtschaft (pro Tick)
const GROWTH_BASE = 0.8;
const GROWTH_PER_TERRITORY = 0.006;
const INTEREST = 0.0011;
const MAX_PER_TERRITORY = 120;
const MAX_BASE = 800;
const START_TROOPS = 512;

// Kampf
const NEUTRAL_COST = 1.0;
const ENEMY_COST_BASE = 1.4;
const ENEMY_COST_DENSITY = 1.6;
const NEUTRAL_SPEED = 0.3;           // Anteil der Front, der pro Tick fällt
const ENEMY_SPEED = 0.22;            // gegen Spieler etwas langsamer
const WIN_FRACTION = 0.7;            // 70% des Landes = Sieg

// Gebäude
export const CITY_COST = 500;
export const FORT_COST = 300;
const CITY_MAX_BONUS = 2500;         // Stadt: +max. Truppen
const CITY_INCOME = 1.2;             // Stadt: +Truppen pro Tick
const FORT_RADIUS2 = 64;             // Festung schützt im Radius 8
const FORT_DEFENSE = 2;              // Eroberung dort doppelt so teuer
const MIN_BUILD_DIST2 = 100;         // Mindestabstand 10 zwischen eigenen Gebäuden

// Boote
export const MAX_BOATS = 3;
const BOAT_SPEED = 2;                // Wasserzellen pro Tick
const BOAT_MIN_TROOPS = 20;

export const PLAYER_COLORS = [
  '#e63946', '#2a9d8f', '#4361ee', '#f4a261', '#9b5de5',
  '#00b4d8', '#ef476f', '#80b918', '#b5651d', '#5f0f40',
  '#ff9f1c', '#3a5a40', '#7209b7',
];

// Bot-Schwierigkeitsgrade: 0 = Leicht, 1 = Mittel, 2 = Schwer
export const BOT_LEVELS = [
  { name: 'Leicht', icon: '🟢', interval: 40, minTroops: 250, ratioN: 0.35, ratioE: 0.4, threshold: 1.5, allyAccept: 0.9, city: false, fort: false, boatMin: 700 },
  { name: 'Mittel', icon: '🟡', interval: 25, minTroops: 80, ratioN: 0.45, ratioE: 0.55, threshold: 1.1, allyAccept: 0.6, city: true, fort: false, boatMin: 300 },
  { name: 'Schwer', icon: '🔴', interval: 12, minTroops: 60, ratioN: 0.5, ratioE: 0.6, threshold: 0.95, allyAccept: 0.3, city: true, fort: true, boatMin: 200 },
];

export class Game {
  constructor({ seed, players }) {
    this.seed = seed;
    this.rng = mulberry32(seed);
    this.map = generateMap(seed, MAP_W, MAP_H);
    const n = this.map.w * this.map.h;
    this.owner = new Int16Array(n).fill(-1);
    this.turnNo = 0;
    this.phase = 'spawn'; // 'spawn' | 'play' | 'ended'
    this.winners = null;  // Array von Spieler-Indizes (Team-Sieg möglich)
    this.attacks = [];             // aktive Angriffe
    this.boats = [];               // Boote unterwegs
    this.buildings = [];           // Städte und Festungen
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
      territory: 0,
      cities: 0,
      forts: 0,
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
      if (b.owner >= 0) this.players[b.owner][b.kind === 'city' ? 'cities' : 'forts']--;
      if (p >= 0) {
        b.owner = p;
        this.players[p][b.kind === 'city' ? 'cities' : 'forts']++;
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
          existing.pool += troops;
        } else {
          const frontier = this.scanFrontier(p.idx, target);
          this.attacks.push({ attacker: p.idx, target, pool: troops, frontier, rescanned: false });
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
        const kind = it.kind === 'fort' ? 'fort' : 'city';
        const c = it.cell | 0;
        if (this.canBuildAt(p.idx, c, kind) !== null) return;
        p.troops -= kind === 'city' ? CITY_COST : FORT_COST;
        const b = { owner: p.idx, kind, cell: c };
        this.buildings.push(b);
        this.buildingAt.set(c, b);
        p[kind === 'city' ? 'cities' : 'forts']++;
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

  // null = Bauen erlaubt, sonst Fehlermeldung
  canBuildAt(pIdx, cell, kind) {
    const p = this.players[pIdx];
    if (cell < 0 || cell >= this.owner.length || this.owner[cell] !== pIdx) return 'Nur auf eigenem Gebiet baubar.';
    const cost = kind === 'city' ? CITY_COST : FORT_COST;
    if (p.troops < cost) return `Nicht genug Truppen (${cost} nötig).`;
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

  hasNeighborOwnedBy(cell, pIdx) {
    const nb = new Int32Array(4);
    const k = this.neighbors4(cell, nb);
    for (let i = 0; i < k; i++) if (this.owner[nb[i]] === pIdx) return true;
    return false;
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
        const frontier = new Set();
        const nb = new Int32Array(4);
        const k = this.neighbors4(cell, nb);
        for (let i = 0; i < k; i++) {
          const m = nb[i];
          if (this.map.terrain[m] === 1 && this.owner[m] === o) frontier.add(m);
        }
        this.attacks.push({ attacker: boat.owner, target: o, pool, frontier, rescanned: false });
      }
    }
    this.boats = this.boats.filter(b => !b.done);
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
    this.processAttacks();
    if (this.turnNo % 10 === 0) this.checkWin();
    this.turnNo++;
  }

  economy() {
    for (const p of this.players) {
      if (!p.alive || p.territory === 0) continue;
      const max = this.maxTroopsOf(p);
      p.troops += GROWTH_BASE + p.territory * GROWTH_PER_TERRITORY + p.troops * INTEREST + p.cities * CITY_INCOME;
      if (p.troops > max) p.troops = max;
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
      const density = defender ? defender.troops / Math.max(1, defender.territory) : 0;
      const baseCost = defender ? ENEMY_COST_BASE + density * ENEMY_COST_DENSITY : NEUTRAL_COST;
      const speed = defender ? ENEMY_SPEED : NEUTRAL_SPEED;
      let budget = Math.max(1, Math.round(atk.frontier.size * speed));
      let captured = 0;
      const snapshot = [...atk.frontier];
      for (const cell of snapshot) {
        if (budget <= 0 || atk.pool < baseCost) break;
        if (this.owner[cell] !== atk.target || !this.hasNeighborOwnedBy(cell, atk.attacker)) {
          atk.frontier.delete(cell);
          continue;
        }
        const cellCost = baseCost * this.fortBonus(cell, atk.target);
        if (atk.pool < cellCost) continue; // Festungszelle zu teuer – andere probieren
        // Zelle erobern
        atk.pool -= cellCost;
        if (defender) {
          defender.troops = Math.max(0, defender.troops - density * 0.9);
        }
        this.setOwner(cell, atk.attacker);
        atk.frontier.delete(cell);
        budget--;
        captured++;
        const nb = new Int32Array(4);
        const k = this.neighbors4(cell, nb);
        for (let i = 0; i < k; i++) {
          const m = nb[i];
          if (this.map.terrain[m] === 1 && this.owner[m] === atk.target) atk.frontier.add(m);
        }
        if (defender && defender.territory === 0) {
          this.eliminate(defender);
          break;
        }
      }
      atk.stall = captured === 0 ? (atk.stall || 0) + 1 : 0;
      if (atk.stall > 30) {
        // Angriff kommt nicht voran (z.B. Festung) – Truppen zurück
        attacker.troops += atk.pool;
        atk.pool = 0;
      } else if (atk.pool < 1) {
        atk.pool = 0;
      } else if (atk.pool < baseCost) {
        // zu wenig für die nächste Zelle – Rest kehrt zurück
        attacker.troops += atk.pool;
        atk.pool = 0;
      } else if (atk.frontier.size === 0) {
        if (!atk.rescanned) {
          atk.rescanned = true;
          atk.frontier = this.scanFrontier(atk.attacker, atk.target);
        }
        if (atk.frontier.size === 0) {
          attacker.troops += atk.pool; // keine Front mehr – Truppen kehren zurück
          atk.pool = 0;
        }
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

  botAct(p, L) {
    // Allianz-Anfragen beantworten (Zustimmung je nach Schwierigkeit)
    for (let x = 0; x < this.players.length; x++) {
      const key = `${x}:${p.idx}`;
      if (this.allyRequests.has(key)) {
        if (this.rng() < L.allyAccept) this.applyIntent({ p: p.idx, type: 'ally', target: x });
        else this.allyRequests.delete(key);
      }
    }

    if (p.troops < L.minTroops) return;
    let committed = 0;
    for (const a of this.attacks) if (a.attacker === p.idx) committed += a.pool;
    if (committed > p.troops * 0.8) return;

    // Stadt bauen, wenn das Truppenlimit drückt
    if (L.city && p.troops > this.maxTroopsOf(p) * 0.65 && p.troops > CITY_COST * 1.5 && p.territory > 250) {
      const c = this.randomOwnCell(p.idx, 20);
      if (c >= 0 && this.canBuildAt(p.idx, c, 'city') === null) {
        this.applyIntent({ p: p.idx, type: 'build', kind: 'city', cell: c });
      }
    }

    // Schwere Bots sichern ihr Reich mit Festungen ab
    if (L.fort && p.forts < 3 && p.troops > FORT_COST * 3 && p.territory > 200) {
      const c = this.randomOwnCell(p.idx, 20);
      if (c >= 0 && this.canBuildAt(p.idx, c, 'fort') === null) {
        this.applyIntent({ p: p.idx, type: 'build', kind: 'fort', cell: c });
      }
    }

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
