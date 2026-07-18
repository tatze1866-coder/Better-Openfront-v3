// Headless-Test der Spiel-Engine (Boote, Gebäude, Allianzen, Determinismus)
import { Game, SPAWN_TURNS, BUILD_COSTS, WARSHIP_COST, MAP_SIZES, GROWTH_PEAK, BOT_LEVELS, WEAK_BOT_LEVEL, NATION_NAMES, PLAYER_COLORS, TOWER_AMMO, TERRAIN_COST } from '../public/js/engine.js';

const results = [];
const ok = (name, cond, extra = '') => {
  results.push(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  (' + extra + ')' : ''}`);
};

function newGame(seed) {
  return new Game({
    seed,
    mapSize: 'klein', // gleiche Geometrie wie vor der Größen-Option
    mapType: 'random',
    players: [
      { name: 'Mensch', bot: false },
      { name: 'Bot 1', bot: true },
      { name: 'Bot 2', bot: true },
    ],
  });
}

// ---- Spiel 1: Feature-Tests ----
const g = newGame(4242);
ok('Karte hat mehrere große Inseln', g.map.islandSizes.filter(s => s >= 400).length >= 2,
  'Größen: ' + g.map.islandSizes.sort((a, b) => b - a).slice(0, 4).join(','));

// Spawn-Phase durchlaufen
while (g.phase === 'spawn') g.turn([]);
ok('Spawn-Phase endet nach ' + SPAWN_TURNS + ' Ticks', g.turnNo === SPAWN_TURNS);

// Meine Insel bestimmen
let myCell = -1;
for (let c = 0; c < g.owner.length; c++) if (g.owner[c] === 0) { myCell = c; break; }
const myIsland = g.map.island[myCell];

// Erst etwas expandieren
g.turn([{ p: 0, type: 'attack', target: -1, ratio: 0.5 }]);
for (let i = 0; i < 100; i++) g.turn([]);
ok('Expansion ins Neutrale', g.players[0].territory > 100, 'Gebiet: ' + g.players[0].territory);

// Stadt bauen (kostet Geld, keine Truppen)
const m0 = g.players[0].money;
g.turn([{ p: 0, type: 'build', kind: 'city', cell: myCell }]);
ok('Stadt gebaut', g.players[0].cities === 1 && g.buildingAt.has(myCell));
ok('Stadt kostet ' + BUILD_COSTS.city + ' €', Math.abs((m0 - BUILD_COSTS.city) - g.players[0].money) < 5,
  'vorher ' + Math.floor(m0) + ' €, nachher ' + Math.floor(g.players[0].money) + ' €');

// Festung zu nah an der Stadt -> abgelehnt
g.turn([{ p: 0, type: 'build', kind: 'fort', cell: myCell + 2 }]);
ok('Bauen zu nah an Gebäude abgelehnt', g.players[0].forts === 0);

// Geld direkt geben (Einkommen abwarten würde den Spieler den Bots ausliefern)
g.players[0].money = 500;
for (let i = 0; i < 500 && g.players[0].troops < 500; i++) g.turn([]);
// Festung weit weg von der Stadt bauen (Abstand > MIN_BUILD_DIST2 der Engine).
// Seit den Geländetypen expandiert der Spieler langsamer – statt einer harten
// Distanz 150 nehmen wir die weiteste eigene Zelle jenseits des Mindestabstands.
let fortCell = -1, fortBestD = 0;
for (let c = 0; c < g.owner.length; c++) {
  if (g.owner[c] !== 0) continue;
  const d = g.dist2(c, myCell);
  if (d > 100 && d > fortBestD) { fortBestD = d; fortCell = c; }
}
g.turn([{ p: 0, type: 'build', kind: 'fort', cell: fortCell }]);
ok('Festung gebaut', g.players[0].forts === 1);
for (let i = 0; i < 50; i++) g.turn([]); // Aufbauzeit (5s) abwarten
ok('Festungs-Bonus wirkt (8x)', g.fortBonus(fortCell, 0) === 8 && g.fortBonus(myCell, 0) >= 1);

// Boot auf fremde Insel
let boatTarget = -1;
for (const c of g.landCells) {
  if (g.owner[c] === -1 && g.map.island[c] !== myIsland) { boatTarget = c; break; }
}
ok('Fremde Insel mit neutralem Land existiert', boatTarget >= 0);

// Bis ans OFFENE MEER expandieren (ohne Seeweg kein Boot – korrektes Verhalten).
// Wichtig: "grenzt an Wasser" reicht nicht – das kann ein Binnensee sein. Genau
// daran hing dieser Test: der Spieler berührte einen 2-Zellen-Tümpel, die
// Expansion brach sofort ab und es gab nie einen Seeweg. Deshalb per Flood-Fill
// prüfen, ob das Gewässer an unserer Küste wirklich eine ANDERE Insel erreicht.
const hasSeaRoute = () => {
  const nb = new Int32Array(4);
  const seen = new Uint8Array(g.owner.length);
  const stack = [];
  for (let c = 0; c < g.owner.length; c++) {
    if (g.owner[c] !== 0) continue;
    const k = g.neighbors4(c, nb);
    for (let i = 0; i < k; i++) {
      const m = nb[i];
      if (g.map.terrain[m] === 0 && !seen[m]) { seen[m] = 1; stack.push(m); }
    }
  }
  while (stack.length) {
    const c = stack.pop();
    const k = g.neighbors4(c, nb);
    for (let i = 0; i < k; i++) {
      const m = nb[i];
      if (g.map.terrain[m] === 0) {
        if (!seen[m]) { seen[m] = 1; stack.push(m); }
      } else if (g.map.island[m] !== myIsland) {
        return true; // andere Insel am selben Gewässer -> Seeweg möglich
      }
    }
  }
  return false;
};
for (let round = 0; round < 60 && !hasSeaRoute(); round++) {
  g.turn([{ p: 0, type: 'attack', target: -1, ratio: 0.6 }]);
  for (let i = 0; i < 100; i++) g.turn([]);
}
ok('Spieler erreicht das offene Meer', hasSeaRoute(), 'Gebiet: ' + g.players[0].territory);
for (let i = 0; i < 3000 && g.players[0].troops < 400; i++) g.turn([]);

// Ziel-Insel jetzt neu wählen: eine, zu der es von unserer Küste aus auch
// wirklich einen Seeweg gibt (sonst hängt der Test an der Kartengeometrie).
// Neutral wird bevorzugt, aber inzwischen sind Minuten vergangen – die Bots
// haben die kleinen Inseln oft schon besiedelt, dann ist ein Gegner-Ziel ok
// (das Boot darf auch auf feindliche Küsten landen).
// findBoatPath ist eine BFS über die ganze Karte -> nur EINMAL pro Insel testen.
const pickBoatTarget = neutralOnly => {
  const tried = new Set([myIsland]);
  for (const c of g.landCells) {
    const isl = g.map.island[c];
    if (tried.has(isl) || g.owner[c] === 0) continue;
    if (neutralOnly && g.owner[c] !== -1) continue;
    tried.add(isl);
    if (g.findBoatPath(0, c)) return c;
  }
  return -1;
};
boatTarget = pickBoatTarget(true);
if (boatTarget < 0) boatTarget = pickBoatTarget(false);
ok('Fremde Insel mit Seeweg gefunden', boatTarget >= 0,
  boatTarget >= 0 ? `Insel ${g.map.island[boatTarget]}, Besitzer ${g.owner[boatTarget]}` : 'keine erreichbar');

// Truppen kontrolliert setzen: sonst entscheidet die Wirtschaft (und bei einem
// Gegner-Ziel dessen Truppendichte), ob die Landung überhaupt durchkommt.
g.players[0].troops = 4000;
g.turn([{ p: 0, type: 'boat', cell: boatTarget, ratio: 0.4 }]);
ok('Boot gestartet', g.boats.filter(b => b.owner === 0).length === 1);

// Boot ankommen lassen, dann den Brückenkopf-Angriff arbeiten lassen.
// Großzügig warten: der Seeweg kann auf großen Karten lang sein.
for (let i = 0; i < 4000 && g.boats.some(b => b.owner === 0); i++) g.turn([]);
for (let i = 0; i < 150; i++) g.turn([]);
let onTargetIsland = 0;
const targetIsland = g.map.island[boatTarget];
for (let c = 0; c < g.owner.length; c++) {
  if (g.owner[c] === 0 && g.map.island[c] === targetIsland) onTargetIsland++;
}
ok('Boot gelandet, Brückenkopf erobert Zellen', onTargetIsland > 5, 'Zellen auf Ziel-Insel: ' + onTargetIsland);

// Allianz: Anfrage an Bot 1, Bots antworten in botAct (60%) – mehrfach versuchen
let allied = false;
for (let attempt = 0; attempt < 5 && !allied; attempt++) {
  g.turn([{ p: 0, type: 'ally', target: 1 }]);
  for (let i = 0; i < 60; i++) g.turn([]);
  allied = g.isAllied(0, 1);
}
ok('Bot nimmt Allianz an (mehrere Versuche)', allied);

// Verbündeten angreifen -> Intent wird ignoriert
const troopsBefore = g.players[0].troops;
g.turn([{ p: 0, type: 'attack', target: 1, ratio: 0.5 }]);
ok('Angriff auf Verbündeten ignoriert', g.attacks.every(a => !(a.attacker === 0 && a.target === 1)));

// Allianz brechen
g.turn([{ p: 0, type: 'unally', target: 1 }]);
ok('Allianz gebrochen', !g.isAllied(0, 1));

// ---- Spiel 2+3: Determinismus (identische Intents -> identischer Zustand) ----
function runScripted(seed) {
  const game = newGame(seed);
  const script = t => {
    if (t === 150) return [{ p: 0, type: 'attack', target: -1, ratio: 0.5 }];
    if (t === 300) return [{ p: 0, type: 'build', kind: 'city', cell: (() => { for (let c = 0; c < game.owner.length; c++) if (game.owner[c] === 0) return c; return 0; })() }];
    if (t === 400) return [{ p: 0, type: 'ally', target: 2 }];
    return [];
  };
  for (let t = 0; t < 1200; t++) game.turn(script(t));
  // Checksumme über Besitzkarte + Truppen
  let sum = 0;
  for (let c = 0; c < game.owner.length; c++) sum = (sum * 31 + game.owner[c] + 2) | 0;
  for (const p of game.players) sum = (sum * 31 + Math.floor(p.troops * 1000)) | 0;
  return sum;
}
const s1 = runScripted(1337), s2 = runScripted(1337);
ok('Determinismus: identische Läufe -> identische Checksumme', s1 === s2, 'sum=' + s1);

// ---- Spiel 4: Bots spielen bis zum Sieg (kein Hänger, keine Exception) ----
const g2 = newGame(777);
let steps = 0;
while (g2.phase !== 'ended' && steps < 60000) { g2.turn([]); steps++; }
ok('Bot-Spiel endet mit Sieger', g2.winners !== null,
  `nach ${steps} Ticks, Sieger: ${g2.winners ? g2.winners.map(i => g2.players[i].name).join(', ') : '-'}`);

// ---- Spiel 5: Schwierigkeitsgrade ----
const g3 = new Game({
  seed: 555,
  players: [
    { name: 'Leicht-Bot', bot: true, level: 0 },
    { name: 'Schwer-Bot', bot: true, level: 2 },
    { name: 'Default-Bot', bot: true },
  ],
});
ok('Bot-Level aus Konfiguration übernommen',
  g3.players[0].botLevel === 0 && g3.players[1].botLevel === 2 && g3.players[2].botLevel === 1);

// ---- Spiel 6: Team-Sieg über Allianz ----
const g4 = new Game({
  seed: 987,
  players: [{ name: 'Mensch', bot: false }, { name: 'Partner-Bot', bot: true }],
});
while (g4.phase === 'spawn') g4.turn([]);
let teamAllied = false;
for (let attempt = 0; attempt < 8 && !teamAllied; attempt++) {
  g4.turn([{ p: 0, type: 'ally', target: 1 }]);
  for (let i = 0; i < 60; i++) g4.turn([]);
  teamAllied = g4.isAllied(0, 1);
}
for (let i = 0; i < 20 && g4.phase !== 'ended'; i++) g4.turn([]);
ok('Team-Sieg: verbündete Überlebende gewinnen gemeinsam',
  teamAllied && g4.winners !== null && g4.winners.length === 2,
  'winners=' + JSON.stringify(g4.winners));

// ---- Spiel 6b: Angriffe rücken als Linie vor ----
{
  const gl = new Game({
    seed: 2024, mapSize: 'klein', mapType: 'random',
    players: [{ name: 'A', bot: false }, { name: 'B', bot: false }], // keine Bots -> volle Kontrolle
  });
  // Beide Spieler gezielt nebeneinander auf die größte Insel setzen
  let bigIsland = 0;
  for (let i = 0; i < gl.map.islandSizes.length; i++) {
    if (gl.map.islandSizes[i] > gl.map.islandSizes[bigIsland]) bigIsland = i;
  }
  let c0 = -1;
  for (const c of gl.landCells) {
    if (gl.map.island[c] === bigIsland && gl.map.island[c + 16] === bigIsland &&
        ((c % gl.map.w) + 16) < gl.map.w && gl.owner[c] === -1 && gl.owner[c + 16] === -1) {
      // etwas Abstand vom Inselrand
      if (gl.map.island[c - gl.map.w * 8] === bigIsland && gl.map.island[c + gl.map.w * 8] === bigIsland) { c0 = c; break; }
    }
  }
  ok('Test-Spawns nebeneinander gefunden', c0 >= 0);
  gl.turn([{ p: 0, type: 'spawn', cell: c0 }, { p: 1, type: 'spawn', cell: c0 + 16 }]);
  while (gl.phase === 'spawn') gl.turn([]);

  // Angriff auf Neutral starten, ersten Vorstoß abwarten
  const terrBefore = gl.players[0].territory;
  gl.turn([{ p: 0, type: 'attack', target: -1, ratio: 0.6 }]);
  const front = gl.scanFrontier(0, -1).size;
  for (let i = 0; i < 3; i++) gl.turn([]); // ein Vorstoß-Intervall
  const gained = gl.players[0].territory - terrBefore;
  ok('Angriff erobert die komplette Frontlinie auf einmal', gained >= front * 0.95,
    `Front ${front} Zellen, erobert ${gained}`);

  // Beide expandieren, bis sich die Reiche berühren
  let touching = false;
  for (let round = 0; round < 20 && !touching; round++) {
    gl.turn([
      { p: 0, type: 'attack', target: -1, ratio: 0.5 },
      { p: 1, type: 'attack', target: -1, ratio: 0.5 },
    ]);
    for (let i = 0; i < 30; i++) gl.turn([]);
    touching = gl.scanFrontier(0, 1).size > 0;
  }
  ok('Reiche berühren sich (Vorbereitung Gegenangriff)', touching);

  // Gegenseitiger Angriff: beide Fronten bleiben aktiv (kein vorzeitiger Abbruch).
  // Bewusst SOFORT nach dem Intent geprüft und nicht nach vielen Ticks: bei
  // gleich starken Gegnern ist der Pool systembedingt schnell leer, weil die
  // Vorstoß-Kosten mit der Truppendichte des Verteidigers steigen. Getestet wird
  // die Mechanik (beide Angriffe existieren und haben eine Front), nicht wie
  // lange die Truppen reichen. Hohes ratio, damit der Pool auch den ersten Tick
  // übersteht – die Geländekosten (Hügel/Gebirge bis 2.5x) erhöhen den Verbrauch.
  gl.turn([
    { p: 0, type: 'attack', target: 1, ratio: 0.9 },
    { p: 1, type: 'attack', target: 0, ratio: 0.9 },
  ]);
  const a01 = gl.attacks.find(a => a.attacker === 0 && a.target === 1);
  const a10 = gl.attacks.find(a => a.attacker === 1 && a.target === 0);
  ok('Gegenseitiger Angriff: Fronten kämpfen weiter',
    !!a01 && !!a10 && a01.pool > 0 && a10.pool > 0 && a01.frontier.size > 0 && a10.frontier.size > 0,
    a01 && a10 ? `0->1 Pool ${Math.floor(a01.pool)} / Front ${a01.frontier.size}, 1->0 Pool ${Math.floor(a10.pool)} / Front ${a10.frontier.size}`
               : 'ein Angriff wurde abgebrochen');

  // Mehrere Angriffe gleichzeitig (Neutral + Gegner).
  // Truppen kontrolliert setzen: nach dem Gegenangriff oben sind beide ausgelaugt,
  // und ein Angriff mit leerem Pool ist schon im selben Tick wieder weg. Ein
  // schwacher Verteidiger (niedrige Dichte) hält die Vorstoß-Kosten klein.
  gl.players[0].troops = 6000;
  gl.players[1].troops = 200;
  gl.turn([
    { p: 0, type: 'attack', target: -1, ratio: 0.3 },
    { p: 0, type: 'attack', target: 1, ratio: 0.3 },
  ]);
  const targets = new Set(gl.attacks.filter(a => a.attacker === 0 && a.pool > 0).map(a => a.target));
  ok('Mehrere Angriffe gleichzeitig (verschiedene Ziele)', targets.size >= 2,
    'Ziele: ' + [...targets].join(','));

  // Gegenangriff mit ungleichen Kräften: die deutlich stärkere Front rückt in
  // kürzerem Takt vor, damit sich der Schlagabtausch schnell entscheidet.
  gl.attacks.length = 0;
  gl.players[0].troops = 30000;
  gl.players[1].troops = 30000;
  gl.turn([
    { p: 0, type: 'attack', target: 1, ratio: 0.5 },
    { p: 1, type: 'attack', target: 0, ratio: 0.5 },
  ]);
  const s01 = gl.attacks.find(a => a.attacker === 0 && a.target === 1);
  const s10 = gl.attacks.find(a => a.attacker === 1 && a.target === 0);
  ok('Gleich starke Fronten rücken im gleichen Takt vor', !!s01 && !!s10 && s01.cd === s10.cd,
    s01 && s10 ? `cd ${s01.cd} vs ${s10.cd}` : 'Angriff fehlt');
  s01.pool = 20000;
  s10.pool = 1000;
  const terr0 = gl.players[0].territory;
  for (let i = 0; i < 8; i++) gl.turn([]);
  ok('Überlegene Front rückt schneller vor (kürzerer Takt)', s01.cd < s10.cd,
    `cd stark ${s01.cd}, cd schwach ${s10.cd}`);
  ok('Überlegene Front gewinnt netto Gebiet', gl.players[0].territory > terr0,
    `Gebiet ${terr0} -> ${gl.players[0].territory}`);
}

// ---- Spiel 7: Preset-Karten (Weltkarte & Kontinente) ----
const tGen = Date.now();
const gw = new Game({
  seed: 42,
  mapType: 'world',
  mapSize: 'gross',
  players: [{ name: 'Mensch', bot: false }, { name: 'Bot', bot: true }],
});
const genMs = Date.now() - tGen;
const frac = gw.map.landCount / (gw.map.w * gw.map.h);
// Breite aus MAP_SIZES lesen statt fest verdrahten – sonst bricht der Test bei
// jeder Balancing-Änderung der Kartengrößen.
ok('Weltkarte (groß) generiert', gw.map.w === MAP_SIZES.gross.w && frac > 0.2 && frac < 0.45,
  `${gw.map.w}×${gw.map.h}, Landanteil ${(frac * 100).toFixed(1)}%, ${genMs}ms`);
ok('Weltkarte hat viele Inseln (Kontinente + GB/Japan/…)', gw.map.islandSizes.length >= 8,
  gw.map.islandSizes.length + ' Inseln');
ok('Spawns auf Weltkarte platziert', gw.players.every(p => p.territory > 0));

for (const type of ['europe', 'asia', 'africa', 'namerica', 'samerica', 'australia']) {
  const gc = new Game({ seed: 5, mapType: type, mapSize: 'klein', players: [{ name: 'A', bot: true }, { name: 'B', bot: true }] });
  const f = gc.map.landCount / (gc.map.w * gc.map.h);
  ok(`Karte '${type}' generiert & bespielbar`, f > 0.1 && f < 0.85 && gc.players.every(p => p.territory > 0),
    `Land ${(f * 100).toFixed(0)}%`);
}

// Weltkarten-Determinismus: gleicher Seed -> identisches Terrain
function terrainSum(seed) {
  const gm = new Game({ seed, mapType: 'world', mapSize: 'klein', players: [{ name: 'A', bot: true }, { name: 'B', bot: true }] });
  let sum = 0;
  for (let c = 0; c < gm.map.terrain.length; c++) sum = (sum * 31 + gm.map.terrain[c]) | 0;
  return sum;
}
ok('Weltkarte deterministisch', terrainSum(99) === terrainSum(99));

// ---- Spiel 8: Viele Bots (15) auf großer Karte laufen stabil ----
const manyPlayers = [{ name: 'Mensch', bot: false }];
for (let i = 0; i < 15; i++) manyPlayers.push({ name: 'Bot ' + (i + 1), bot: true, level: i % 3 });
const gBig = new Game({ seed: 321, mapType: 'world', mapSize: 'gross', players: manyPlayers });
const uniqueColors = new Set(gBig.players.map(p => p.color));
ok('16 Spieler mit eindeutigen Farben', uniqueColors.size === 16);
const tSim = Date.now();
for (let i = 0; i < 800 && gBig.phase !== 'ended'; i++) gBig.turn([]);
const simMs = Date.now() - tSim;
ok('15-Bot-Spiel auf großer Weltkarte läuft (800 Ticks)',
  gBig.players.filter(p => p.territory > 0).length >= 10 && simMs < 20000,
  `${simMs}ms für 800 Ticks (${(simMs / 800).toFixed(1)}ms/Tick)`);

// ---- Spiel 9: Wachstumskurve ----
{
  const gk = newGame(1);
  while (gk.phase === 'spawn') gk.turn([]);
  const p0 = gk.players[0];
  const max = gk.maxTroopsOf(p0);
  p0.troops = max * 0.1; const g10 = gk.troopGrowthOf(p0);
  p0.troops = max * GROWTH_PEAK; const gPeak = gk.troopGrowthOf(p0);
  p0.troops = max * 0.8; const g80 = gk.troopGrowthOf(p0);
  p0.troops = max * 0.9; const g90 = gk.troopGrowthOf(p0);
  p0.troops = max; const g100 = gk.troopGrowthOf(p0);
  ok(`Wachstumskurve: Maximum bei ${(GROWTH_PEAK * 100).toFixed(0)}% des Limits`,
    GROWTH_PEAK === 0.42 && gPeak > g10 && gPeak > g90,
    `10%: ${g10.toFixed(2)} · ${(GROWTH_PEAK * 100).toFixed(0)}%: ${gPeak.toFixed(2)} · 90%: ${g90.toFixed(2)} pro Tick`);
  ok('Wachstum bricht über 80% des Limits deutlich ein', g80 < gPeak * 0.4,
    `bei 80%: ${(g80 / gPeak * 100).toFixed(0)}% des Maximums`);
  ok('Wachstum = 0 am Truppenlimit', g100 === 0);

  // Das Wachstum haengt an der Kapazitaet: eine Stadt (+25.000) hebt es genauso
  // stark wie das Limit. Ohne diese Kopplung klebt der Fuellstand bei ~0 und die
  // Kurve oben wird wirkungslos (so war es vor der Umstellung).
  p0.territory = 1000; p0.cities = 0;
  p0.troops = gk.maxTroopsOf(p0) * GROWTH_PEAK;
  const wLand = gk.troopGrowthOf(p0);
  p0.cities = 1;
  p0.troops = gk.maxTroopsOf(p0) * GROWTH_PEAK;
  const wCity = gk.troopGrowthOf(p0);
  ok('Eine Stadt hebt das Wachstum so stark wie das Limit', wCity / wLand > 5,
    `ohne Stadt ${wLand.toFixed(2)} -> mit Stadt ${wCity.toFixed(2)} pro Tick`);
}

// ---- Spiel 10: Häfen, Handel, Kriegsschiffe, Fabrik & Züge ----
{
  const gt = new Game({
    seed: 4242, mapSize: 'klein', mapType: 'random',
    players: [{ name: 'A', bot: false }, { name: 'B', bot: false }],
  });
  while (gt.phase === 'spawn') gt.turn([]);
  const KF = { city: 'cities', fort: 'forts', port: 'ports', factory: 'factories' };
  const placeBuilding = (owner, kind, cell) => {
    const b = { owner, kind, cell };
    gt.buildings.push(b);
    gt.buildingAt.set(cell, b);
    gt.players[owner][KF[kind]]++;
    return b;
  };
  // Zwei entfernte Küstenzellen mit Seeweg finden
  const coastal = gt.landCells.filter(c => gt.waterAdjacent(c).length > 0);
  let pA = -1, pB = -1;
  outer:
  for (let i = 0; i < coastal.length; i += 97) {
    for (let j = coastal.length - 1; j > 0; j -= 89) {
      if (gt.dist2(coastal[i], coastal[j]) > 2500 && gt.portWaterPath(coastal[i], coastal[j])) {
        pA = coastal[i]; pB = coastal[j];
        break outer;
      }
    }
  }
  ok('Zwei Hafen-Standorte mit Seeweg gefunden', pA >= 0);
  placeBuilding(0, 'port', pA);
  placeBuilding(1, 'port', pB);

  // Hafen-Bauregel: braucht Küste
  let inland = -1;
  for (const c of gt.landCells) {
    if (gt.owner[c] === 0 && gt.waterAdjacent(c).length === 0) { inland = c; break; }
  }
  if (inland >= 0) ok('Hafen ohne Küste abgelehnt', gt.canBuildAt(0, inland, 'port') !== null);

  // Handel: Schiffe fahren, Ankunft zahlt beide Seiten
  const mA = gt.players[0].money, mB = gt.players[1].money;
  let sawTrade = false;
  for (let i = 0; i < 800; i++) { gt.turn([]); if (gt.tradeShips.length) sawTrade = true; }
  ok('Handelsschiffe fahren zwischen Häfen', sawTrade);
  ok('Handel bringt beiden Seiten Geld',
    gt.players[0].money > mA + 40 && gt.players[1].money > mB + 40,
    `A +${Math.floor(gt.players[0].money - mA)} €, B +${Math.floor(gt.players[1].money - mB)} €`);

  // Kriegsschiff bauen
  gt.players[0].money = 1000;
  gt.turn([{ p: 0, type: 'warship', cell: pA }]);
  ok('Kriegsschiff gebaut', gt.warships.length === 1 && gt.warships[0].owner === 0);

  // Kriegsschiff kapert nicht-verbündetes Handelsschiff durch Berührung
  const ws = gt.warships[0];
  gt.tradeShips.length = 0;
  gt.tradeShips.push({ owner: 1, to: pB, path: new Array(500).fill(ws.cell), pos: 0 });
  for (let i = 0; i < 5; i++) {
    gt.tradeShips[0].path = new Array(500).fill(ws.cell); // Schiff "festhalten"
    gt.tradeShips[0].pos = 0;
    gt.turn([]);
  }
  ok('Handelsschiff gekapert (konvertiert)', gt.tradeShips.length > 0 && gt.tradeShips[0].owner === 0);
  gt.tradeShips.length = 0;

  // Kriegsschiff versenkt feindliches Transportboot mit 1 Schuss
  gt.boats.push({ owner: 1, troops: 50, path: new Array(500).fill(ws.cell), landing: pB, pos: 0 });
  let boatSank = false;
  for (let i = 0; i < 30 && !boatSank; i++) {
    if (gt.boats.length) { gt.boats[0].path = new Array(500).fill(ws.cell); gt.boats[0].pos = 0; }
    gt.turn([]);
    boatSank = gt.boats.length === 0;
  }
  ok('Transportboot nach 1 Treffer versenkt', boatSank);

  // Fabrik + Züge: Hafen B entfernen (kein Handel mehr), Fabrik & Stadt nahe Hafen A
  gt.buildings = gt.buildings.filter(b => b.cell !== pB);
  gt.buildingAt.delete(pB);
  gt.players[1].ports--;
  let fc = -1, cc = -1;
  for (const c of gt.landCells) {
    if (fc < 0 && c !== pA && !gt.buildingAt.has(c) && gt.dist2(c, pA) > 4 && gt.dist2(c, pA) <= 400) fc = c;
    else if (fc >= 0 && cc < 0 && !gt.buildingAt.has(c) && gt.dist2(c, fc) > 4 && gt.dist2(c, fc) <= 400) cc = c;
    if (fc >= 0 && cc >= 0) break;
  }
  ok('Plätze für Fabrik und Stadt gefunden', fc >= 0 && cc >= 0);
  placeBuilding(0, 'factory', fc);
  placeBuilding(0, 'city', cc);
  ok('Schienennetz verbindet Stationen im Radius', gt.factoryStations(gt.buildingAt.get(fc)).length >= 2);
  const mTrain = gt.players[0].money;
  let trainsSeen = 0;
  for (let i = 0; i < 900; i++) {
    gt.turn([]);
    trainsSeen = Math.max(trainsSeen, gt.trains.length);
  }
  ok('Züge fahren auf dem Schienennetz', trainsSeen > 0, trainsSeen + ' Züge gleichzeitig max.');
  ok('Züge bringen Geld', gt.players[0].money - mTrain > 80,
    `+${Math.floor(gt.players[0].money - mTrain)} € in 90s`);
}

// ---- Spiel 11: Steigende Baupreise ----
{
  const ge = new Game({
    seed: 4242, mapSize: 'klein', mapType: 'random',
    players: [{ name: 'A', bot: false }, { name: 'B', bot: false }],
  });
  const p = ge.players[0];
  ok('Stadt-Grundpreis', ge.buildCostOf(0, 'city') === BUILD_COSTS.city);
  p.cities = 1;
  ok('2. Stadt kostet 2x', ge.buildCostOf(0, 'city') === BUILD_COSTS.city * 2);
  p.cities = 3;
  ok('4. Stadt kostet 8x', ge.buildCostOf(0, 'city') === BUILD_COSTS.city * 8);
  p.cities = 4;
  ok('5. Stadt kostet 16x (250 -> 4.000 €)', ge.buildCostOf(0, 'city') === BUILD_COSTS.city * 16);
  p.cities = 9;
  ok('Stadtpreis capped bei 16x (4 Verdopplungen)', ge.buildCostOf(0, 'city') === BUILD_COSTS.city * 16);
  p.cities = 0;
  p.ports = 1;
  p.factories = 1;
  ok('Hafen & Fabrik teilen den Zähler (2 Gebäude -> je 4x)',
    ge.buildCostOf(0, 'port') === BUILD_COSTS.port * 4 &&
    ge.buildCostOf(0, 'factory') === BUILD_COSTS.factory * 4);
  p.forts = 5;
  ok('Festungspreis bleibt konstant', ge.buildCostOf(0, 'fort') === BUILD_COSTS.fort);
  // Echter Bau zieht den gestiegenen Preis ab
  while (ge.phase === 'spawn') ge.turn([]);
  p.cities = 1; p.ports = 0; p.factories = 0; p.forts = 0;
  p.money = 10000;
  let own = -1;
  for (let c = 0; c < ge.owner.length; c++) if (ge.owner[c] === 0) { own = c; break; }
  const mBefore = p.money;
  ge.turn([{ p: 0, type: 'build', kind: 'city', cell: own }]);
  ok('Bau zieht den verdoppelten Preis ab',
    Math.abs((mBefore - BUILD_COSTS.city * 2) - p.money) < 5,
    `abgezogen: ${Math.floor(mBefore - p.money)} €`);
}

// ---- Spiel 12: Schienennetz (Stadt–Stadt, Verschmelzung) & Zug-Bezahlung ----
{
  const gr = new Game({
    seed: 99, mapSize: 'klein', mapType: 'random',
    players: [{ name: 'A', bot: false }, { name: 'B', bot: false }],
  });
  while (gr.phase === 'spawn') gr.turn([]);
  const W = gr.map.w;
  const at = (x, y) => y * W + x;
  // Gebäude direkt setzen (umgeht Baukosten/Gelände – fürs Netz zählt nur die Lage)
  const put = (owner, kind, cell) => {
    const b = { owner, kind, cell };
    gr.buildings.push(b);
    gr.buildingAt.set(cell, b);
    return b;
  };
  const adjOf = c => gr.rails.adj.get(c) || [];

  // Fabrik F1 mit zwei Städten in ihrem Radius (60)
  const f1 = at(40, 40), c1 = at(60, 40), c2 = at(40, 70);
  put(0, 'factory', f1);
  put(0, 'city', c1);
  put(0, 'city', c2);
  gr.buildRailNetwork();
  ok('Fabrik ist mit den Städten im Radius verbunden',
    adjOf(f1).includes(c1) && adjOf(f1).includes(c2));
  // Kette statt Stern: eine Stadt HINTER c1 haengt sich an c1 an, nicht an die
  // Fabrik – der Weg dorthin fuehrt ueber die naeher gelegene Stadt.
  const c3 = at(80, 40);
  put(0, 'city', c3);
  gr.buildRailNetwork();
  ok('Stadt schließt an die nächstgelegene Stadt an', adjOf(c1).includes(c3));
  ok('Keine Direktschiene von der hinteren Stadt zur Fabrik', !adjOf(f1).includes(c3));
  ok('Nur ein Weg zwischen zwei Stationen (keine Dreiecke)',
    !adjOf(c1).includes(c2) && gr.rails.edges.length === 3, `${gr.rails.edges.length} Kanten`);

  // 2. Fabrik zu weit weg für direkten Kontakt (110 > 60), aber Stadt dazwischen
  // liegt in BEIDEN Radien (60 zu f1, 50 zu f2) -> Netze verschmelzen
  const f2 = at(150, 40), cMid = at(100, 40);
  put(0, 'factory', f2);
  put(0, 'city', cMid);
  gr.buildRailNetwork();
  const seen = new Set([f1]);
  const stack = [f1];
  while (stack.length) {
    const n = stack.pop();
    for (const m of adjOf(n)) if (!seen.has(m)) { seen.add(m); stack.push(m); }
  }
  ok('Netze verschmelzen über eine gemeinsame Stadt', seen.has(f2), `${seen.size} Knoten im Netz`);
  ok('Fabriken außer Reichweite: keine Direktschiene', !adjOf(f1).includes(f2));

  // Fabrik in Reichweite (30 <= 60) wird direkt angeschlossen. Züge fahren
  // durch, aber Fabriken zahlen nichts (payTrain gilt nur für Städte/Häfen).
  const f3 = at(10, 40);
  put(0, 'factory', f3);
  gr.buildRailNetwork();
  ok('Fabriken in Reichweite sind verbunden', adjOf(f1).includes(f3));

  // Bezahlung
  const A = gr.players[0], B = gr.players[1];
  const foreign = put(1, 'city', at(40, 10)); // Stadt von B, im Radius von f1
  gr.buildRailNetwork();
  A.money = 0; B.money = 0;
  gr.payTrain({ owner: 0 }, foreign);
  const notAllied = A.money;
  ok('Fremde Station: beide verdienen', A.money > 0 && B.money > 0, `A +${A.money} / B +${B.money}`);

  A.money = 0; B.money = 0;
  gr.payTrain({ owner: 0 }, gr.buildingAt.get(c1)); // eigene Stadt
  ok('Eigene Station: nur der Zug-Besitzer', A.money > 0 && B.money === 0, `A +${A.money} / B +${B.money}`);

  gr.alliances.add(gr.allianceKey(0, 1));
  A.money = 0; B.money = 0;
  gr.payTrain({ owner: 0 }, foreign);
  ok('Verbündete Station zahlt mehr als eine nicht-verbündete',
    A.money > notAllied && B.money === A.money, `${notAllied} € -> ${A.money} €`);

  // Einnahmen erzeugen Events fürs HUD (Geld-Popups über der Geldanzeige)
  gr.moneyEvents.length = 0;
  gr.payTrain({ owner: 0 }, gr.buildingAt.get(c1));
  ok('Zug-Einnahme erzeugt ein Geld-Event',
    gr.moneyEvents.some(e => e.p === 0 && e.amount > 0));
}

// ---- Spiel 12b: Hafen-Klick snappt zur Küste ----
{
  const gp = newGame(21);
  while (gp.phase === 'spawn') gp.turn([]);
  const W = gp.map.w;
  // Binnenzelle (nicht an der Küste) mit einer Küstenzelle im Umkreis 8 suchen
  let inland = -1;
  for (const c of gp.landCells) {
    if (gp.isCoastal(c)) continue;
    const x = c % W, y = (c / W) | 0;
    if (x < 8 || y < 8 || x >= W - 8 || y >= gp.map.h - 8) continue;
    for (let dy = -8; dy <= 8 && inland < 0; dy++) {
      for (let dx = -8; dx <= 8; dx++) {
        if (dx * dx + dy * dy > 64) continue;
        const cc = (y + dy) * W + (x + dx);
        if (gp.map.terrain[cc] === 1 && gp.isCoastal(cc)) { inland = c; break; }
      }
    }
    if (inland >= 0) break;
  }
  ok('Binnenzelle nahe der Küste gefunden', inland >= 0);
  // Umgebung dem Spieler zuschlagen, damit dort gebaut werden darf
  const ix = inland % W, iy = (inland / W) | 0;
  for (let dy = -8; dy <= 8; dy++) {
    for (let dx = -8; dx <= 8; dx++) {
      const cc = (iy + dy) * W + (ix + dx);
      if (cc >= 0 && cc < gp.owner.length && gp.map.terrain[cc] === 1) gp.setOwner(cc, 0);
    }
  }
  gp.players[0].money = 10000;
  const snapped = gp.resolveBuildCell(0, inland, 'port');
  ok('Hafen-Klick im Binnenland snappt zur Küste',
    snapped !== inland && gp.isCoastal(snapped) && gp.owner[snapped] === 0);
  gp.applyIntent({ p: 0, type: 'build', kind: 'port', cell: inland });
  ok('Hafen wurde an der gesnappten Küstenzelle gebaut',
    gp.buildings.some(b => b.kind === 'port' && b.owner === 0 && b.cell === snapped));
  ok('Andere Gebäude snappen nicht', gp.resolveBuildCell(0, inland, 'city') === inland);
}

// ---- Spiel 12c: Kämpfende Truppen zählen zur Kapazität + Rückzug ----
{
  const ga = newGame(31);
  while (ga.phase === 'spawn') ga.turn([]);
  const p = ga.players[0];
  const max = ga.maxTroopsOf(p);

  // Gleicher Gesamt-Füllstand -> gleiches Wachstum, egal ob die Truppen
  // daheim stehen oder im Angriff kämpfen
  p.troops = max * 0.5;
  const gHome = ga.troopGrowthOf(p);
  p.troops = max * 0.1;
  const fake = { attacker: 0, target: -1, pool: max * 0.4, frontier: new Set(), cd: 1e9, stall: 0 };
  ga.attacks.push(fake);
  const gOut = ga.troopGrowthOf(p);
  ok('Kämpfende Truppen zählen zum Füllstand', Math.abs(gHome - gOut) < 1e-9,
    `daheim ${gHome.toFixed(2)} vs. draußen ${gOut.toFixed(2)} pro Tick`);

  // Belegen die Angriffe die restliche Kapazität, wächst nichts nach
  fake.pool = max * 0.9;
  p.troops = max * 0.1;
  ga.economy();
  ok('Kein Nachwachsen, wenn Angriffe die Kapazität belegen',
    Math.abs(p.troops - max * 0.1) < 1e-6, `Truppen ${Math.round(p.troops)} bei Limit ${max}`);

  // Rückzug: Truppen kehren sofort zurück, der Angriff verschwindet
  const before = p.troops;
  ga.applyIntent({ p: 0, type: 'retreat', target: -1 });
  ok('Rückzug bringt die restlichen Truppen sofort zurück',
    Math.abs(p.troops - (before + max * 0.9)) < 1e-6 && fake.pool === 0);
  ga.turn([]);
  ok('Abgebrochener Angriff verschwindet', !ga.attacks.includes(fake));
}

// ---- Spiel 12d: Masse-Bots vs. Nationen ----
{
  const gn = new Game({
    seed: 99, mapSize: 'klein', mapType: 'random',
    players: [
      { name: 'Mensch', bot: false },
      { name: NATION_NAMES[0], bot: true, level: 2 },   // Nation (stark)
      { name: 'Bot 1', bot: true, level: WEAK_BOT_LEVEL }, // Masse-Bot (schwach)
    ],
  });
  const [hum, nat, weak] = gn.players;
  ok('Masse-Bot-Profil existiert und ist passiv',
    WEAK_BOT_LEVEL === 3 && !BOT_LEVELS[3].city && !BOT_LEVELS[3].fort && BOT_LEVELS[3].threshold >= 2);
  ok('Masse-Bot behält sein Profil (kein Clamp auf 2)', weak.botLevel === WEAK_BOT_LEVEL);
  ok('Mensch und Nation bekommen Palettenfarben',
    PLAYER_COLORS.includes(hum.color) && PLAYER_COLORS.includes(nat.color));
  ok('Masse-Bot bekommt eine gedeckte eigene Farbe',
    !PLAYER_COLORS.includes(weak.color) && /^#[0-9a-f]{6}$/.test(weak.color), weak.color);
  ok('Nation startet größer als der Masse-Bot', nat.territory > weak.territory,
    `Nation ${nat.territory} / Mensch ${hum.territory} / Bot ${weak.territory} Zellen`);

  // Viele Bots: Spiel mit 3 Nationen + 20 Masse-Bots läuft stabil, die
  // Masse-Bots expandieren ins Neutrale (wenn auch langsam)
  const players = [{ name: 'Mensch', bot: false }];
  for (let i = 0; i < 3; i++) players.push({ name: NATION_NAMES[i], bot: true, level: 2 });
  for (let i = 0; i < 20; i++) players.push({ name: `Bot ${i + 1}`, bot: true, level: WEAK_BOT_LEVEL });
  const gm = new Game({ seed: 4242, mapSize: 'mittel', mapType: 'random', players });
  while (gm.phase === 'spawn') gm.turn([]);
  const t0 = Date.now();
  for (let i = 0; i < 600; i++) gm.turn([]);
  const ms = Date.now() - t0;
  const weakTerr = gm.players.filter(p => p.botLevel === WEAK_BOT_LEVEL && p.alive)
    .reduce((s, p) => s + p.territory, 0);
  ok('24-Bot-Spiel läuft (600 Ticks)', true, `${ms}ms (${(ms / 600).toFixed(1)}ms/Tick)`);
  ok('Masse-Bots expandieren ins Neutrale', weakTerr > 20 * 30, `${weakTerr} Zellen gesamt`);
}

// ---- Spiel 12e: Wunschfarben ----
{
  const mk = players => new Game({ seed: 7, mapSize: 'klein', mapType: 'random', players });
  // Wunschfarbe wird übernommen; die Automatik überspringt sie
  const g1 = mk([
    { name: 'A', bot: false, color: PLAYER_COLORS[0] },   // wünscht die 1. Palettenfarbe
    { name: 'B', bot: false },                            // Automatik
    { name: 'N', bot: true, level: 2 },                   // Nation, Automatik
  ]);
  ok('Wunschfarbe wird übernommen', g1.players[0].color === PLAYER_COLORS[0]);
  ok('Automatik überspringt vergebene Farben',
    g1.players[1].color === PLAYER_COLORS[1] && g1.players[2].color === PLAYER_COLORS[2]);
  // Bei doppeltem Wunsch behält ihn der Erste
  const g2 = mk([
    { name: 'A', bot: false, color: '#4361ee' },
    { name: 'B', bot: false, color: '#4361ee' },
  ]);
  ok('Doppelter Wunsch: der Erste behält die Farbe',
    g2.players[0].color === '#4361ee' && g2.players[1].color !== '#4361ee');
  // Ungültige Wünsche fallen auf die Automatik zurück; nie zwei gleiche Farben
  const g3 = mk([
    { name: 'A', bot: false, color: 'rot' },
    { name: 'B', bot: false, color: PLAYER_COLORS[5] },
    { name: 'N1', bot: true, level: 2 },
    { name: 'N2', bot: true, level: 1 },
    { name: 'Bot', bot: true, level: WEAK_BOT_LEVEL },
  ]);
  const colors = g3.players.map(p => p.color);
  ok('Ungültiger Wunsch -> Automatik', /^#[0-9a-f]{6}$/.test(colors[0]));
  ok('Keine zwei Spieler teilen sich eine Farbe', new Set(colors).size === colors.length,
    colors.join(' '));
}

// ---- Spiel 12f: Aufbauzeit (5s) für Gebäude ----
{
  const gb = newGame(61);
  while (gb.phase === 'spawn') gb.turn([]);
  const p = gb.players[0];
  p.money = 100000;
  const own = gb.landCells.find(c => gb.owner[c] === 0);
  // Stadt: zählt sofort für den Preis, aber erst nach 5s zur Kapazität
  const bonusOf = () => gb.maxTroopsOf(p) - p.territory * 3 - 1000;
  gb.applyIntent({ p: 0, type: 'build', kind: 'city', cell: own });
  ok('Stadt im Aufbau: noch keine Kapazität', p.cities === 1 && bonusOf() === 0,
    `Bonus ${bonusOf()}`);
  const cityB = gb.buildingAt.get(own);
  ok('Frisch gebaut = im Aufbau', gb.underConstruction(cityB));
  for (let i = 0; i < 50; i++) gb.turn([]);
  ok('Nach 5s: Stadt voll wirksam', !gb.underConstruction(cityB) && bonusOf() === 25000,
    `Bonus ${bonusOf()}`);

  // Festung: schützt erst nach der Aufbauzeit. Bauplatz weit genug weg von
  // der Stadt liegt evtl. außerhalb des Startgebiets -> Zelle direkt zuweisen.
  let fortCell = -1;
  for (const c of gb.landCells) {
    if (gb.dist2(c, own) > 400) { fortCell = c; break; }
  }
  gb.setOwner(fortCell, 0);
  ok('Festungs-Bauplatz gefunden', gb.canBuildAt(0, fortCell, 'fort') === null);
  gb.applyIntent({ p: 0, type: 'build', kind: 'fort', cell: fortCell });
  ok('Festung im Aufbau schützt nicht', gb.fortBonus(fortCell, 0) === 1);
  for (let i = 0; i < 50; i++) gb.turn([]);
  ok('Festung nach 5s: 8x Verteidigung', gb.fortBonus(fortCell, 0) === 8);
}

// ---- Spiel 12g: Vergeltung – Angriffe bleiben nicht ungestraft ----
{
  const gv = newGame(71);
  while (gv.phase === 'spawn') gv.turn([]);
  const W = gv.map.w;
  const at = (x, y) => y * W + x;
  // 20x6-Landstreifen suchen: links Mensch (0), rechts Bot (1) – direkte Grenze
  let base = -1;
  for (const c of gv.landCells) {
    const x = c % W, y = (c / W) | 0;
    if (x < 20 || y < 20 || x >= W - 40 || y >= gv.map.h - 20) continue;
    let frei = true;
    for (let dx = 0; dx < 20 && frei; dx++) {
      for (let dy = 0; dy < 6; dy++) {
        if (gv.map.terrain[at(x + dx, y + dy)] !== 1) { frei = false; break; }
      }
    }
    if (frei) { base = c; break; }
  }
  ok('Landstreifen für Vergeltungs-Test gefunden', base >= 0);
  const bx = base % W, by = (base / W) | 0;
  for (let dx = 0; dx < 10; dx++) for (let dy = 0; dy < 6; dy++) gv.setOwner(at(bx + dx, by + dy), 0);
  for (let dx = 10; dx < 20; dx++) for (let dy = 0; dy < 6; dy++) gv.setOwner(at(bx + dx, by + dy), 1);

  const bot = gv.players[1];
  gv.players[0].troops = 8000;   // Angreifer ist deutlich stärker …
  bot.troops = 5000;             // … Bot schlägt trotzdem zurück (0.8-Schwelle)
  gv.turn([{ p: 0, type: 'attack', target: 1, ratio: 0.3 }]);
  for (let i = 0; i < 6; i++) gv.turn([]); // erster Vorstoß der Front
  ok('Verteidiger merkt sich den Angreifer', bot.lastAggressor === 0 && bot.grudgeUntil > gv.turnNo,
    `lastAggressor ${bot.lastAggressor}`);

  // Hit-and-Run: Der Angreifer zieht sich zurück – der Groll bleibt trotzdem,
  // und der Bot schlägt zurück, obwohl der Angreifer nicht schwächer ist.
  gv.turn([{ p: 0, type: 'retreat', target: 1 }]);
  gv.players[0].troops = 5500;
  bot.troops = 5000; // 5000 > 5500 * 0.8 -> Vergeltungsschwelle erreicht
  let strikesBack = false;
  for (let i = 0; i < 60 && !strikesBack; i++) {
    gv.turn([]);
    strikesBack = gv.attacks.some(a => a.attacker === 1 && a.target === 0 && a.pool > 0);
  }
  ok('Bot schlägt zurück (Vergeltung)', strikesBack);

  // Der Angreifer bekommt vom Bot keine Allianz, solange der Groll hält
  gv.allyRequests.add('0:1');
  for (let i = 0; i < 30; i++) gv.turn([]);
  ok('Allianz-Anfrage des Angreifers wird abgelehnt',
    !gv.isAllied(0, 1) && !gv.allyRequests.has('0:1'));
}

// ---- Spiel 12h: Ereignis-Feed & Verräter ----
{
  const gf = newGame(81);
  while (gf.phase === 'spawn') gf.turn([]);

  // Neuer Angriff erzeugt ein Feed-Event (im selben Tick sichtbar)
  gf.turn([{ p: 0, type: 'attack', target: 1, ratio: 0.2 }]);
  ok('Feed: neuer Angriff gemeldet', gf.feedEvents.some(e => e.t === 'atk' && e.p === 1 && e.by === 0));

  // Eliminierung meldet Opfer UND Verursacher
  gf.feedEvents.length = 0;
  gf.eliminate(gf.players[2], 0);
  ok('Feed: Eliminierung mit Verursacher', gf.feedEvents.some(e => e.t === 'elim' && e.p === 2 && e.by === 0));

  // Allianzbruch: Brecher wird als Verräter markiert und gemeldet
  gf.alliances.add(gf.allianceKey(0, 1));
  gf.feedEvents.length = 0;
  gf.applyIntent({ p: 0, type: 'unally', target: 1 });
  ok('Verräter: Allianzbrecher markiert', gf.isTraitor(0) && !gf.isTraitor(1));
  ok('Feed: Allianzbruch gemeldet', gf.feedEvents.some(e => e.t === 'unally' && e.a === 0 && e.b === 1));

  // Bots verweigern Verrätern die Allianz, solange die Markierung hält
  gf.allyRequests.add('0:1');
  for (let i = 0; i < 30; i++) gf.turn([]);
  ok('Bot lehnt Verräter-Anfrage ab', !gf.isAllied(0, 1) && !gf.allyRequests.has('0:1'));

  // Ohne bestehende Allianz macht 'unally' NICHT zum Verräter
  const gn2 = newGame(82);
  while (gn2.phase === 'spawn') gn2.turn([]);
  gn2.applyIntent({ p: 0, type: 'unally', target: 1 });
  ok('Kein Verrat ohne bestehende Allianz', !gn2.isTraitor(0));
}

// ---- Spiel 13: Kennwerte aus der Referenz (Bevölkerung, Stadt, Festung) ----
{
  const gc = newGame(7);
  while (gc.phase === 'spawn') gc.turn([]);
  const p = gc.players[0];
  p.cities = 0; p.territory = 1000;
  const base = gc.maxTroopsOf(p);
  p.territory = 1001;
  ok('Ein Feld trägt 3 Bevölkerung', gc.maxTroopsOf(p) - base === 3,
    `+${gc.maxTroopsOf(p) - base} pro Feld`);
  p.territory = 1000; p.cities = 1;
  ok('Eine Stadt trägt +25.000 Bevölkerung', gc.maxTroopsOf(p) - base === 25000,
    `+${gc.maxTroopsOf(p) - base} pro Stadt`);

  // Festung: 8x im Radius 30, kein Stapeln, außerhalb wirkungslos
  const W = gc.map.w;
  const home = gc.landCells.find(c => gc.owner[c] === 0);
  const hx = home % W, hy = (home / W) | 0;
  const put = (kind, dx, dy) => {
    const cell = (hy + dy) * W + (hx + dx);
    const b = { owner: 0, kind, cell };
    gc.buildings.push(b); gc.buildingAt.set(cell, b);
    return cell;
  };
  const f1 = put('fort', 0, 0);
  ok('Festung: 8x Verteidigung am Standort', gc.fortBonus(f1, 0) === 8);
  ok('Festung wirkt im Radius 30', gc.fortBonus(f1 + 29, 0) === 8);
  ok('Festung wirkt nicht mehr bei 31', gc.fortBonus(f1 + 31, 0) === 1);
  put('fort', 10, 0); // zweite Festung, Radien überlappen
  ok('Mehrere Festungen stapeln nicht', gc.fortBonus(f1 + 5, 0) === 8,
    `Bonus bei zwei überlappenden Festungen: ${gc.fortBonus(f1 + 5, 0)}x`);
}

// ---- Spiel 14: Kriegsschiff-Wegpunkte (warship_move) ----
{
  const gw = newGame(91);
  while (gw.phase === 'spawn') gw.turn([]);

  // Kriegsschiff direkt aufs Wasser setzen (wie nach dem Stapellauf)
  const water = [];
  for (let c = 0; c < gw.map.terrain.length; c++) if (gw.map.terrain[c] === 0) water.push(c);
  const start = water[0];
  gw.warships.push({ id: gw.warshipSeq++, owner: 0, home: start, cell: start, path: [], pi: 0, dmg: 0, born: gw.turnNo, cd: 12, order: -1 });
  const ws = gw.warships[0];

  // Erreichbares, entferntes Wasserziel suchen
  let target = -1;
  for (const c of water) {
    if (gw.dist2(c, start) >= 400 && gw.bfsWater([start], q => q === c)) { target = c; break; }
  }
  ok('Wasser-Wegpunkt gefunden', target >= 0);

  // Fremder Spieler darf das Schiff nicht steuern
  gw.applyIntent({ p: 1, type: 'warship_move', ship: ws.id, cell: target });
  ok('Fremdes Kriegsschiff nicht steuerbar', ws.order === -1);

  // Landziel wird ignoriert
  gw.applyIntent({ p: 0, type: 'warship_move', ship: ws.id, cell: gw.landCells[0] });
  ok('Landziel wird ignoriert', ws.order === -1);

  // Gültiger Befehl: Wegpunkt gesetzt, Schiff fährt hin, Befehl erlischt
  gw.applyIntent({ p: 0, type: 'warship_move', ship: ws.id, cell: target });
  ok('Wegpunkt gesetzt', ws.order === target && ws.path.length > 0);
  let arrived = false;
  for (let i = 0; i < 600 && !arrived; i++) {
    gw.turn([]);
    arrived = gw.dist2(ws.cell, target) <= 2;
  }
  ok('Kriegsschiff erreicht den Wegpunkt', arrived, `Distanz² am Ende: ${gw.dist2(ws.cell, target)}`);
  for (let i = 0; i < 30; i++) gw.turn([]);
  ok('Befehl nach Ankunft erledigt (zurück zur Patrouille)', ws.order === -1);
}

// ---- Spiel 15: warship_move trifft das richtige Schiff (Bug-Fix 0.16.1) ----
// Zwei Schiffe desselben Spielers: ein Befehl für das ZWEITE darf nur dessen
// Kurs setzen – das erste bleibt unverändert (früher landete der Befehl durch
// das verschluckte id-Feld immer bei Schiff 0).
{
  const gw = newGame(92);
  while (gw.phase === 'spawn') gw.turn([]);

  const water = [];
  for (let c = 0; c < gw.map.terrain.length; c++) if (gw.map.terrain[c] === 0) water.push(c);
  const start = water[0];
  gw.warships.push({ id: gw.warshipSeq++, owner: 0, home: start, cell: start, path: [], pi: 0, dmg: 0, born: gw.turnNo, cd: 12, order: -1 });
  gw.warships.push({ id: gw.warshipSeq++, owner: 0, home: start, cell: start, path: [], pi: 0, dmg: 0, born: gw.turnNo, cd: 12, order: -1 });
  const [w1, w2] = gw.warships;
  ok('Schiffe haben verschiedene IDs', w1.id !== w2.id);

  // Erreichbares, entferntes Wasserziel suchen
  let target = -1;
  for (const c of water) {
    if (gw.dist2(c, start) >= 400 && gw.bfsWater([start], q => q === c)) { target = c; break; }
  }
  ok('Wasser-Wegpunkt gefunden (2 Schiffe)', target >= 0);

  gw.applyIntent({ p: 0, type: 'warship_move', ship: w2.id, cell: target });
  ok('Befehl setzt Kurs NUR beim zweiten Schiff', w2.order === target && w2.path.length > 0);
  ok('Erstes Schiff bleibt ohne Befehl', w1.order === -1);
}

// ---- Spiel 16: Ruinen (zerstörte Festungen) ----
{
  const gr = newGame(101);
  while (gr.phase === 'spawn') gr.turn([]);
  const W = gr.map.w;
  const home = gr.landCells.find(c => gr.owner[c] === 0);
  // Festung direkt platzieren (ohne Preis/Aufbauzeit)
  const b = { owner: 0, kind: 'fort', cell: home, hp: 3 };
  gr.buildings.push(b); gr.buildingAt.set(home, b);
  gr.players[0].forts = 1;
  ok('Ruine: zu Beginn keine vorhanden', gr.ruins.length === 0);
  // Zelle wird von Spieler 1 erobert -> Festung fällt in Trümmer
  gr.setOwner(home, 1);
  ok('Eroberte Festung wird zerstört, nicht übernommen',
    !gr.buildingAt.has(home) && gr.players[0].forts === 0 && gr.players[1].forts === 0);
  ok('Ruine liegt auf der Festungszelle', gr.ruins.some(r => r.cell === home));
  ok('Feed meldet die Zerstörung', gr.feedEvents.some(e => e.t === 'fort' && e.p === 0 && e.by === 1));
  ok('Trümmer-Malus wirkt am Standort', gr.ruinMult(home) === 2);
  // Zellen in 8 bzw. 12 Zellen Abstand (Richtung mit Platz wählen)
  const hx = home % W, hy = (home / W) | 0;
  const d8 = hx + 8 < W ? 8 : -8, d12 = hx + 12 < W ? 12 : -12;
  ok('Trümmer-Malus wirkt im Radius 10', gr.ruinMult(hy * W + hx + d8) === 2);
  ok('Trümmer-Malus endet außerhalb', gr.ruinMult(hy * W + hx + d12) === 1);
  // Neubau auf der Zelle räumt die Ruine ab
  gr.setOwner(home, 0);
  gr.players[0].money = 10000;
  gr.applyIntent({ p: 0, type: 'build', kind: 'city', cell: home });
  ok('Neubau räumt die Ruine ab', gr.ruins.length === 0 && gr.buildingAt.get(home).kind === 'city');
}

// ---- Spiel 17: Katapult (Bau, Wegpunkt, Beschuss) ----
{
  const gk = newGame(103);
  while (gk.phase === 'spawn') gk.turn([]);
  const p = gk.players[0];
  // Bots ruhigstellen (kein Gebiet, keine Truppen -> keine Störung des Tests)
  gk.clearPlayerCells(1); gk.clearPlayerCells(2);
  gk.players[1].troops = 0; gk.players[2].troops = 0;

  // Fabrik direkt platzieren (ohne built-Zeitstempel = sofort nutzbar)
  const home = gk.landCells.find(c => gk.owner[c] === 0);
  const fac = { owner: 0, kind: 'factory', cell: home };
  gk.buildings.push(fac); gk.buildingAt.set(home, fac);
  p.factories = 1;

  p.money = 1000;
  gk.applyIntent({ p: 0, type: 'catapult', cell: home });
  ok('Katapult gebaut (500 €)', gk.catapults.length === 1 && p.money <= 500);
  const cp = gk.catapults[0];
  ok('Katapult startet an der Fabrik', cp.cell === home);
  gk.applyIntent({ p: 0, type: 'catapult', cell: home });
  ok('Zweites Katapult erlaubt (Limit 2/Fabrik)', gk.catapults.length === 2);
  gk.applyIntent({ p: 0, type: 'catapult', cell: home });
  ok('Drittes Katapult über dem Limit abgelehnt', gk.catapults.length === 2);
  const m0 = p.money;
  p.money = 0;
  gk.applyIntent({ p: 0, type: 'catapult', cell: home });
  ok('Katapult ohne Geld abgelehnt', gk.catapults.length === 2 && p.money === 0);
  p.money = m0;

  // Fremder Spieler darf es nicht steuern
  gk.applyIntent({ p: 1, type: 'catapult_move', ship: cp.id, cell: home });
  ok('Fremdes Katapult nicht steuerbar', cp.order === -1);

  // Erreichbares, entferntes Landziel suchen
  let target = -1;
  for (const c of gk.landCells) {
    if (gk.dist2(c, home) >= 100 && gk.bfsLand([home], q => q === c)) { target = c; break; }
  }
  ok('Land-Wegpunkt gefunden', target >= 0);
  gk.applyIntent({ p: 0, type: 'catapult_move', ship: cp.id, cell: target });
  ok('Wegpunkt gesetzt', cp.order === target && cp.path.length > 0);
  let arrived = false;
  for (let i = 0; i < 800 && !arrived; i++) {
    gk.turn([]);
    arrived = gk.dist2(cp.cell, target) <= 2;
  }
  ok('Katapult erreicht den Wegpunkt', arrived, `Distanz² am Ende: ${gk.dist2(cp.cell, target)}`);

  // Beschuss: feindliche Festung in Schussweite (≤ 8) platzieren
  const fcell = gk.landCells.find(c => c !== cp.cell && gk.dist2(c, cp.cell) <= 36);
  ok('Festungsziel in Schussweite gefunden', fcell !== undefined);
  const fort = { owner: 1, kind: 'fort', cell: fcell, hp: 3 };
  gk.buildings.push(fort); gk.buildingAt.set(fcell, fort);
  gk.players[1].forts = 1;
  for (let i = 0; i < 60 && gk.buildingAt.get(fcell) === fort; i++) gk.turn([]);
  ok('Katapult zerstört Festung nach 3 Treffern', !gk.buildingAt.has(fcell) && gk.players[1].forts === 0);
  ok('Zerschossene Festung hinterlässt eine Ruine', gk.ruins.some(r => r.cell === fcell));
}

// ---- Spiel 6: Türme ----
{
  const gt = newGame(7);
  while (gt.phase === 'spawn') gt.turn([]);
  let myCell = -1;
  for (let c = 0; c < gt.owner.length; c++) if (gt.owner[c] === 0) { myCell = c; break; }
  gt.players[0].money = 5000;
  gt.players[1].money = 5000;

  gt.turn([{ p: 0, type: 'build', kind: 'tower', cell: myCell }]);
  ok('Turm gebaut', gt.players[0].towers === 1 && gt.buildingAt.get(myCell)?.kind === 'tower');
  ok('Turm kostet ' + BUILD_COSTS.tower + ' €',
    Math.abs((5000 - BUILD_COSTS.tower) - gt.players[0].money) < 5);
  for (let i = 0; i < 55; i++) gt.turn([]);

  // Irgendein Landfeld eines anderen Spielers als Ziel – die Reichweite ist
  // global, es muss also NICHT mehr in der Nähe des Turms liegen.
  let enemyCell = -1;
  for (let c = 0; c < gt.owner.length; c++) {
    if (c !== myCell && gt.map.terrain[c] === 1) { enemyCell = c; break; }
  }
  ok('Landfeld für Turm-Ziel gefunden', enemyCell >= 0);
  gt.setOwner(enemyCell, 1);

  gt.turn([{ p: 1, type: 'build', kind: 'fort', cell: enemyCell }]);
  for (let i = 0; i < 55; i++) gt.turn([]);
  const tfort = gt.buildingAt.get(enemyCell);
  ok('Gegnerische Festung steht', !!tfort && tfort.kind === 'fort');

  const hpBefore = tfort.hp;
  const moneyBefore = gt.players[0].money;
  // Direkt über applyIntent (statt turn()), damit der Truppenvergleich nicht
  // durch das gleichzeitige Truppenwachstum (economy()) verfälscht wird.
  const troopsBefore = gt.players[1].troops;
  gt.applyIntent({ p: 0, type: 'tower_shoot', cell: myCell, ammo: 'stone', target: enemyCell });
  ok('Stein trifft auch ein weit entferntes Ziel (globale Reichweite)',
    tfort.hp === hpBefore - 1, `hp ${hpBefore} -> ${tfort.hp}`);
  ok('Stein-Schuss kostet ' + TOWER_AMMO.stone.cost + ' €',
    Math.abs((moneyBefore - TOWER_AMMO.stone.cost) - gt.players[0].money) < 1);
  ok('Stein-Schuss kostet den Gegner auch Truppen (nicht nur das Gebäude)',
    gt.players[1].troops === troopsBefore - TOWER_AMMO.stone.troopDmg);
  ok('Turm hat jetzt ~40s Cooldown', gt.buildingAt.get(myCell).cd === TOWER_AMMO.stone.reload,
    'cd=' + gt.buildingAt.get(myCell).cd);

  // Zweiter Schuss während des Cooldowns wird ignoriert (cd zaehlt nur
  // weiter herunter, springt nicht auf den vollen Reload-Wert zurueck)
  const cdBefore = gt.buildingAt.get(myCell).cd;
  gt.turn([{ p: 0, type: 'tower_shoot', cell: myCell, ammo: 'stone', target: enemyCell }]);
  ok('Zweiter Schuss während Cooldown wird ignoriert', gt.buildingAt.get(myCell).cd === cdBefore - 1);

  // Stein/Pfeil auf leeres Gegnerland ohne Gebäude: vorher passierte hier
  // gar nichts (der eigentlich gemeldete Bug "Turm schießt nicht"), jetzt
  // kostet der Treffer trotzdem Truppen.
  let emptyEnemyCell = -1;
  for (let c = 0; c < gt.owner.length; c++) {
    if (c !== enemyCell && gt.map.terrain[c] === 1 && !gt.buildingAt.has(c)) { emptyEnemyCell = c; break; }
  }
  gt.setOwner(emptyEnemyCell, 1);
  gt.buildingAt.get(myCell).cd = 0; // Cooldown für den Test überspringen
  const troopsBefore2 = gt.players[1].troops;
  gt.applyIntent({ p: 0, type: 'tower_shoot', cell: myCell, ammo: 'arrow', target: emptyEnemyCell });
  ok('Pfeil trifft auch leeres Gegnerland (ohne Gebäude)',
    gt.players[1].troops === troopsBefore2 - TOWER_AMMO.arrow.troopDmg);

  // Feuerpfeil auf ein drittes, ebenfalls beliebig weit entferntes Gegnerfeld
  let fireCell = -1;
  for (let c = 0; c < gt.owner.length; c++) {
    if (c !== enemyCell && c !== emptyEnemyCell && gt.map.terrain[c] === 1) { fireCell = c; break; }
  }
  gt.setOwner(fireCell, 1);
  gt.buildingAt.get(myCell).cd = 0;
  gt.applyIntent({ p: 0, type: 'tower_shoot', cell: myCell, ammo: 'fire', target: fireCell });
  ok('Feuerpfeil macht gegnerisches Land neutral', gt.owner[fireCell] === -1);
  ok('Feuerpfeil hinterlässt ein Trümmerfeld (Ruine)', gt.ruins.some(r => r.cell === fireCell));
  ok('Trümmerfeld verdoppelt die Rückeroberungskosten', gt.ruinMult(fireCell) === 2,
    'ruinMult=' + gt.ruinMult(fireCell));

  // Eigenes Land bleibt beim Feuerpfeil verschont
  gt.buildingAt.get(myCell).cd = 0;
  const ownBefore = gt.owner[myCell];
  gt.applyIntent({ p: 0, type: 'tower_shoot', cell: myCell, ammo: 'fire', target: myCell });
  ok('Feuerpfeil verschont eigenes Land', gt.owner[myCell] === ownBefore);
}

// ---- Spiel 18: Turm – Besitzprüfung & Feuerpfeil-Eliminierung ----
{
  const gz = newGame(11);
  while (gz.phase === 'spawn') gz.turn([]);
  const myCell = gz.landCells.find(c => gz.owner[c] === 0);
  // Turm direkt platzieren (ohne built-Zeitstempel = sofort nutzbar)
  const tw = { owner: 0, kind: 'tower', cell: myCell, cd: 0 };
  gz.buildings.push(tw); gz.buildingAt.set(myCell, tw);
  gz.players[0].towers = 1;
  gz.players[0].money = 1000;

  // Fremder Spieler darf den Turm nicht abfeuern (weder Cooldown noch Geld
  // dürfen sich ändern)
  gz.players[1].money = 500;
  gz.applyIntent({ p: 1, type: 'tower_shoot', cell: myCell, ammo: 'stone', target: myCell });
  ok('Fremder Turm nicht abfeuerbar', tw.cd === 0 && gz.players[1].money === 500);

  // Feuerpfeil, der das letzte Gebiet eines Spielers verbrennt, eliminiert
  // ihn – wie bei Land-/Bootsangriffen (vorher blieb ein "Geister"-Spieler
  // ohne Gebiet am Leben und blockierte die Siegbedingung).
  gz.clearPlayerCells(1);
  const lone = gz.landCells.find(c => gz.owner[c] === -1 && gz.dist2(c, myCell) > 200);
  ok('Freie Zelle für den Brand-Test gefunden', lone !== undefined);
  gz.setOwner(lone, 1);
  ok('Gegner hält nur noch eine Zelle', gz.players[1].territory === 1 && gz.players[1].alive);
  gz.applyIntent({ p: 0, type: 'tower_shoot', cell: myCell, ammo: 'fire', target: lone });
  ok('Feuerpfeil verbrennt die letzte Zelle', gz.owner[lone] === -1);
  ok('Feuerpfeil eliminiert den Spieler ohne Restgebiet', gz.players[1].alive === false);
  ok('Eliminierung landet im Ereignis-Feed',
    gz.feedEvents.some(e => e.t === 'elim' && e.p === 1 && e.by === 0));
}

// ---- Spiel 19: Geländetypen (Grünfläche/Hügel/Gebirge) ----
{
  const gt = newGame(777);
  // Anteile auf der Karte (adaptiv-Quantile in mapgen: ~55/30/15)
  const cnt = [0, 0, 0];
  let mismatch = 0;
  for (let c = 0; c < gt.map.terrain.length; c++) {
    if (gt.map.terrain[c] !== 1) continue;
    const lt = gt.map.landType[c];
    cnt[lt]++;
    if (gt.terrainMult(c) !== TERRAIN_COST[lt]) mismatch++;
  }
  const total = cnt[0] + cnt[1] + cnt[2];
  ok('Alle drei Geländetypen auf der Karte', cnt[0] > 0 && cnt[1] > 0 && cnt[2] > 0);
  ok('Gelände-Anteile ~55/30/15',
    Math.abs(cnt[0] / total - 0.55) < 0.04 && Math.abs(cnt[1] / total - 0.30) < 0.04 &&
    Math.abs(cnt[2] / total - 0.15) < 0.04,
    cnt.map(k => Math.round(100 * k / total) + '%').join('/'));
  ok('terrainMult spiegelt TERRAIN_COST je Zelle', mismatch === 0);

  // Verhalten: identische Karte, einmal alles Grünfläche, einmal alles
  // Gebirge – die Expansion muss im Gebirge deutlich langsamer laufen.
  const gFlat = newGame(5150), gRock = newGame(5150);
  for (const gg of [gFlat, gRock]) {
    while (gg.phase === 'spawn') gg.turn([]);
    // Bots ruhigstellen, damit nur die eigene Expansion zählt
    gg.clearPlayerCells(1); gg.clearPlayerCells(2);
    gg.players[1].troops = 0; gg.players[2].troops = 0;
    gg.turn([{ p: 0, type: 'attack', target: -1, ratio: 0.5 }]);
  }
  gFlat.map.landType.fill(0);
  gRock.map.landType.fill(2);
  for (let i = 0; i < 60; i++) { gFlat.turn([]); gRock.turn([]); }
  ok('Gebirge bremst die Expansion deutlich',
    gFlat.players[0].territory > gRock.players[0].territory * 1.5,
    `Grün ${gFlat.players[0].territory} vs Gebirge ${gRock.players[0].territory} Zellen`);
}

console.log(results.join('\n'));
const fails = results.filter(r => r.startsWith('FAIL')).length;
console.log(`\n${results.length - fails}/${results.length} Tests bestanden`);
process.exit(fails ? 1 : 0);
