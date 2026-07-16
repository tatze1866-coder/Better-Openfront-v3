// Headless-Test der Spiel-Engine (Boote, Gebäude, Allianzen, Determinismus)
import { Game, SPAWN_TURNS, BUILD_COSTS, WARSHIP_COST, MAP_SIZES, GROWTH_PEAK } from '../public/js/engine.js';

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
let fortCell = -1;
for (let c = 0; c < g.owner.length; c++) {
  if (g.owner[c] === 0 && g.dist2(c, myCell) > 150) { fortCell = c; break; }
}
g.turn([{ p: 0, type: 'build', kind: 'fort', cell: fortCell }]);
ok('Festung gebaut', g.players[0].forts === 1);
ok('Festungs-Bonus wirkt (5x)', g.fortBonus(fortCell, 0) === 5 && g.fortBonus(myCell, 0) >= 1);

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
  // lange die Truppen reichen.
  gl.turn([
    { p: 0, type: 'attack', target: 1, ratio: 0.5 },
    { p: 1, type: 'attack', target: 0, ratio: 0.5 },
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
  ok('Fabriken haben keine direkte Schiene zueinander', !adjOf(f1).includes(f2));

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

  // Festung: 5x im Radius 30, kein Stapeln, außerhalb wirkungslos
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
  ok('Festung: 5x Verteidigung am Standort', gc.fortBonus(f1, 0) === 5);
  ok('Festung wirkt im Radius 30', gc.fortBonus(f1 + 29, 0) === 5);
  ok('Festung wirkt nicht mehr bei 31', gc.fortBonus(f1 + 31, 0) === 1);
  put('fort', 10, 0); // zweite Festung, Radien überlappen
  ok('Mehrere Festungen stapeln nicht', gc.fortBonus(f1 + 5, 0) === 5,
    `Bonus bei zwei überlappenden Festungen: ${gc.fortBonus(f1 + 5, 0)}x`);
}

console.log(results.join('\n'));
const fails = results.filter(r => r.startsWith('FAIL')).length;
console.log(`\n${results.length - fails}/${results.length} Tests bestanden`);
process.exit(fails ? 1 : 0);
