// ---------- Erfolge-System ----------
// Jede "Familie" ist EIN Fortschritt (z.B. "Japan erobert"), der automatisch
// durch 4 Stufen wandert: 1x -> 10x -> 100x -> 1000x. Das hält die Liste
// kompakt (eine Zeile pro Familie statt 4 einzelne Erfolge) und erspart es,
// hunderte Einzel-Achievements von Hand zu pflegen. Insgesamt ergeben die
// FAMILIES-Liste x 4 Stufen weit über 100 einzelne Erfolgsstufen.
//
// Fortschritt wird rein lokal in localStorage gespeichert (kein Server-Save
// nötig, wie beim Rest des Profils). main.js ruft die onXxx()-Hooks an den
// passenden Stellen im Spielablauf auf (Spielstart, eigene Befehle,
// Rundenverarbeitung, Spielende) und registriert onUnlock() für Toasts.

import { NATION_NAMES } from './engine.js';
import { t } from './i18n.js';

const STORAGE_KEY = 'ofAchStats';
export const TIERS = [1, 10, 100, 1000];
export const TIER_LABELS = ['I', 'II', 'III', 'IV'];

// Reihenfolge = Anzeigereihenfolge im Panel.
// "tiers" ist optional: fehlt es, gilt die Standard-Stufung TIERS (1/10/100/1000).
// Für Fortschritte, die pro Zug in großen Schüben wachsen (z.B. eroberte
// Landzellen), sind eigene, deutlich höhere Schwellen nötig, sonst wäre die
// Kategorie schon nach einer einzigen kurzen Partie komplett durch.
export const FAMILIES = [
  { id: 'games_played', icon: '🎮' },
  { id: 'wins', icon: '🏆' },
  { id: 'solo_wins', icon: '👑' },
  { id: 'team_wins', icon: '🤝' },
  { id: 'eliminations', icon: '⚔️' },
  { id: 'deaths', icon: '💀' },
  { id: 'cities_built', icon: '🏙️' },
  { id: 'forts_built', icon: '🏰' },
  { id: 'ports_built', icon: '⚓' },
  { id: 'factories_built', icon: '🏭' },
  { id: 'warships_built', icon: '🚢' },
  { id: 'boat_invasions', icon: '🛶' },
  { id: 'attacks_launched', icon: '🗡️' },
  { id: 'alliances_formed', icon: '🕊️' },
  { id: 'alliances_broken', icon: '🔪' },
  { id: 'betrayed_by_ally', icon: '🎭' },
  { id: 'tiles_captured', icon: '🗺️', tiers: [3000, 30000, 300000, 3000000] },
  { id: 'survived_full_games', icon: '🛡️' },
  { id: 'nation_de', icon: '🇩🇪' },
  { id: 'nation_fr', icon: '🇫🇷' },
  { id: 'nation_gb', icon: '🇬🇧' },
  { id: 'nation_es', icon: '🇪🇸' },
  { id: 'nation_it', icon: '🇮🇹' },
  { id: 'nation_ru', icon: '🇷🇺' },
  { id: 'nation_us', icon: '🇺🇸' },
  { id: 'nation_jp', icon: '🇯🇵' },
];

function tiersOf(fam) { return fam.tiers || TIERS; }

// NATION_NAMES (engine.js) und die nation_*-IDs oben haben dieselbe Reihenfolge.
const NATION_IDS = FAMILIES.filter(f => f.id.startsWith('nation_')).map(f => f.id);

function loadStats() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    return (raw && typeof raw === 'object') ? raw : {};
  } catch {
    return {};
  }
}
const stats = loadStats();

function saveStats() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(stats)); } catch { /* Speicher voll/gesperrt: ignorieren */ }
}

// Wie viele Stufen (0-4) sind bei "count" Vorkommen erreicht?
function tierOf(count, tiers) {
  let tier = 0;
  for (const th of tiers) {
    if (count >= th) tier++;
    else break;
  }
  return tier;
}

const unlockListeners = new Set();
// fn(family, tierIndex, threshold) wird für jede neu erreichte Stufe aufgerufen
export function onUnlock(fn) { unlockListeners.add(fn); }

// Erfolge, die seit dem letzten onGameStart() neu freigeschaltet wurden – für
// die Anzeige "in dieser Runde geschafft" im Sieg/Niederlage-Overlay.
let sessionUnlocks = [];
export function getSessionUnlocks() { return sessionUnlocks; }

function incr(id, amount = 1) {
  if (amount <= 0) return;
  const fam = FAMILIES.find(f => f.id === id);
  if (!fam) return;
  const tiers = tiersOf(fam);
  const before = stats[id] || 0;
  const after = before + amount;
  stats[id] = after;
  saveStats();
  const t0 = tierOf(before, tiers), t1 = tierOf(after, tiers);
  if (t1 > t0) {
    for (let ti = t0; ti < t1; ti++) {
      sessionUnlocks.push({ fam, tierIdx: ti, threshold: tiers[ti] });
      for (const fn of unlockListeners) fn(fam, ti, tiers[ti]);
    }
  }
}

// Setzt ALLE Fortschritte auf 0 zurück (nur zum Testen gedacht).
export function resetAll() {
  for (const key of Object.keys(stats)) delete stats[key];
  sessionUnlocks = [];
  saveStats();
}

