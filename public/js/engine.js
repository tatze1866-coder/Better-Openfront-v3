// Deterministische Spiel-Engine (Lockstep).
// Alle Clients führen turn() mit identischen Intents in identischer
// Reihenfolge aus – dadurch bleibt das Spiel überall exakt gleich.
import { mulberry32 } from './rng.js';
import { generateMap } from './mapgen.js';

export const TURN_MS = 100;          // 10 Ticks pro Sekunde
export const SPAWN_TURNS = 120;      // 12 Sekunden Startpunkt-Wahl

// Wählbare Kartengrößen
export const MAP_SIZES = {
  klein: { w: 480, h: 300, name: 'Klein' },
  mittel: { w: 720, h: 450, name: 'Mittel' },
  gross: { w: 960, h: 600, name: 'Groß' },
    riesig: { w: 1920, h: 1200, name: 'Riesig' },
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
// Truppenwachstum folgt einer Kurve: Maximum bei 42% des Truppenlimits,
// darunter ansteigend, darüber abfallend (0 bei vollem Limit). Bei 80% ist das
// Wachstum dadurch schon auf ~34% des Maximums eingebrochen.
export const GROWTH_PEAK = 0.42;     // Maximum der Wachstumskurve (42% des Limits)
const MAX_PER_TERRITORY = 3;         // Bevölkerung je eigener Zelle
const MAX_BASE = 1000;
const START_TROOPS = 400;
const REFILL_TICKS = 240;            // Ticks von 0 aufs Limit bei vollem Wachstum

// Geld (€): Basiseinkommen aus Gebiet; mehr über Handel und Züge
const START_MONEY = 300;
const MONEY_BASE = 0.05;             // € pro Tick
const MONEY_PER_TERRITORY = 0.0004;  // € pro Tick und Zelle

// Kampf: Angriffe rücken als geschlossene Linie vor – die komplette
// Front fällt auf einmal, im festen Takt (Ticks pro Vorstoß).
// Die Verluste sind bewusst hoch (rund doppelt so hart wie ursprünglich),
// damit Armeen im Gefecht schnell dahinschmelzen statt sich hinzuziehen.
const NEUTRAL_COST = 1.0;            // Expansion ins Neutrale bleibt günstig
const ENEMY_COST_BASE = 2.8;         // Grundverlust des Angreifers je Gegner-Zelle
const ENEMY_COST_DENSITY = 3.2;      // + Aufschlag nach Truppendichte des Verteidigers
const DEFENDER_LOSS_PER_CELL = 1.8;  // Verteidiger-Verlust je verlorener Zelle (× Dichte)
const NEUTRAL_INTERVAL = 3;          // gegen Neutral: Front alle 3 Ticks
const ENEMY_INTERVAL = 5;            // gegen Spieler: etwas langsamer
const CLASH_SPEED_CAP = 5;           // Gegenangriffe: max. Beschleunigung der stärkeren Front
// Vergeltung: Bots merken sich, wer sie zuletzt angegriffen hat, und schlagen
// bevorzugt zurück – Angriffe bleiben damit nie "gratis".
const GRUDGE_TICKS = 600;            // 60s: so lange hält der Groll
const REVENGE_THRESHOLD = 0.8;       // Gegenschlag schon ab 80% der Truppen des Angreifers
const TRAITOR_TICKS = 900;           // 90s: so lange gilt ein Allianzbrecher als Verräter
const ATTACK_SPEED_CAP = 4;          // Übermacht: max. Beschleunigung nach Pool/haltende Truppen
const WIN_FRACTION = 0.7;            // 70% des Landes = Sieg

// Gebäude – werden mit Geld (€) gebaut.
// Der Preis verdoppelt sich pro gebautem Gebäude des Typs bis zu einem Deckel.
// Städte gehen eine Stufe weiter (250 → 500 → 1.000 → 2.000 → 4.000): sie sind
// mit +25.000 Bevölkerung die stärkste Einzelinvestition und sollen sich nicht
// beliebig stapeln lassen. Häfen und Fabriken teilen sich dabei einen Zähler.
export const BUILD_COSTS = { city: 250, fort: 300, port: 400, factory: 600 };
const COST_DOUBLINGS_CAP = { city: 4, fort: 3, port: 3, factory: 3 };
export const WARSHIP_COST = 300;
const KIND_FIELD = { city: 'cities', fort: 'forts', port: 'ports', factory: 'factories' };
const CITY_MAX_BONUS = 25000;        // Stadt: +max. Truppen (wichtigstes Gebäude)
export const FORT_RADIUS = 30;       // Schutzradius einer Festung in Zellen
const FORT_RADIUS2 = FORT_RADIUS * FORT_RADIUS;
const FORT_DEFENSE = 8;              // Eroberung dort 8x so teuer (stapelt nicht)
export const FORT_HP = 3;            // Katapult-Treffer bis zur Zerstörung
// Ruinen: eine zerstörte Festung hinterlässt ein Trümmerfeld – die (Rück-)
// Eroberung im Umkreis kostet RUIN_COST-mal so viele Truppen.
const RUIN_RADIUS2 = 100;            // Trümmerfeld-Radius 10
const RUIN_COST = 2;
const MIN_BUILD_DIST2 = 100;         // Mindestabstand 10 zwischen eigenen Gebäuden
const PORT_SNAP_RADIUS = 8;          // Hafen-Klick springt bis zu 8 Zellen zur Küste
export const BUILD_DEPLOY_TICKS = 50; // 5s Aufbauzeit: Gebäude wirken erst danach

// Häfen & Handel
const TRADE_INTERVAL = 100;          // Hafen versucht alle 10s ein Handelsschiff
const TRADE_CAP_PER_PORT = 2;        // aktive Handelsschiffe je Hafen
const TRADE_SPEED = 1.5;             // Wasserzellen pro Tick
// Handelsgold = BASE + COEF * Weglänge^EXP. Der Exponent > 1 macht lange Routen
// überproportional lohnend (Vorbild: 10.000 + 150 * d^1,1, auf unsere
// Geld-Größenordnung heruntergerechnet).
const TRADE_VALUE_BASE = 20;         // € bei Ankunft (beide Seiten) – Häfen bewusst schwächer
const TRADE_VALUE_COEF = 0.3;        // € je Wegzelle^EXP
const TRADE_VALUE_EXP = 1.1;         // > 1 = weite Routen zahlen überproportional

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
export const FACTORY_RADIUS = 60;    // Schienennetz-Radius einer Fabrik in Zellen
const FACTORY_RADIUS2 = FACTORY_RADIUS * FACTORY_RADIUS;
const TRAIN_INTERVAL = 50;           // alle 5s Chance auf einen Zug
const TRAIN_CHANCE = 0.4;
const TRAIN_CAP = 3;                 // Züge gleichzeitig je Fabrik
const TRAIN_SPEED = 1.4;             // Zellen pro Tick entlang der Schiene
const TRAIN_VISITS = 6;              // Stationsbesuche, dann endet der Zug
// Geld je durchfahrener Station. Bei FREMDEN Stationen verdienen beide Seiten
// (der Zug-Besitzer und der Stationsbesitzer) – Verbündete bringen am meisten.
const TRAIN_PAY = { own: 12, foreign: 24, ally: 36 };

// Katapulte (Belagerungs-Einheit aus der Fabrik, fährt zu Land)
export const CATAPULT_COST = 500;
const CATAPULT_CAP_PER_FACTORY = 2;  // max. aktive Katapulte je Fabrik
const CATAPULT_SPEED = 1;            // Landzellen pro Tick
export const CATAPULT_RANGE = 8;     // Schussweite gegen Festungen
const CATAPULT_RANGE2 = CATAPULT_RANGE * CATAPULT_RANGE;
const CATAPULT_SHOT_CD = 15;         // Ticks zwischen Schüssen
const CATAPULT_SEEK_R2 = 1600;       // sucht selbständig Festungen im Radius 40

// Boote
export const MAX_BOATS = 3;
// Bewusst verlangsamt (früher 2): Boote fahren gemächlicher, damit man
// Invasionen kommen sieht und mit Kriegsschiffen abfangen kann.
const BOAT_SPEED = 1.2;              // Wasserzellen pro Tick
const BOAT_MIN_TROOPS = 20;

export const PLAYER_COLORS = [
  '#e63946', '#2a9d8f', '#4361ee', '#f4a261', '#9b5de5',
  '#00b4d8', '#ef476f', '#80b918', '#b5651d', '#5f0f40',
  '#ff9f1c', '#3a5a40', '#7209b7', '#ffd60a', '#06d6a0',
  '#ff70a6', '#003566', '#a3b18a', '#38b000', '#e0aaff',
];

// Bot-Profile. 0–2 sind die Schwierigkeitsgrade der NATIONEN (starke Bots,
// wählbar im Menü). Index 3 ist der Masse-Bot: absichtlich schlecht und passiv
// – er expandiert langsam ins Neutrale, baut nichts, fährt keine Boote und
// greift Spieler nur an, wenn er haushoch überlegen ist. Davon gibt es viele.
//
// "Schwer" hat zusaetzlich smart:true -> in botAct() nutzt das eine dichte-
// basierte Zielauswahl (wer ist GUENSTIG zu erobern, nicht nur wer hat
// weniger Truppen) und in botBuild() hoehere Gebaeude-Obergrenzen plus
// gezielte Festungen an der eigenen Grenze statt auf gut Glueck irgendwo.
export const BOT_LEVELS = [
  { name: 'Leicht', icon: '🟢', interval: 26, minTroops: 150, ratioN: 0.45, ratioE: 0.5,  threshold: 1.1,  allyAccept: 0.75, city: false, fort: false, boatMin: 450, maxPorts: 2, maxForts: 0, maxFactories: 0, maxWarships: 0, smart: false },
  { name: 'Mittel', icon: '🟡', interval: 13, minTroops: 45,  ratioN: 0.55, ratioE: 0.65, threshold: 0.75, allyAccept: 0.4,  city: true,  fort: false, boatMin: 170, maxPorts: 3, maxForts: 1, maxFactories: 1, maxWarships: 1, smart: false },
  { name: 'Schwer', icon: '🔴', interval: 4,  minTroops: 20,  ratioN: 0.75, ratioE: 0.8,  threshold: 0.5,  allyAccept: 0.08, city: true,  fort: true,  boatMin: 70,  maxPorts: 6, maxForts: 6, maxFactories: 4, maxWarships: 3, smart: true },
  { name: 'Bot', icon: '🤖', interval: 60, minTroops: 300, ratioN: 0.35, ratioE: 0.35, threshold: 3.0, allyAccept: 0.95, city: false, fort: false, boatMin: 1e9, maxPorts: 2, maxForts: 0, maxFactories: 0, maxWarships: 0, smart: false },
];
export const WEAK_BOT_LEVEL = 3;     // Index des Masse-Bot-Profils

// Namen der Nationen (starke Bots). Reihenfolge = Vergabe-Reihenfolge.
// ACHTUNG: server.js hat dieselbe Liste (CommonJS kann das ESM-Modul nicht
// laden) – Änderungen dort mitziehen.
export const NATION_NAMES = [
  '🇩🇪 Deutschland', '🇫🇷 Frankreich', '🇬🇧 England', '🇪🇸 Spanien',
  '🇮🇹 Italien', '🇷🇺 Russland', '🇺🇸 USA', '🇯🇵 Japan',
];

// Gedeckte, aber unterscheidbare Hex-Farbe für die Masse-Bots (der Renderer
// parst Hex). Goldener Winkel verteilt die Farbtöne gleichmäßig; die niedrige
// Sättigung lässt Menschen und Nationen (kräftige Palette) hervorstechen.
function mutedColor(i) {
  const h = (i * 137.508) % 360;
  const s = 0.32, l = 0.5;
  const a = s * Math.min(l, 1 - l);
  const f = n => {
    const k = (n + h / 30) % 12;
    const c = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(255 * c).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

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
    this.warshipSeq = 0;           // laufende ID für Kriegsschiffe (für Befehle)
    this.catapults = [];           // Katapulte (Belagerungs-Einheiten zu Land)
    this.catapultSeq = 0;          // laufende ID für Katapulte (für Befehle)
    this.ruins = [];               // Trümmerfelder zerstörter Festungen ({ cell })
    this.trains = [];              // Züge auf Schienennetzen
    // Schienennetz-Graph, jede Runde neu berechnet (siehe buildRailNetwork):
    // adj = Zelle -> Nachbarknoten, edges = Kantenliste fürs Zeichnen
    this.rails = { adj: new Map(), edges: [] };
    // Einnahmen aus Handel/Zügen in diesem Tick: { p, amount } – nur fürs HUD
    // (Geld-Popups), wird jede Runde geleert und beeinflusst die Simulation nicht.
    this.moneyEvents = [];
    // Ereignisse dieses Ticks fürs HUD (Ereignis-Feed): Eliminierungen ('elim'),
    // neue Angriffe ('atk'), Allianzen ('ally') und Allianzbrüche ('unally').
    // Wie moneyEvents rein informativ und jede Runde geleert.
    this.feedEvents = [];
    this.buildings = [];           // Städte, Festungen, Häfen, Fabriken
    this.buildingAt = new Map();   // Zelle -> Gebäude
    this.alliances = new Set();    // "a:b" (a < b)
    this.allyRequests = new Set(); // "von:zu"
    this.dirty = [];               // in diesem Tick geänderte Zellen (fürs Rendering)

    // Menschen und Nationen bekommen die kräftigen Palettenfarben, Masse-Bots
    // (Profil WEAK_BOT_LEVEL) gedeckte generierte Farben – so bleiben die
    // wichtigen Akteure auf der Karte sofort erkennbar.
    // Spieler können eine Wunschfarbe mitbringen (p.color): sie wird vorab
    // reserviert; bei Duplikaten behält sie der Erste. Die automatische Vergabe
    // überspringt reservierte Palettenfarben – so gibt es nie zwei gleiche.
    const validColor = c => typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c);
    const wish = players.map(p => (validColor(p.color) ? p.color.toLowerCase() : null));
    const used = new Set();
    for (let i = 0; i < wish.length; i++) {
      if (wish[i] && used.has(wish[i])) wish[i] = null;
      else if (wish[i]) used.add(wish[i]);
    }
    let bright = 0, dull = 0;
    const nextBright = () => {
      while (used.has(PLAYER_COLORS[bright % PLAYER_COLORS.length])) bright++;
      return PLAYER_COLORS[bright++ % PLAYER_COLORS.length];
    };
    this.players = players.map((p, i) => {
      const botLevel = Math.max(0, Math.min(WEAK_BOT_LEVEL, (p.level === undefined ? 1 : p.level) | 0));
      const weak = !!p.bot && botLevel === WEAK_BOT_LEVEL;
      return {
        idx: i,
        name: p.name,
        color: wish[i] || (weak ? mutedColor(dull++) : nextBright()),
        isBot: !!p.bot,
        botLevel,
        alive: true,
        troops: START_TROOPS,
        money: START_MONEY,
        territory: 0,
        lastAggressor: -1,   // wer diesen Spieler zuletzt angegriffen hat
        grudgeUntil: 0,      // bis zu welchem Tick der Groll hält (Vergeltung)
        traitorUntil: 0,     // bis zu welchem Tick dieser Spieler als Verräter gilt
        cities: 0,
        forts: 0,
        ports: 0,
        factories: 0,
      };
    });

    this.landCells = [];
    for (let i = 0; i < n; i++) if (this.map.terrain[i] === 1) this.landCells.push(i);

    this.placeInitialSpawns();
  }

  // ---------- Hilfen ----------
  // Die bis zu 4 orthogonalen Nachbarzellen von c in out schreiben (Randzellen
  // haben weniger). Rueckgabe = Anzahl. Wiederverwendetes out-Array spart Speicher.
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

  // Quadrat des Abstands zwischen zwei Zellen (ohne Wurzel = schneller; reicht
  // fuer Radius-Vergleiche, deshalb ueberall die "…2"-Konstanten/-Namen).
  dist2(a, b) {
    const w = this.map.w;
    const dx = (a % w) - (b % w), dy = ((a / w) | 0) - ((b / w) | 0);
    return dx * dx + dy * dy;
  }

  // Allianzen werden als "kleinerIdx:groessererIdx" gespeichert, damit ein Paar
  // immer denselben Schluessel hat, egal in welcher Reihenfolge gefragt wird.
  allianceKey(a, b) { return a < b ? `${a}:${b}` : `${b}:${a}`; }
  isAllied(a, b) { return this.alliances.has(this.allianceKey(a, b)); }
  // Gilt der Spieler gerade als Verräter (hat kürzlich eine Allianz gebrochen)?
  isTraitor(idx) { return this.players[idx].traitorUntil > this.turnNo; }

  // Ist das Gebaeude noch im Aufbau? Frisch gebaute Gebaeude wirken erst nach
  // BUILD_DEPLOY_TICKS (5s). Gebaeude ohne built-Zeitstempel (z.B. direkt in
  // Tests erzeugt) gelten sofort als fertig. Wechselt ein Gebaeude im Aufbau
  // den Besitzer, laeuft die Bauzeit einfach weiter.
  underConstruction(b) {
    return b.built !== undefined && this.turnNo - b.built < BUILD_DEPLOY_TICKS;
  }

  // Truppen-Obergrenze eines Spielers: waechst mit Gebiet und Staedten.
  // Staedte im Aufbau zaehlen noch nicht.
  maxTroopsOf(p) {
    let cities = p.cities;
    for (const b of this.buildings) {
      if (b.kind === 'city' && b.owner === p.idx && this.underConstruction(b)) cities--;
    }
    return p.territory * MAX_PER_TERRITORY + MAX_BASE + cities * CITY_MAX_BONUS;
  }

  // Truppen, die gerade "draussen" kaempfen: Angriffs-Pools und Boots-Besatzungen.
  // Sie zaehlen zur Kapazitaet – wer alles in Angriffe steckt, waechst nicht nach,
  // sondern muss warten, bis der Angriff endet (oder ihn abbrechen: 'retreat').
  committedTroopsOf(pIdx) {
    let sum = 0;
    for (const a of this.attacks) if (a.attacker === pIdx) sum += a.pool;
    for (const b of this.boats) if (b.owner === pIdx) sum += b.troops;
    return sum;
  }

  // Zelle einem neuen Besitzer geben und dabei alle Zaehler mitfuehren:
  // Gebiets-Zaehler beider Spieler, ein evtl. auf der Zelle stehendes Gebaeude
  // (wechselt den Besitzer bzw. verschwindet bei Neutralisierung) und die
  // dirty-Liste fuer den Renderer.
  setOwner(cell, p) {
    const prev = this.owner[cell];
    if (prev === p) return;
    if (prev >= 0) this.players[prev].territory--;
    this.owner[cell] = p;
    if (p >= 0) this.players[p].territory++;
    // Gebäude wechseln mit der Zelle den Besitzer – AUSNAHME Festungen:
    // sie werden bei Eroberung zerstört und hinterlassen eine Ruine.
    const b = this.buildingAt.get(cell);
    if (b) {
      if (b.kind === 'fort') {
        this.destroyFort(b, p);
      } else {
        if (b.owner >= 0) this.players[b.owner][KIND_FIELD[b.kind]]--;
        if (p >= 0) {
          b.owner = p;
          this.players[p][KIND_FIELD[b.kind]]++;
        } else {
          this.buildingAt.delete(cell);
          this.buildings = this.buildings.filter(x => x !== b);
        }
      }
    }
    // Katapulte auf einer feindlich eroberten Zelle werden zerstört
    for (const cp of this.catapults) {
      if (cp.cell === cell && cp.owner !== p && (p < 0 || !this.isAllied(cp.owner, p))) cp.dead = true;
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

  // Alle Zellen eines Spielers wieder neutral machen (z.B. bei erneuter
  // Startpunkt-Wahl in der Spawn-Phase).
  clearPlayerCells(pIdx) {
    const n = this.map.w * this.map.h;
    for (let i = 0; i < n; i++) if (this.owner[i] === pIdx) this.setOwner(i, -1);
  }

  // Jeden Spieler auf ein Start-Feld setzen (kleiner Anfangs-Blob). Es wird
  // versucht, die Startpunkte moeglichst weit auseinander zu legen (fairer Start).
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
      // Nationen starten mit etwas mehr Land, Masse-Bots mit weniger
      const r = !p.isBot ? 3 : p.botLevel === WEAK_BOT_LEVEL ? 2 : 4;
      this.placeBlob(p.idx, best, r);
    }
  }

  // ---------- Intents ----------
  // Eine einzelne Spieler-Eingabe anwenden (it.p = Spieler-Index, it.type = Art).
  // Jeder Fall prueft zuerst Gueltigkeit/Phase und veraendert dann den Zustand.
  // Weil das deterministisch auf allen Clients laeuft, bleiben alle synchron.
  applyIntent(it) {
    const p = this.players[it.p];
    if (!p || !p.alive) return;
    switch (it.type) {
      // Startpunkt in der Spawn-Phase setzen (altes Startgebiet wird geraeumt)
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
        // ratio = Anteil der eigenen Truppen, die in den Angriff gehen
        const ratio = Math.max(0.01, Math.min(1, it.ratio || 0.3));
        const troops = Math.floor(p.troops * ratio);
        if (troops < 1) return;
        p.troops -= troops;
        // Laeuft schon ein Angriff auf dieses Ziel? Dann nur Nachschub geben.
        const existing = this.attacks.find(a => a.attacker === p.idx && a.target === target);
        if (existing) {
          existing.pool += troops; // Nachschub für die laufende Front
        } else {
          this.attacks.push({ attacker: p.idx, target, pool: troops, frontier: new Set(), cd: 1, stall: 0 });
          // Neuer Angriff auf einen Spieler -> Meldung im Ereignis-Feed
          if (target >= 0) this.feedEvents.push({ t: 'atk', p: target, by: p.idx });
        }
        break;
      }
      // Laufenden Angriff abbrechen: die restlichen Truppen kehren sofort zurueck
      case 'retreat': {
        if (this.phase !== 'play') return;
        const target = it.target | 0;
        for (const a of this.attacks) {
          if (a.attacker === p.idx && a.target === target && a.pool > 0) {
            p.troops += a.pool;
            a.pool = 0;
          }
        }
        break;
      }
      // Transportboot zu einer (fremden/neutralen) Kuestenzelle schicken
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
        // Landebesitzer ermitteln (kann durch Pfadfindung vom angeklickten Ziel
        // abweichen) und melden, falls ein Spieler bedroht wird – der Client
        // spielt dafuer einen Warnton ab (siehe showFeedEvents in main.js).
        const landingOwner = this.owner[res.landing];
        if (landingOwner >= 0 && landingOwner !== p.idx) {
          this.feedEvents.push({ t: 'boat', p: landingOwner, by: p.idx });
        }
        break;
      }
      // Gebaeude auf eigenem Gebiet errichten (Geld wird abgezogen)
      case 'build': {
        if (this.phase !== 'play') return;
        const kind = BUILD_COSTS[it.kind] ? it.kind : 'city';
        const c = this.resolveBuildCell(p.idx, it.cell | 0, kind);
        if (this.canBuildAt(p.idx, c, kind) !== null) return;
        p.money -= this.buildCostOf(p.idx, kind);
        // built = Bauzeitpunkt: das Gebäude ist erst nach BUILD_DEPLOY_TICKS
        // wirksam (siehe underConstruction). Preiszähler zählen sofort.
        // Festungen bekommen Trefferpunkte (Katapulte schießen sie ab).
        const b = { owner: p.idx, kind, cell: c, built: this.turnNo };
        if (kind === 'fort') b.hp = FORT_HP;
        this.buildings.push(b);
        this.buildingAt.set(c, b);
        p[KIND_FIELD[kind]]++;
        // Neubau räumt ein evtl. vorhandenes Trümmerfeld auf dieser Zelle ab
        this.ruins = this.ruins.filter(r => r.cell !== c);
        break;
      }
      // Kriegsschiff an einem eigenen Hafen bauen (max. 2 je Hafen)
      case 'warship': {
        if (this.phase !== 'play') return;
        const c = it.cell | 0;
        const b = this.buildingAt.get(c);
        if (!b || b.kind !== 'port' || b.owner !== p.idx) return;
        if (this.underConstruction(b)) return; // Hafen erst nach der Aufbauzeit nutzbar
        if (p.money < WARSHIP_COST) return;
        if (this.warships.filter(w => w.owner === p.idx).length >= p.ports * 2) return;
        // Startzelle: Wasser neben dem Hafen
        const nb = new Int32Array(4);
        const k = this.neighbors4(c, nb);
        let spawn = -1;
        for (let i = 0; i < k; i++) if (this.map.terrain[nb[i]] === 0) { spawn = nb[i]; break; }
        if (spawn < 0) return;
        p.money -= WARSHIP_COST;
        this.warships.push({ id: this.warshipSeq++, owner: p.idx, home: c, cell: spawn, path: [], pi: 0, dmg: 0, born: this.turnNo, cd: WARSHIP_SHOT_CD, order: -1 });
        break;
      }
      // Einem eigenen Kriegsschiff einen Wegpunkt (Wasserzelle) zuweisen.
      // Der Wegpunkt hat Vorrang vor Jagd/Patrouille (nicht vor Notreparatur)
      // und gilt, bis das Schiff ihn erreicht hat. Das Feld heißt bewusst
      // "ship" (nicht "id"), damit es nicht mit anderen id-Feldern kollidiert –
      // server.js muss es beim Weiterleiten explizit durchreichen!
      case 'warship_move': {
        if (this.phase !== 'play') return;
        const w = this.warships.find(x => x.id === (it.ship | 0));
        if (!w || w.owner !== p.idx) return;
        const c = it.cell | 0;
        if (c < 0 || c >= this.map.terrain.length || this.map.terrain[c] !== 0) return;
        // Nur annehmen, wenn das Ziel überhaupt erreichbar ist (Terrain ist
        // statisch, die Prüfung bleibt also dauerhaft gültig)
        const path = this.bfsWater([w.cell], q => q === c);
        if (!path) return;
        w.order = c;
        w.home = c; // neues Patrouillenzentrum: nach Ankunft bleibt das Schiff dort
        w.path = path; w.pi = 0;
        break;
      }
      // Katapult an einer eigenen Fabrik bauen (max. 2 je Fabrik)
      case 'catapult': {
        if (this.phase !== 'play') return;
        const c = it.cell | 0;
        const b = this.buildingAt.get(c);
        if (!b || b.kind !== 'factory' || b.owner !== p.idx) return;
        if (this.underConstruction(b)) return; // Fabrik erst nach der Aufbauzeit nutzbar
        if (p.money < CATAPULT_COST) return;
        if (this.catapults.filter(x => x.owner === p.idx).length >= p.factories * CATAPULT_CAP_PER_FACTORY) return;
        p.money -= CATAPULT_COST;
        this.catapults.push({ id: this.catapultSeq++, owner: p.idx, home: c, cell: c, path: [], pi: 0, cd: CATAPULT_SHOT_CD, born: this.turnNo, order: -1 });
        break;
      }
      // Einem eigenen Katapult ein Ziel (Landzelle) zuweisen – analog
      // 'warship_move'. Der Wegpunkt hat Vorrang vor der automatischen
      // Festungssuche und gilt, bis das Katapult ihn erreicht hat.
      // Auch hier heißt das ID-Feld bewusst "ship" (siehe warship_move und
      // den Hinweis in server.js).
      case 'catapult_move': {
        if (this.phase !== 'play') return;
        const cp = this.catapults.find(x => x.id === (it.ship | 0));
        if (!cp || cp.owner !== p.idx) return;
        const c = it.cell | 0;
        if (c < 0 || c >= this.map.terrain.length || this.map.terrain[c] !== 1) return;
        const path = this.bfsLand([cp.cell], q => q === c);
        if (!path) return;
        cp.order = c;
        cp.path = path; cp.pi = 0;
        break;
      }
      // Allianz anfragen bzw. eine offene Gegenanfrage annehmen
      case 'ally': {
        const t = it.target | 0;
        if (t === p.idx || !this.players[t] || !this.players[t].alive) return;
        if (this.isAllied(p.idx, t)) return;
        if (this.allyRequests.has(`${t}:${p.idx}`)) {
          // Gegenseitige Anfrage -> Allianz kommt zustande
          this.allyRequests.delete(`${t}:${p.idx}`);
          this.allyRequests.delete(`${p.idx}:${t}`);
          this.alliances.add(this.allianceKey(p.idx, t));
          this.feedEvents.push({ t: 'ally', a: p.idx, b: t });
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
      // Allianz aufkuendigen (und offene Anfragen in beide Richtungen loeschen).
      // Wer eine BESTEHENDE Allianz bricht, gilt eine Weile als Verräter:
      // Bots verweigern ihm Allianzen (siehe botAct) und er wird im HUD markiert.
      case 'unally': {
        const t = it.target | 0;
        if (!this.players[t]) return;
        if (this.isAllied(p.idx, t)) {
          p.traitorUntil = this.turnNo + TRAITOR_TICKS;
          this.feedEvents.push({ t: 'unally', a: p.idx, b: t });
        }
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

  // Aktueller Preis: verdoppelt sich je gebautem Gebäude des Typs, gedeckelt bei
  // COST_DOUBLINGS_CAP (Städte 16x, sonst 8x). Festungen haben keinen Zähler und
  // bleiben immer gleich teuer. Häfen und Fabriken teilen sich einen Zähler.
  buildCostOf(pIdx, kind) {
    const p = this.players[pIdx];
    let count = 0;
    if (kind === 'city') count = p.cities;
    else if (kind === 'port' || kind === 'factory') count = p.ports + p.factories;
    return BUILD_COSTS[kind] * Math.pow(2, Math.min(COST_DOUBLINGS_CAP[kind], count));
  }

  // null = Bauen erlaubt, sonst Fehlermeldung
  canBuildAt(pIdx, cell, kind) {
    const p = this.players[pIdx];
    if (cell < 0 || cell >= this.owner.length || this.owner[cell] !== pIdx) return 'Nur auf eigenem Gebiet baubar.';
    const cost = this.buildCostOf(pIdx, kind);
    if (p.money < cost) return `Nicht genug Geld (${cost} € nötig).`;
    if (kind === 'port' && !this.isCoastal(cell)) {
      return 'Ein Hafen braucht Küste (Zelle am Wasser).';
    }
    for (const b of this.buildings) {
      if (b.owner === pIdx && this.dist2(b.cell, cell) < MIN_BUILD_DIST2) return 'Zu nah an einem eigenen Gebäude.';
    }
    return null;
  }

  // Grenzt die Zelle direkt an Wasser?
  isCoastal(cell) {
    const nb = new Int32Array(4);
    const k = this.neighbors4(cell, nb);
    for (let i = 0; i < k; i++) if (this.map.terrain[nb[i]] === 0) return true;
    return false;
  }

  // Klick-Zelle für den Bau auflösen. Häfen werden großzügig behandelt: liegt
  // die Zelle nicht direkt an der Küste, wird im Umkreis (PORT_SNAP_RADIUS) die
  // nächste eigene, bebaubare Küstenzelle gewählt – man muss also nur in die
  // Nähe des Wassers klicken. Andere Gebäude bauen exakt auf der Klick-Zelle.
  resolveBuildCell(pIdx, cell, kind) {
    if (kind !== 'port' || cell < 0 || cell >= this.owner.length) return cell;
    if (this.isCoastal(cell)) return cell;
    const w = this.map.w, h = this.map.h;
    const cx = cell % w, cy = (cell / w) | 0;
    const R = PORT_SNAP_RADIUS;
    let best = cell, bestD = Infinity;
    for (let y = Math.max(0, cy - R); y <= Math.min(h - 1, cy + R); y++) {
      for (let x = Math.max(0, cx - R); x <= Math.min(w - 1, cx + R); x++) {
        const c = y * w + x;
        if (this.owner[c] !== pIdx || !this.isCoastal(c)) continue;
        const d = (x - cx) * (x - cx) + (y - cy) * (y - cy);
        if (d >= bestD || d > R * R) continue;
        if (this.canBuildAt(pIdx, c, 'port') !== null) continue;
        bestD = d; best = c;
      }
    }
    return best;
  }

  // Die Grenzzellen eines Angriffs bestimmen: alle Zellen des Ziels, die direkt
  // an Land des Angreifers grenzen. Diese "Front" faellt beim naechsten Vorstoss.
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
      if (b.kind === 'fort' && b.owner === defIdx && !this.underConstruction(b) &&
          this.dist2(b.cell, cell) <= FORT_RADIUS2) return FORT_DEFENSE;
    }
    return 1;
  }

  // Eine Festung zerstören: Gebäude weg, Zähler runter, Ruine auf der Zelle,
  // Meldung im Ereignis-Feed. byIdx = wer sie zerstört hat (-1 = niemand).
  destroyFort(b, byIdx = -1) {
    if (b.owner >= 0) this.players[b.owner].forts--;
    this.feedEvents.push({ t: 'fort', p: b.owner, by: byIdx });
    this.buildingAt.delete(b.cell);
    this.buildings = this.buildings.filter(x => x !== b);
    this.ruins.push({ cell: b.cell });
  }

  // Trümmer-Malus für eine Zelle: liegt sie im Radius einer Ruine, kostet
  // ihre Eroberung RUIN_COST-mal so viele Truppen.
  ruinMult(cell) {
    for (const r of this.ruins) {
      if (this.dist2(r.cell, cell) <= RUIN_RADIUS2) return RUIN_COST;
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

  // Boote pro Tick vorwaerts bewegen; am Ziel wird die Landung abgerechnet:
  // gegen Kosten (Verteidiger-Dichte + Festung) erobert die Landung die Zelle,
  // ueberschuessige Truppen kaempfen als normaler Angriff weiter (Brueckenkopf).
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
      const cost = (defender ? ENEMY_COST_BASE + density * ENEMY_COST_DENSITY : NEUTRAL_COST) * this.fortBonus(cell, o) * this.ruinMult(cell);
      if (boat.troops <= cost) continue; // Landung abgewehrt
      let pool = boat.troops - cost;
      if (defender) {
        defender.troops = Math.max(0, defender.troops - density * 0.9);
        // Auch Invasionen bleiben nicht ungestraft (siehe Vergeltung in botAct)
        defender.lastAggressor = boat.owner;
        defender.grudgeUntil = this.turnNo + GRUDGE_TICKS;
      }
      this.setOwner(cell, boat.owner);
      if (defender && defender.territory === 0) this.eliminate(defender, boat.owner);
      if (pool >= 1) {
        // Brückenkopf: Rest kämpft als normaler Angriff weiter
        const existing = this.attacks.find(a => a.attacker === boat.owner && a.target === o);
        if (existing) existing.pool += pool;
        else {
          this.attacks.push({ attacker: boat.owner, target: o, pool, frontier: new Set(), cd: 1, stall: 0 });
          if (o >= 0) this.feedEvents.push({ t: 'atk', p: o, by: boat.owner });
        }
      }
    }
    this.boats = this.boats.filter(b => !b.done);
  }

  // ---------- Wasser-Wegsuche (generisch) ----------
  // Kuerzesten Weg ueber Wasser von einer der Startzellen (sources) zur ersten
  // Zelle finden, die goalFn erfuellt. Rueckgabe = Zellenpfad oder null.
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

  // Dasselbe zu Land: kuerzesten Weg ueber Landzellen finden (fuer Katapulte).
  bfsLand(sources, goalFn) {
    const { terrain } = this.map;
    const n = this.owner.length;
    const prev = new Int32Array(n).fill(-2);
    const queue = new Int32Array(n);
    let head = 0, tail = 0;
    for (const s of sources) {
      if (terrain[s] === 1 && prev[s] === -2) { prev[s] = -1; queue[tail++] = s; }
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
        if (terrain[m] === 1 && prev[m] === -2) { prev[m] = c; queue[tail++] = m; }
      }
    }
    return null;
  }

  // Alle direkt angrenzenden Wasserzellen einer Zelle (z.B. Wasser neben Hafen).
  waterAdjacent(cell) {
    const nb = new Int32Array(4);
    const k = this.neighbors4(cell, nb);
    const out = [];
    for (let i = 0; i < k; i++) if (this.map.terrain[nb[i]] === 0) out.push(nb[i]);
    return out;
  }

  // Wasserweg zwischen zwei Haefen: von Wasser neben dem einen zum Wasser neben
  // dem anderen Hafen (fuer Handelsschiffe).
  portWaterPath(fromCell, toCell) {
    const sources = this.waterAdjacent(fromCell);
    if (!sources.length) return null;
    const targets = new Set(this.waterAdjacent(toCell));
    if (!targets.size) return null;
    return this.bfsWater(sources, c => targets.has(c));
  }

  // ---------- Handel (Häfen & Handelsschiffe) ----------
  // Aktuelle Zelle eines Schiffs auf seinem Pfad (pos ist eine Fliesskommazahl).
  tradeShipCell(s) {
    return s.path[Math.min(s.path.length - 1, s.pos | 0)];
  }

  // Handel pro Tick: Haefen entsenden Handelsschiffe zu fremden Haefen; bei
  // Ankunft verdienen beide Seiten Geld (Wert steigt mit der Weglaenge).
  processTrade() {
    // Häfen schicken Handelsschiffe zu fremden Häfen
    for (const b of this.buildings) {
      if (b.kind !== 'port' || !this.players[b.owner].alive || this.underConstruction(b)) continue;
      if ((this.turnNo + b.cell) % TRADE_INTERVAL !== 0) continue;
      const own = this.tradeShips.filter(s => s.owner === b.owner).length;
      if (own >= this.players[b.owner].ports * TRADE_CAP_PER_PORT) continue;
      const targets = this.buildings.filter(x => x.kind === 'port' && x.owner !== b.owner &&
        this.players[x.owner].alive && !this.underConstruction(x));
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
          const value = TRADE_VALUE_BASE + TRADE_VALUE_COEF * Math.pow(s.path.length, TRADE_VALUE_EXP);
          this.players[s.owner].money += value;
          this.moneyEvents.push({ p: s.owner, amount: value });
          if (this.players[port.owner].alive) {
            this.players[port.owner].money += value;
            this.moneyEvents.push({ p: port.owner, amount: value });
          }
        }
      }
    }
    this.tradeShips = this.tradeShips.filter(s => !s.done);
  }

  // ---------- Kriegsschiffe ----------
  // Maximale Lebenspunkte eines Kriegsschiffs: Basis + Bonus, der mit dem Alter
  // (Ticks seit born) bis zu einem Maximum ansteigt.
  warshipMaxHp(w) {
    return WARSHIP_BASE_HP + Math.min(WARSHIP_BONUS_HP, ((this.turnNo - w.born) / WARSHIP_HP_GROW) | 0);
  }

  // Neues Ziel/Route fuer ein Kriegsschiff festlegen. Prioritaet: schwer
  // beschaedigt -> Reparaturhafen; sonst Spieler-Wegpunkt (order); sonst nahes
  // feindliches Handelsschiff jagen; sonst um den Heimathafen patrouillieren.
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
    if (!goal && w.order >= 0) {
      // Spieler-Wegpunkt: dorthin fahren; angekommen -> Befehl erledigt
      if (this.dist2(w.cell, w.order) <= 2) {
        w.order = -1;
      } else {
        const target = w.order;
        goal = c => c === target;
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

  // Kriegsschiffe pro Tick: ggf. reparieren, Kurs setzen, bewegen, feindliche
  // Handelsschiffe kapern und in Reichweite auf Boote/Kriegsschiffe schiessen.
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
            if (target.dmg >= this.warshipMaxHp(target)) {
              target.dead = true;
              // Melden, wem das Kriegsschiff gehoerte – der Client spielt
              // dafuer einen Ton ab (siehe showFeedEvents in main.js).
              this.feedEvents.push({ t: 'warshipLost', p: target.owner, by: w.owner });
            }
          }
        }
      }
    }
    this.warships = this.warships.filter(w => !w.dead);
  }

  // ---------- Katapulte ----------
  // Neues Ziel/Route fuer ein Katapult festlegen. Prioritaet: Spieler-
  // Wegpunkt (order); sonst die naechste feindliche Festung im Suchradius
  // ansteuern (bis auf Schussweite heran). Kein Ziel -> stehen bleiben.
  retargetCatapult(cp) {
    let goal = null;
    if (cp.order >= 0) {
      // Spieler-Wegpunkt: dorthin fahren; angekommen -> Befehl erledigt
      if (this.dist2(cp.cell, cp.order) <= 2) {
        cp.order = -1;
      } else {
        const target = cp.order;
        goal = c => c === target;
      }
    }
    if (!goal) {
      // Naechste feindliche (nicht verbuendete) Festung im Suchradius
      let fort = null, fortD = Infinity;
      for (const b of this.buildings) {
        if (b.kind !== 'fort' || b.owner === cp.owner || this.isAllied(b.owner, cp.owner)) continue;
        if (!this.players[b.owner].alive) continue;
        const d = this.dist2(b.cell, cp.cell);
        if (d < fortD && d <= CATAPULT_SEEK_R2) { fortD = d; fort = b; }
      }
      if (fort) {
        const fc = fort.cell;
        goal = c => this.dist2(c, fc) <= CATAPULT_RANGE2;
      }
    }
    if (goal) {
      const path = this.bfsLand([cp.cell], goal);
      if (path) { cp.path = path; cp.pi = 0; }
    }
  }

  // Katapulte pro Tick: Kurs setzen, bewegen (1 Zelle/Tick) und in Reichweite
  // auf feindliche Festungen schiessen (FORT_HP Treffer -> Ruine).
  processCatapults() {
    for (const cp of this.catapults) {
      if (!this.players[cp.owner].alive) { cp.dead = true; continue; }
      // Kurs setzen / erneuern
      if (cp.pi >= cp.path.length || this.turnNo % 25 === cp.born % 25) {
        this.retargetCatapult(cp);
      }
      if (cp.pi < cp.path.length) cp.cell = cp.path[cp.pi++];
      // Schießen: naechste feindliche Festung in Reichweite
      if (--cp.cd <= 0) {
        let target = null, targetD = Infinity;
        for (const b of this.buildings) {
          if (b.kind !== 'fort' || b.owner === cp.owner || this.isAllied(b.owner, cp.owner)) continue;
          if (!this.players[b.owner].alive) continue;
          const d = this.dist2(b.cell, cp.cell);
          if (d <= CATAPULT_RANGE2 && d < targetD) { targetD = d; target = b; }
        }
        if (target) {
          cp.cd = CATAPULT_SHOT_CD;
          target.hp = (target.hp === undefined ? FORT_HP : target.hp) - 1;
          if (target.hp <= 0) this.destroyFort(target, cp.owner);
        }
      }
    }
    this.catapults = this.catapults.filter(x => !x.dead);
  }

  // ---------- Fabriken & Züge ----------
  // Alle Stationen (Staedte/Haefen) im Schienen-Radius einer Fabrik – die Ziele,
  // die ihre Zuege anfahren koennen.
  factoryStations(factory) {
    return this.buildings.filter(b =>
      (b.kind === 'city' || b.kind === 'port') && !this.underConstruction(b) &&
      this.dist2(b.cell, factory.cell) <= FACTORY_RADIUS2);
  }

  // Schienennetz-Graph neu aufbauen (einmal pro Runde, siehe turn()).
  // Knoten sind Fabriken und Stationen (Städte/Häfen). Je Fabrik entsteht ein
  // minimaler Spannbaum ueber die Fabrik und alle Stationen in ihrem Radius:
  // jedes Gebaeude wird an das naechstgelegene schon angebundene Gebaeude
  // gehaengt. Es gibt also genau einen Weg zwischen zwei Stationen und keine
  // ueberfluessige Direktschiene zurueck zur Fabrik.
  // Zwei Fabrik-Netze verschmelzen automatisch, sobald eine Station in den
  // Radius beider Fabriken faellt: sie ist dann Knoten in beiden Spannbaeumen
  // und haengt die Komponenten zusammen.
  buildRailNetwork() {
    const adj = new Map();
    const edges = [];
    // Ungerichtete Kante eintragen (Doppelte werden uebersprungen)
    const link = (a, b) => {
      if (a === b) return;
      let na = adj.get(a);
      if (!na) { na = []; adj.set(a, na); }
      if (na.includes(b)) return;
      na.push(b);
      let nb = adj.get(b);
      if (!nb) { nb = []; adj.set(b, nb); }
      nb.push(a);
      edges.push([a, b]);
    };
    for (const f of this.buildings) {
      if (f.kind !== 'factory' || this.underConstruction(f)) continue;
      // Knoten dieses Netzes: die Fabrik selbst, jede Station in ihrem Radius
      // und andere Fabriken in Reichweite. Fabriken zahlen nichts, wenn ein Zug
      // durchfaehrt (payTrain gilt nur fuer Staedte/Haefen) – sie verbinden nur.
      const nodes = [f.cell, ...this.factoryStations(f).map(s => s.cell)];
      for (const o of this.buildings) {
        if (o.kind === 'factory' && o !== f && !this.underConstruction(o) &&
            this.dist2(o.cell, f.cell) <= FACTORY_RADIUS2) {
          nodes.push(o.cell);
        }
      }
      // Minimaler Spannbaum (Prim, ausgehend von der Fabrik): jede Station haengt
      // sich an den naechstgelegenen bereits verbundenen Knoten. Dadurch entsteht
      // eine Kette entlang der Gebaeude statt eines Sterns zur Fabrik -- eine
      // Stadt hinter einer anderen wird ueber diese angebunden, nicht direkt.
      const tree = [nodes[0]];
      const rest = nodes.slice(1);
      while (rest.length) {
        let bestR = 0, bestT = 0, bestD = Infinity;
        for (let i = 0; i < rest.length; i++) {
          for (let j = 0; j < tree.length; j++) {
            const d = this.dist2(rest[i], tree[j]);
            if (d < bestD) { bestD = d; bestR = i; bestT = j; }
          }
        }
        link(tree[bestT], rest[bestR]);
        tree.push(rest[bestR]);
        rest.splice(bestR, 1);
      }
    }
    this.rails = { adj, edges };
  }

  // Interpolierte Zugposition zwischen zwei Netzknoten (fuer den Renderer).
  trainPos(tr) {
    const w = this.map.w;
    const fx = tr.from % w, fy = (tr.from / w) | 0;
    const tx = tr.to % w, ty = (tr.to / w) | 0;
    return [fx + (tx - fx) * tr.t, fy + (ty - fy) * tr.t];
  }

  // Naechsten Knoten fuer einen Zug waehlen: moeglichst nicht dorthin zurueck,
  // woher er gerade kam (prev). Nur in einer Sackgasse bleibt der Rueckweg.
  nextRailNode(node, prev) {
    const nb = this.rails.adj.get(node);
    if (!nb || !nb.length) return -1;
    const fwd = nb.filter(c => c !== prev);
    const pool = fwd.length ? fwd : nb;
    return pool[(this.rng() * pool.length) | 0];
  }

  // Geld fuer eine durchfahrene Station. Eigene Station: nur der Zug-Besitzer.
  // Fremde Station: BEIDE Seiten verdienen (verbuendet bringt am meisten).
  payTrain(tr, st) {
    const me = this.players[tr.owner];
    if (st.owner === tr.owner) {
      me.money += TRAIN_PAY.own;
      this.moneyEvents.push({ p: tr.owner, amount: TRAIN_PAY.own });
      return;
    }
    const pay = this.isAllied(st.owner, tr.owner) ? TRAIN_PAY.ally : TRAIN_PAY.foreign;
    me.money += pay;
    this.moneyEvents.push({ p: tr.owner, amount: pay });
    const other = this.players[st.owner];
    if (other && other.alive) {
      other.money += pay;
      this.moneyEvents.push({ p: st.owner, amount: pay });
    }
  }

  // Zuege pro Tick: Fabriken erzeugen mit Wahrscheinlichkeit neue Zuege, die das
  // Schienennetz abfahren. Bei jeder erreichten Station gibt es Geld (payTrain).
  // Nach TRAIN_VISITS besuchten Stationen endet der Zug.
  processTrains() {
    // Chance auf neue Züge je Fabrik (nur wenn die Fabrik Anschluss ans Netz hat)
    for (const b of this.buildings) {
      if (b.kind !== 'factory' || !this.players[b.owner].alive) continue;
      if ((this.turnNo + b.cell) % TRAIN_INTERVAL !== 0) continue;
      if (this.trains.filter(t => t.factory === b.cell).length >= TRAIN_CAP) continue;
      const nb = this.rails.adj.get(b.cell);
      if (!nb || !nb.length) continue;
      if (this.rng() < TRAIN_CHANCE) {
        this.trains.push({
          owner: b.owner,
          factory: b.cell,
          from: b.cell,
          to: nb[(this.rng() * nb.length) | 0],
          t: 0,
          visits: 0,
        });
      }
    }
    // Fahren, Stationen erreichen, Geld einsammeln, weiterfahren
    for (const tr of this.trains) {
      if (!this.players[tr.owner].alive) { tr.dead = true; continue; }
      const fac = this.buildingAt.get(tr.factory);
      if (!fac || fac.kind !== 'factory') { tr.dead = true; continue; }
      const len = Math.max(1, Math.sqrt(this.dist2(tr.from, tr.to)));
      tr.t += TRAIN_SPEED / len;
      if (tr.t < 1) continue;

      // Knoten erreicht
      const prev = tr.from;
      const arrived = tr.to;
      tr.t = 0;
      tr.from = arrived;
      const st = this.buildingAt.get(arrived);
      if (st && (st.kind === 'city' || st.kind === 'port')) {
        this.payTrain(tr, st);
        tr.visits++;
        if (tr.visits >= TRAIN_VISITS) { tr.dead = true; continue; }
      }
      // Weiter ins Netz; kein Anschluss mehr (Gebäude zerstört) -> Zug endet
      const next = this.nextRailNode(arrived, prev);
      if (next < 0) { tr.dead = true; continue; }
      tr.to = next;
    }
    this.trains = this.trains.filter(t => !t.dead);
  }

  // ---------- Tick ----------
  // Ein kompletter Spielschritt: erst alle Eingaben anwenden, dann – in der
  // Spielphase – Bots, Wirtschaft und alle Einheiten verarbeiten und regelmaessig
  // die Siegbedingung pruefen. In der Spawn-Phase wird nur hochgezaehlt.
  turn(intents) {
    if (this.phase === 'ended') return;
    // HUD-Event-Puffer VOR den Intents leeren – Angriffs-/Allianz-Events
    // entstehen schon beim Anwenden der Intents (applyIntent).
    this.moneyEvents.length = 0;
    this.feedEvents.length = 0;
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
    this.processCatapults();
    this.buildRailNetwork();   // Netz zuerst, damit Züge das aktuelle Netz nutzen
    this.processTrains();
    this.processAttacks();
    if (this.turnNo % 10 === 0) this.checkWin();
    this.turnNo++;
  }

  // Truppenwachstum pro Tick: Kurve mit Maximum bei 40% des Limits.
  // Kaempfende Truppen (Angriffe/Boote) zaehlen zum Fuellstand dazu.
  troopGrowthOf(p) {
    const max = this.maxTroopsOf(p);
    const f = (p.troops + this.committedTroopsOf(p.idx)) / max;
    const curve = f < GROWTH_PEAK
      ? 0.3 + 0.7 * (f / GROWTH_PEAK)
      : Math.max(0, (1 - f) / (1 - GROWTH_PEAK));
    // Das Wachstum haengt direkt an der Kapazitaet: bei vollem Tempo waere das
    // Limit nach REFILL_TICKS erreicht. Dadurch bleibt der Fuellstand (und damit
    // die Kurve oben) unabhaengig von der Reichsgroesse aussagekraeftig -- eine
    // Stadt beschleunigt das Wachstum genau so stark, wie sie das Limit hebt.
    return (max / REFILL_TICKS) * curve;
  }

  // Wirtschaft pro Tick: jeder lebende Spieler bekommt Truppennachwuchs (bis zum
  // Limit) und Geld (Basis + Betrag pro Gebietszelle).
  economy() {
    for (const p of this.players) {
      if (!p.alive || p.territory === 0) continue;
      const max = this.maxTroopsOf(p);
      // Kaempfende Truppen belegen Kapazitaet: nachwachsen kann nur, was
      // inklusive der Truppen "draussen" unter das Limit passt.
      const cap = Math.max(0, max - this.committedTroopsOf(p.idx));
      if (p.troops < cap) p.troops = Math.min(cap, p.troops + this.troopGrowthOf(p));
      else p.troops = Math.min(p.troops, max);
      p.money += MONEY_BASE + p.territory * MONEY_PER_TERRITORY;
    }
  }

  // Angriffe pro Tick abarbeiten. Jeder Angriff hat einen Truppen-"Pool", der die
  // Front (scanFrontier) im festen Takt vorruecken laesst; jede eroberte Zelle
  // kostet – Verteidiger-Dichte und Festungen machen es teurer. Faellt das
  // letzte Gebiet des Verteidigers, wird er eliminiert. Reste kehren zurueck.
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
      let interval = defender ? ENEMY_INTERVAL : NEUTRAL_INTERVAL;
      // Übermacht beschleunigt: je größer der Angriffs-Pool im Verhältnis zu den
      // haltenden Truppen des Verteidigers, desto kürzer der Takt (bis
      // ATTACK_SPEED_CAP). Da die Front weiter nur an der Grenze und pro Vorstoß
      // als geschlossene Linie vorrückt, bilden sich trotzdem Angriffslinien –
      // ein starker Angriff frisst sie nur schneller ab.
      if (defender) {
        let speed = Math.min(ATTACK_SPEED_CAP, Math.max(1, atk.pool / Math.max(1, defender.troops)));
        // Treffen zwei Angriffe frontal aufeinander (beide greifen sich gegen-
        // seitig an), beschleunigt zusätzlich das Pool-Verhältnis der stärkeren
        // Front (bis CLASH_SPEED_CAP), damit sich ein Schlagabtausch zügig löst.
        const opp = this.attacks.find(a => a.attacker === atk.target && a.target === atk.attacker && a.pool > 0);
        if (opp && atk.pool > opp.pool) {
          speed = Math.max(speed, Math.min(CLASH_SPEED_CAP, atk.pool / Math.max(1, opp.pool)));
        }
        interval = Math.max(1, Math.round(interval / speed));
      }
      atk.cd = interval;

      // Die Front wird vor jedem Vorstoß frisch von der aktuellen Grenze
      // berechnet – so bleibt sie auch bei Gegenangriffen korrekt und
      // rückt als geschlossene Linie vor statt in Flecken.
      atk.frontier = this.scanFrontier(atk.attacker, atk.target);
      if (atk.frontier.size === 0) {
        attacker.troops += atk.pool; // keine gemeinsame Grenze – Truppen zurück
        atk.pool = 0;
        continue;
      }

      // Der Verteidiger merkt sich den Angreifer – Bots schlagen zurück (botAct)
      if (defender) {
        defender.lastAggressor = atk.attacker;
        defender.grudgeUntil = this.turnNo + GRUDGE_TICKS;
      }

      const density = defender ? defender.troops / Math.max(1, defender.territory) : 0;
      const baseCost = defender ? ENEMY_COST_BASE + density * ENEMY_COST_DENSITY : NEUTRAL_COST;
      let captured = 0;
      for (const cell of atk.frontier) {
        const cellCost = baseCost * this.fortBonus(cell, atk.target) * this.ruinMult(cell);
        if (atk.pool < cellCost) continue; // z.B. Festungszelle zu teuer
        atk.pool -= cellCost;
        if (defender) {
          defender.troops = Math.max(0, defender.troops - density * DEFENDER_LOSS_PER_CELL);
        }
        this.setOwner(cell, atk.attacker);
        captured++;
        if (defender && defender.territory === 0) {
          this.eliminate(defender, atk.attacker);
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

  // Einen Spieler ausscheiden lassen: als tot markieren und seine laufenden
  // Angriffe, Boote und offenen Allianz-Anfragen aufraeumen.
  // byIdx = wer den letzten Schlag gefuehrt hat (fuer den Ereignis-Feed).
  eliminate(p, byIdx = -1) {
    this.feedEvents.push({ t: 'elim', p: p.idx, by: byIdx });
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

  // Siegbedingung pruefen: Sieg, wenn nur noch ein Spieler/Buendnis lebt ODER
  // ein Buendnis gemeinsam >= WIN_FRACTION (70%) des Landes kontrolliert. Setzt
  // dann winners (Team-Sieg moeglich) und beendet das Spiel (phase = 'ended').
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
  // Jeden Bot in seinem eigenen Takt (L.interval) handeln lassen. Der Versatz
  // (p.idx * 5) verteilt die Bots ueber die Ticks, damit nicht alle gleichzeitig
  // rechnen (spart Rechenzeit und wirkt natuerlicher).
  botThink() {
    for (const p of this.players) {
      if (!p.isBot || !p.alive) continue;
      const L = BOT_LEVELS[p.botLevel];
      if (this.turnNo % L.interval !== (p.idx * 5) % L.interval) continue;
      this.botAct(p, L);
    }
  }

  // Eine zufaellige eigene Zelle finden (bis zu 'tries' Versuche), z.B. als
  // Bauplatz. -1, wenn in den Versuchen keine getroffen wurde.
  randomOwnCell(pIdx, tries) {
    for (let t = 0; t < tries; t++) {
      const c = this.landCells[(this.rng() * this.landCells.length) | 0];
      if (this.owner[c] === pIdx) return c;
    }
    return -1;
  }

  // Wie randomOwnCell, bevorzugt aber Grenzzellen (mindestens ein Nachbarfeld
  // gehoert nicht dem Spieler) – wichtig fuer Festungen, die nur an der Front
  // etwas bringen. Faellt auf eine normale eigene Zelle zurueck, falls in den
  // Versuchen keine Grenze gefunden wird (z.B. Insel komplett im Landesinneren
  // schon von Festungen belegt).
  borderOwnCell(pIdx, tries) {
    const nb = new Int32Array(4);
    let fallback = -1;
    for (let t = 0; t < tries; t++) {
      const c = this.landCells[(this.rng() * this.landCells.length) | 0];
      if (this.owner[c] !== pIdx) continue;
      if (fallback < 0) fallback = c;
      const k = this.neighbors4(c, nb);
      for (let i = 0; i < k; i++) {
        const m = nb[i];
        if (this.map.terrain[m] === 1 && this.owner[m] !== pIdx) return c;
      }
    }
    return fallback;
  }

  // Bots geben ihr Geld für Gebäude und Schiffe aus
  botBuild(p, L) {
    if (!L.city || p.territory < 150) return;
    // 1. Hafen an der Küste (Handel = Haupteinnahmequelle) – Obergrenze je
    //    nach Schwierigkeit (Schwer baut deutlich mehr Häfen als Mittel).
    if (p.ports < L.maxPorts && p.money > this.buildCostOf(p.idx, 'port') + 100) {
      for (let t = 0; t < 30; t++) {
        const c = this.randomOwnCell(p.idx, 5);
        if (c >= 0 && this.canBuildAt(p.idx, c, 'port') === null) {
          this.applyIntent({ p: p.idx, type: 'build', kind: 'port', cell: c });
          return;
        }
      }
    }
    // 2. Stadt, wenn das Truppenlimit drückt (smarte Bots bauen frueher nach,
    //    damit ihnen die Truppen fuer Angriffe nicht ausgehen).
    const cityThreshold = L.smart ? 0.45 : 0.6;
    if (p.troops > this.maxTroopsOf(p) * cityThreshold && p.money > this.buildCostOf(p.idx, 'city')) {
      const c = this.randomOwnCell(p.idx, 20);
      if (c >= 0 && this.canBuildAt(p.idx, c, 'city') === null) {
        this.applyIntent({ p: p.idx, type: 'build', kind: 'city', cell: c });
        return;
      }
    }
    // 3. Fabrik nahe eigener Stationen (Züge = Geld)
    if (p.factories < L.maxFactories && (p.cities + p.ports) >= 2 && p.money > this.buildCostOf(p.idx, 'factory') + 100) {
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
    // 4. Festungen und Kriegsschiffe (nur Bots mit L.fort, i.d.R. Schwer).
    if (L.fort) {
      if (p.forts < L.maxForts && p.money > BUILD_COSTS.fort + 300) {
        // Smarte Bots stellen die Festung gezielt an die Grenze statt
        // irgendwo ins Landesinnere – dort verteidigt sie tatsaechlich etwas.
        const c = L.smart ? this.borderOwnCell(p.idx, 25) : this.randomOwnCell(p.idx, 20);
        if (c >= 0 && this.canBuildAt(p.idx, c, 'fort') === null) {
          this.applyIntent({ p: p.idx, type: 'build', kind: 'fort', cell: c });
          return;
        }
      }
      if (p.ports > 0 && p.money > WARSHIP_COST + 300 &&
          this.warships.filter(w => w.owner === p.idx).length < L.maxWarships) {
        const port = this.buildings.find(b => b.owner === p.idx && b.kind === 'port');
        if (port) this.applyIntent({ p: p.idx, type: 'warship', cell: port.cell });
      }
    }
  }

  // Ein Bot-Zug (Strategie, je nach Schwierigkeit L). Reihenfolge: Allianzen
  // beantworten, bauen, dann angreifen – bevorzugt neutrales Land, sonst den
  // schwaechsten Nachbarn; ohne Landziel per Boot auf andere Inseln expandieren.
  // Greift nur an, wenn genug Truppen frei sind (nicht alles schon gebunden).
  botAct(p, L) {
    // Groll: wer diesen Bot kürzlich angegriffen hat (Vergeltung, s.u.)
    const grudge = p.grudgeUntil > this.turnNo ? p.lastAggressor : -1;

    // Allianz-Anfragen beantworten (Zustimmung je nach Schwierigkeit).
    // Wer uns gerade bekriegt oder als Verräter gilt, bekommt KEINE Allianz.
    for (let x = 0; x < this.players.length; x++) {
      const key = `${x}:${p.idx}`;
      if (this.allyRequests.has(key)) {
        if (x === grudge || this.isTraitor(x)) this.allyRequests.delete(key);
        else if (this.rng() < L.allyAccept) this.applyIntent({ p: p.idx, type: 'ally', target: x });
        else this.allyRequests.delete(key);
      }
    }

    this.botBuild(p, L);

    if (p.troops < L.minTroops) return;
    if (this.committedTroopsOf(p.idx) > p.troops * 0.8) return;

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

    // Vergeltung hat Vorrang: Wer uns kürzlich angegriffen hat, wird zurück-
    // geschlagen – auch von Masse-Bots und schon bei annähernd gleicher Stärke
    // (REVENGE_THRESHOLD statt des normalen, vorsichtigeren L.threshold).
    // Angriffe auf Bots und Nationen bleiben damit nie ungestraft.
    if (grudge >= 0 && neighborOwners.has(grudge)) {
      const e = this.players[grudge];
      if (e.alive && !this.isAllied(p.idx, grudge) && p.troops > e.troops * REVENGE_THRESHOLD) {
        this.applyIntent({ p: p.idx, type: 'attack', target: grudge, ratio: L.ratioE });
        return;
      }
    }

    if (neighborOwners.has(-1) && this.rng() < (L.smart ? 1 : 0.9)) {
      this.applyIntent({ p: p.idx, type: 'attack', target: -1, ratio: L.ratioN });
      return;
    }

    if (L.smart) {
      // Smarte Zielauswahl: nicht einfach den Gegner mit den wenigsten
      // Truppen picken, sondern den, der pro Zelle am GUENSTIGSTEN zu erobern
      // ist (niedrige Truppendichte = duennes Land) – das ist genau der Faktor,
      // der in processAttacks() die Eroberungskosten bestimmt. Ein Gegner kurz
      // vor der Ausloeschung wird zusaetzlich bevorzugt: sein ganzes restliches
      // Land faellt beim Todesstoss auf einen Schlag zu.
      //
      // Zusaetzlich: Momentane Schwaeche ausnutzen. committedTroopsOf() zaehlt
      // Truppen, die der Nachbar gerade in eigenen Angriffen/Booten gebunden
      // hat (this.attacks[].pool, this.boats[].troops) – p.troops selbst ist
      // ja schon beim Losschicken um diese Menge gesunken (siehe 'attack'/
      // 'boat' in applyIntent). Ein hoher gebundener Anteil heisst: der
      // Nachbar hat sich gerade woanders verausgabt und ist zuhause duenn
      // verteidigt – genau der Moment zum Zuschlagen.
      let best = null, bestScore = -Infinity, bestDensity = 0, bestExposed = 0;
      for (const o of neighborOwners) {
        if (o < 0) continue;
        const e = this.players[o];
        if (!e.alive || this.isAllied(p.idx, o)) continue;
        const committed = this.committedTroopsOf(o);
        const totalForce = e.troops + committed;
        const exposedFrac = totalForce > 0 ? committed / totalForce : 0;
        const density = e.troops / Math.max(1, e.territory);
        const finishBonus = e.territory < 350 ? 2.5 : 1;
        // Bis zu 4x Bonus, wenn (fast) die gesamte Streitmacht des Nachbarn
        // gerade anderswo gebunden ist.
        const vulnBonus = 1 + exposedFrac * 3;
        const score = finishBonus * vulnBonus / (density + 0.4);
        if (score > bestScore) { bestScore = score; best = e; bestDensity = density; bestExposed = exposedFrac; }
      }
      if (best) {
        // Angriff lohnt sich, wenn unser eingesetzter Pool die geschaetzten
        // Frontkosten mehrfach decken kann (nicht nur "mehr Truppen insgesamt
        // als der Gegner" – bei duennem Land reicht auch klare Unterzahl).
        // Ist der Nachbar gerade anderweitig gebunden, reicht sogar deutliche
        // eigene Unterzahl (effektive Schwelle sinkt bis auf ein Viertel).
        const estCellCost = ENEMY_COST_BASE + bestDensity * ENEMY_COST_DENSITY;
        const pool = p.troops * L.ratioE;
        const effectiveThreshold = L.threshold * (1 - bestExposed * 0.75);
        if (pool > estCellCost * 6 && p.troops > best.troops * effectiveThreshold) {
          this.applyIntent({ p: p.idx, type: 'attack', target: best.idx, ratio: L.ratioE });
          return;
        }
      }
    } else {
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
    }

    // Keine Ziele auf den eigenen Inseln -> per Boot expandieren
    if (this.boats.filter(b => b.owner === p.idx).length < (L.smart ? 4 : 2) && p.troops > L.boatMin) {
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
