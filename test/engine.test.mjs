// Headless-Test der Spiel-Engine (Boote, Gebäude, Allianzen, Determinismus)
import { Game, SPAWN_TURNS, CITY_COST, FORT_COST } from '../public/js/engine.js';

const results = [];
const ok = (name, cond, extra = '') => {
  results.push(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  (' + extra + ')' : ''}`);
};

function newGame(seed) {
  return new Game({
    seed,
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

// Stadt bauen
const t0 = g.players[0].troops;
g.turn([{ p: 0, type: 'build', kind: 'city', cell: myCell }]);
ok('Stadt gebaut', g.players[0].cities === 1 && g.buildingAt.has(myCell));
ok('Stadt kostet ' + CITY_COST, Math.abs((t0 - CITY_COST) - g.players[0].troops) < 20,
  'vorher ' + Math.floor(t0) + ', nachher ' + Math.floor(g.players[0].troops));

// Festung zu nah an der Stadt -> abgelehnt
g.turn([{ p: 0, type: 'build', kind: 'fort', cell: myCell + 2 }]);
ok('Bauen zu nah an Gebäude abgelehnt', g.players[0].forts === 0);

// Truppen ansparen, dann Festung mit Abstand -> ok
for (let i = 0; i < 3000 && g.players[0].troops < 500; i++) g.turn([]);
let fortCell = -1;
for (let c = 0; c < g.owner.length; c++) {
  if (g.owner[c] === 0 && g.dist2(c, myCell) > 150) { fortCell = c; break; }
}
g.turn([{ p: 0, type: 'build', kind: 'fort', cell: fortCell }]);
ok('Festung gebaut', g.players[0].forts === 1);
ok('Festungs-Bonus wirkt', g.fortBonus(fortCell, 0) === 2 && g.fortBonus(myCell, 0) >= 1);

// Boot auf fremde Insel
let boatTarget = -1;
for (const c of g.landCells) {
  if (g.owner[c] === -1 && g.map.island[c] !== myIsland) { boatTarget = c; break; }
}
ok('Fremde Insel mit neutralem Land existiert', boatTarget >= 0);

// Bis zur Küste expandieren (ohne Küste kein Boot – korrektes Verhalten)
const hasCoast = () => {
  const nb = new Int32Array(4);
  for (let c = 0; c < g.owner.length; c++) {
    if (g.owner[c] !== 0) continue;
    const k = g.neighbors4(c, nb);
    for (let i = 0; i < k; i++) if (g.map.terrain[nb[i]] === 0) return true;
  }
  return false;
};
for (let round = 0; round < 40 && !hasCoast(); round++) {
  g.turn([{ p: 0, type: 'attack', target: -1, ratio: 0.6 }]);
  for (let i = 0; i < 100; i++) g.turn([]);
}
ok('Spieler erreicht die Küste', hasCoast(), 'Gebiet: ' + g.players[0].territory);
for (let i = 0; i < 3000 && g.players[0].troops < 400; i++) g.turn([]);
g.turn([{ p: 0, type: 'boat', cell: boatTarget, ratio: 0.4 }]);
ok('Boot gestartet', g.boats.filter(b => b.owner === 0).length === 1);

// Boot ankommen lassen, dann den Brückenkopf-Angriff arbeiten lassen
for (let i = 0; i < 300 && g.boats.some(b => b.owner === 0); i++) g.turn([]);
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

console.log(results.join('\n'));
const fails = results.filter(r => r.startsWith('FAIL')).length;
console.log(`\n${results.length - fails}/${results.length} Tests bestanden`);
process.exit(fails ? 1 : 0);