function nationIdForName(name) {
  if (!name) return null;
  for (let i = 0; i < NATION_NAMES.length; i++) {
    if (name.startsWith(NATION_NAMES[i])) return NATION_IDS[i];
  }
  return null;
}

// ---------- Hooks (von main.js aufgerufen) ----------

// Beim Start jeder neuen Partie (Solo oder Online).
export function onGameStart() {
  sessionUnlocks = [];
  incr('games_played');
}

// Für jeden eigenen Befehl, den der Spieler abschickt (sendIntent in main.js).
export function onIntent(d) {
  if (!d) return;
  if (d.type === 'attack') incr('attacks_launched');
  else if (d.type === 'boat') incr('boat_invasions');
  else if (d.type === 'warship') incr('warships_built');
  else if (d.type === 'build') {
    if (d.kind === 'city') incr('cities_built');
    else if (d.kind === 'fort') incr('forts_built');
    else if (d.kind === 'port') incr('ports_built');
    else if (d.kind === 'factory') incr('factories_built');
  }
}

// Nach jedem game.turn(): Gebietszuwachs + Ereignis-Feed dieser Runde auswerten.
// territoryBefore = eigenes Territorium unmittelbar vor game.turn().
export function onTurnProcessed(game, myIdx, territoryBefore) {
  const me = game.players[myIdx];
  if (me) {
    const delta = me.territory - territoryBefore;
    if (delta > 0) incr('tiles_captured', delta);
  }
  for (const e of game.feedEvents) {
    if (e.t === 'elim') {
      if (e.by === myIdx && e.p !== myIdx) {
        incr('eliminations');
        const victim = game.players[e.p];
        const nid = victim ? nationIdForName(victim.name) : null;
        if (nid) incr(nid);
      }
      if (e.p === myIdx) incr('deaths');
    } else if (e.t === 'ally') {
      if (e.a === myIdx || e.b === myIdx) incr('alliances_formed');
    } else if (e.t === 'unally') {
      if (e.a === myIdx) incr('alliances_broken');
      else if (e.b === myIdx) incr('betrayed_by_ally');
    }
  }
}

// Wird von checkGameEnd() aufgerufen, sobald game.winners gesetzt ist.
export function onGameEnd(game, myIdx) {
  if (!game || !game.winners) return;
  const iWon = game.winners.includes(myIdx);
  if (iWon) {
    incr('wins');
    if (game.winners.length === 1) incr('solo_wins');
    else incr('team_wins');
  }
  const me = game.players[myIdx];
  if (me && me.alive) incr('survived_full_games');
}

// Kompakte HTML-Liste der in dieser Runde neu freigeschalteten Erfolge (für
// das Sieg/Niederlage-Overlay). Leerer String, wenn keine dabei waren.
export function sessionUnlocksHtml() {
  if (!sessionUnlocks.length) return '';
  const items = sessionUnlocks.map(u =>
    `<li><span class="ru-icon">${u.fam.icon}</span> ${t(`ach_${u.fam.id}_name`)} <span class="ru-tier">${TIER_LABELS[u.tierIdx]}</span></li>`
  ).join('');
  return `<div class="round-achievements">
    <div class="ra-heading">${t('achRoundHeading')}</div>
    <ul class="ra-list">${items}</ul>
  </div>`;
}

// ---------- Rendering ----------

export function totalTierCount() { return FAMILIES.length * TIERS.length; }

export function unlockedTierCount() {
  let n = 0;
  for (const fam of FAMILIES) n += tierOf(stats[fam.id] || 0, tiersOf(fam));
  return n;
}

// Baut die kompakte Liste (eine Zeile pro Familie) in "container" auf.
export function renderAchievements(container) {
  container.innerHTML = '';
  for (const fam of FAMILIES) {
    const tiers = tiersOf(fam);
    const count = stats[fam.id] || 0;
    const tier = tierOf(count, tiers);
    const next = tiers[tier];
    const prevThresh = tier > 0 ? tiers[tier - 1] : 0;
    const pct = next ? Math.min(100, Math.round(((count - prevThresh) / (next - prevThresh)) * 100)) : 100;

    const row = document.createElement('div');
    row.className = 'ach-row' + (tier >= tiers.length ? ' ach-maxed' : '');

    const dots = tiers.map((th, i) =>
      `<span class="ach-dot ${i < tier ? 'done' : ''}" title="${TIER_LABELS[i]} (${th}x)">${TIER_LABELS[i]}</span>`
    ).join('');

    row.innerHTML = `
      <div class="ach-icon">${fam.icon}</div>
      <div class="ach-info">
        <div class="ach-title-row">
          <span class="ach-name">${t(`ach_${fam.id}_name`)}</span>
          <span class="ach-count">${count}${next ? ' / ' + next : ' ' + t('achMaxLabel')}</span>
        </div>
        <div class="ach-bar"><div class="ach-bar-fill" style="width:${pct}%"></div></div>
        <div class="ach-desc">${t(`ach_${fam.id}_desc`)}</div>
      </div>
      <div class="ach-tiers">${dots}</div>
    `;
    container.appendChild(row);
  }
}
