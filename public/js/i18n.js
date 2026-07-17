// Übersetzung (DE/EN). Sprache wird in localStorage gemerkt, Standard: Deutsch
// (bisheriges Verhalten des Spiels). Andere Module rufen t(key, vars) für
// Texte auf und applyStaticTranslations()/onLangChange() für die UI.

const STORAGE_KEY = 'ofLang';

const dict = {
  // ---------- Einstellungen ----------
  settingsTitle: { de: 'Einstellungen', en: 'Settings' },
  languageLabel: { de: 'Sprache', en: 'Language' },
  closeBtn: { de: 'Schließen', en: 'Close' },
  settingsIconTitle: { de: 'Einstellungen', en: 'Settings' },
  guideIconTitle: { de: 'Anleitung (bald verfügbar)', en: 'Guide (coming soon)' },
  statsIconTitle: { de: 'Statistik (bald verfügbar)', en: 'Stats (coming soon)' },
  volumeLabel: { de: 'Lautstärke', en: 'Volume' },
  volumeSoonNote: { de: 'Ton kommt später – der Regler gilt dann schon.', en: 'Sound is coming later – the slider will apply then.' },
  animationsLabel: { de: 'Animationen', en: 'Animations' },
  animOn: { de: 'An', en: 'On' },
  animOff: { de: 'Aus', en: 'Off' },
  showFpsLabel: { de: 'FPS-Anzeige', en: 'Show FPS' },
  fpsOn: { de: 'An', en: 'On' },
  fpsOff: { de: 'Aus', en: 'Off' },
  buildingStyleLabel: { de: 'Gebäude-Grafik', en: 'Building graphics' },
  buildingStyleOrig: { de: 'Standard (Emoji)', en: 'Standard (emoji)' },
  buildingStyleOld: { de: 'Alt (Wappen)', en: 'Old (badges)' },
  buildingStyleNew: { de: 'Neu (Inseln)', en: 'New (islands)' },
  buildingStyleHint: { de: 'Gilt nur für deine eigenen Gebäude/Züge – Bots und andere Nationen bleiben beim Standard.', en: 'Applies only to your own buildings/trains – bots and other nations stay standard.' },
  profileNavSkins: { de: 'Skins', en: 'Skins' },
  profileNavStats: { de: 'Statistiken', en: 'Statistics' },
  profileNavHistory: { de: 'Spielverlauf', en: 'Match history' },
  profileNavAchievements: { de: 'Erfolge', en: 'Achievements' },
  achSummary: { de: '{n} / {total} Erfolgsstufen freigeschaltet', en: '{n} / {total} achievement tiers unlocked' },
  achMaxLabel: { de: 'MAX', en: 'MAX' },
  achUnlockedPrefix: { de: 'Erfolg freigeschaltet', en: 'Achievement unlocked' },
  achResetBtnTitle: { de: 'Alle Erfolge zurücksetzen (nur zum Testen)', en: 'Reset all achievements (testing only)' },
  achResetConfirm: { de: 'Wirklich ALLE Erfolge zurücksetzen? Das kann nicht rückgängig gemacht werden.', en: 'Really reset ALL achievements? This cannot be undone.' },
  achRoundHeading: { de: 'In dieser Runde freigeschaltet:', en: 'Unlocked this round:' },
  profileNameLabel: { de: 'Spielername', en: 'Player name' },
  profileNameHint: { de: 'Gilt für Einzel- und Mehrspieler – dasselbe Feld wie im Menü.', en: 'Used for single- and multiplayer – same field as in the menu.' },
  profileStatsSoon: { de: 'Statistiken werden noch gesammelt – hier gibt\'s bald Siege, Niederlagen und mehr.', en: 'Stats are still being collected – wins, losses and more coming soon.' },
  profileHistorySoon: { de: 'Noch keine gespeicherten Spiele – der Spielverlauf kommt in einem späteren Update.', en: 'No saved games yet – match history is coming in a later update.' },
  iconPickerBtnTitle: { de: 'Icon ändern', en: 'Change icon' },
  iconPickerTitle: { de: 'Icon wählen', en: 'Choose icon' },
  iconPickerHint: { de: 'Wähle dein Wappen – gilt überall, wo dein Name angezeigt wird.', en: 'Pick your emblem – used everywhere your name is shown.' },

  // ---------- Erfolge ----------
  ach_games_played_name: { de: 'Partien gespielt', en: 'Games Played' },
  ach_games_played_desc: { de: 'Tritt zu möglichst vielen Partien an.', en: 'Enter as many matches as possible.' },
  ach_wins_name: { de: 'Siege', en: 'Victories' },
  ach_wins_desc: { de: 'Gewinne Partien, egal ob solo oder im Bündnis.', en: 'Win matches, solo or allied.' },
  ach_solo_wins_name: { de: 'Alleinherrscher', en: 'Sole Ruler' },
  ach_solo_wins_desc: { de: 'Gewinne eine Partie ganz allein, ohne Bündnispartner.', en: 'Win a match completely alone, without allies.' },
  ach_team_wins_name: { de: 'Bündnissieger', en: 'Coalition Victor' },
  ach_team_wins_desc: { de: 'Gewinne gemeinsam mit Verbündeten.', en: 'Win together with allies.' },
  ach_eliminations_name: { de: 'Feldherr', en: 'Warlord' },
  ach_eliminations_desc: { de: 'Lösche gegnerische Spieler aus.', en: 'Wipe out enemy players.' },
  ach_deaths_name: { de: 'Gefallen', en: 'Fallen' },
  ach_deaths_desc: { de: 'Werde selbst aus dem Spiel eliminiert.', en: 'Get eliminated yourself.' },
  ach_cities_built_name: { de: 'Stadtgründer', en: 'City Founder' },
  ach_cities_built_desc: { de: 'Baue Städte in deinem Reich.', en: 'Build cities in your realm.' },
  ach_forts_built_name: { de: 'Festungsbauer', en: 'Fortress Builder' },
  ach_forts_built_desc: { de: 'Baue Festungen zur Verteidigung.', en: 'Build forts for defense.' },
  ach_ports_built_name: { de: 'Hafenmeister', en: 'Harbor Master' },
  ach_ports_built_desc: { de: 'Baue Häfen für den Handel.', en: 'Build ports for trade.' },
  ach_factories_built_name: { de: 'Industrieller', en: 'Industrialist' },
  ach_factories_built_desc: { de: 'Baue Fabriken.', en: 'Build factories.' },
  ach_warships_built_name: { de: 'Admiral', en: 'Admiral' },
  ach_warships_built_desc: { de: 'Lasse Kriegsschiffe vom Stapel.', en: 'Launch warships.' },
  ach_boat_invasions_name: { de: 'Landungsbefehl', en: 'Amphibious Command' },
  ach_boat_invasions_desc: { de: 'Starte Truppenlandungen per Boot.', en: 'Launch troop landings by boat.' },
  ach_attacks_launched_name: { de: 'Angreifer', en: 'Aggressor' },
  ach_attacks_launched_desc: { de: 'Befehlige Landangriffe auf gegnerisches Gebiet.', en: 'Order land attacks on enemy territory.' },
  ach_alliances_formed_name: { de: 'Diplomat', en: 'Diplomat' },
  ach_alliances_formed_desc: { de: 'Schließe Bündnisse mit anderen Spielern.', en: 'Form alliances with other players.' },
  ach_alliances_broken_name: { de: 'Verräter', en: 'Betrayer' },
  ach_alliances_broken_desc: { de: 'Breche selbst ein bestehendes Bündnis.', en: 'Break an existing alliance yourself.' },
  ach_betrayed_by_ally_name: { de: 'Hintergangen', en: 'Backstabbed' },
  ach_betrayed_by_ally_desc: { de: 'Werde von einem Verbündeten verraten.', en: 'Be betrayed by an ally.' },
  ach_tiles_captured_name: { de: 'Landnahme', en: 'Land Grab' },
  ach_tiles_captured_desc: { de: 'Erobere Landzellen auf der Karte.', en: 'Capture land tiles on the map.' },
  ach_survived_full_games_name: { de: 'Überlebenskünstler', en: 'Survivor' },
  ach_survived_full_games_desc: { de: 'Erlebe das Ende einer Partie lebend.', en: 'Live to see the end of a match.' },
  ach_nation_de_name: { de: 'Deutschland erobert', en: 'Conquer Germany' },
  ach_nation_de_desc: { de: 'Besiege die Nation Deutschland.', en: 'Defeat the German nation.' },
  ach_nation_fr_name: { de: 'Frankreich erobert', en: 'Conquer France' },
  ach_nation_fr_desc: { de: 'Besiege die Nation Frankreich.', en: 'Defeat the French nation.' },
  ach_nation_gb_name: { de: 'England erobert', en: 'Conquer England' },
  ach_nation_gb_desc: { de: 'Besiege die Nation England.', en: 'Defeat the English nation.' },
  ach_nation_es_name: { de: 'Spanien erobert', en: 'Conquer Spain' },
  ach_nation_es_desc: { de: 'Besiege die Nation Spanien.', en: 'Defeat the Spanish nation.' },
  ach_nation_it_name: { de: 'Italien erobert', en: 'Conquer Italy' },
  ach_nation_it_desc: { de: 'Besiege die Nation Italien.', en: 'Defeat the Italian nation.' },
  ach_nation_ru_name: { de: 'Russland erobert', en: 'Conquer Russia' },
  ach_nation_ru_desc: { de: 'Besiege die Nation Russland.', en: 'Defeat the Russian nation.' },
  ach_nation_us_name: { de: 'USA erobert', en: 'Conquer the USA' },
  ach_nation_us_desc: { de: 'Besiege die Nation USA.', en: 'Defeat the US nation.' },
  ach_nation_jp_name: { de: 'Japan erobert', en: 'Conquer Japan' },
  ach_nation_jp_desc: { de: 'Besiege die Nation Japan.', en: 'Defeat the Japanese nation.' },

  // ---------- Hauptmenü ----------
  soloHeading: { de: 'Einzelspieler', en: 'Singleplayer' },
  usernameLabel: { de: 'Benutzername', en: 'Username' },
  playerNamePlaceholder: { de: 'Spieler', en: 'Player' },
  defaultPlayerName: { de: 'Spieler', en: 'Player' },
  mapLabel: { de: 'Karte', en: 'Map' },
  sizeLabel: { de: 'Größe', en: 'Size' },
  botsLabelColon: { de: 'Bots (schwach):', en: 'Bots (weak):' },
  nationsLabelColon: { de: 'Nationen (stark):', en: 'Nations (strong):' },
  yourColorLabel: { de: 'Deine Farbe', en: 'Your Color' },
  colorPickTitle: { de: 'Eigene Farbe wählen (nochmal klicken = Automatik)', en: 'Pick your color (click again = automatic)' },
  nationStrengthLabel: { de: 'Stärke der Nationen', en: 'Nation Strength' },
  diffEasy: { de: 'Leicht', en: 'Easy' },
  diffMedium: { de: 'Mittel', en: 'Medium' },
  diffHard: { de: 'Schwer', en: 'Hard' },
  newsHeading: { de: 'Neuigkeiten', en: 'News' },
  newsLoading: { de: 'Lade Neuigkeiten …', en: 'Loading news …' },
  newsUnavailable: { de: 'Neuigkeiten nicht verfügbar', en: 'News unavailable' },
  newBadge: { de: 'NEU', en: 'NEW' },
  multiHeading: { de: 'Mehrspieler', en: 'Multiplayer' },
  createLobbyBtn: { de: 'Lobby erstellen', en: 'Create Lobby' },
  joinLobbyTitle: { de: 'Lobby beitreten', en: 'Join Lobby' },
  codePlaceholder: { de: 'CODE', en: 'CODE' },
  joinBtn: { de: 'Beitreten', en: 'Join' },
  joinHint: { de: '4-stelligen Code eingeben', en: 'Enter 4-character code' },
  playBtn: { de: 'Spielen', en: 'Play' },
  taglineConquer: { de: 'Erobern', en: 'Conquer' },
  taglineExpand: { de: 'Ausbauen', en: 'Expand' },
  taglineSurvive: { de: 'Überleben', en: 'Survive' },
  enterCodeError: { de: 'Bitte 4-stelligen Code eingeben.', en: 'Please enter a 4-character code.' },
  connectFailed: { de: 'Verbindung zum Server fehlgeschlagen.', en: 'Failed to connect to the server.' },

  // ---------- Lobby ----------
  lobbyTitle: { de: 'Lobby', en: 'Lobby' },
  lobbyCodeLabel: { de: 'Code:', en: 'Code:' },
  lobbyHint: { de: 'Freunde öffnen diese Seite und treten mit dem Code bei.', en: 'Friends open this page and join using the code.' },
  lobbyDiffEasy: { de: '🟢 Leicht', en: '🟢 Easy' },
  lobbyDiffMedium: { de: '🟡 Mittel', en: '🟡 Medium' },
  lobbyDiffHard: { de: '🔴 Schwer', en: '🔴 Hard' },
  startGameBtn: { de: 'Spiel starten', en: 'Start Game' },
  waitingHostText: { de: 'Warte auf den Host …', en: 'Waiting for the host …' },
  leaveBtn: { de: 'Verlassen', en: 'Leave' },
  hostTag: { de: 'Host', en: 'Host' },

  // ---------- Spiel / HUD ----------
  troopsLabelColon: { de: 'Truppen:', en: 'Troops:' },
  buildCity: { de: '🏙 Stadt', en: '🏙 City' },
  buildFort: { de: '🛡 Festung', en: '🛡 Fort' },
  buildPort: { de: '⚓ Hafen', en: '⚓ Port' },
  buildFactory: { de: '🏭 Fabrik', en: '🏭 Factory' },
  kindCity: { de: 'Stadt', en: 'City' },
  kindFort: { de: 'Festung', en: 'Fort' },
  kindPort: { de: 'Hafen', en: 'Port' },
  kindFactory: { de: 'Fabrik', en: 'Factory' },
  controlHint: {
    de: 'Klick = Angriff · andere Insel = Boot · Rechtsklick = Menü (Bauen, Kriegsschiff, Allianz)',
    en: 'Click = attack · other island = boat · right-click = menu (build, warship, alliance)',
  },
  shortcutTitle: { de: '⌨ Steuerung', en: '⌨ Controls' },
  shortcutShow: { de: 'einblenden', en: 'show' },
  shortcutHide: { de: 'ausblenden', en: 'hide' },
  shPan: { de: '<b>WASD</b> / Pfeile – Kamera bewegen', en: '<b>WASD</b> / arrows – move camera' },
  shZoom: { de: '<b>Mausrad</b> – Zoom · <b>Minimap</b> – springen', en: '<b>Mouse wheel</b> – zoom · <b>Minimap</b> – jump' },
  shBuildKeys: { de: '<b>1</b> Stadt · <b>2</b> Festung · <b>3</b> Hafen · <b>4</b> Fabrik', en: '<b>1</b> City · <b>2</b> Fort · <b>3</b> Port · <b>4</b> Factory' },
  shLeftClick: { de: '<b>Linksklick</b> – angreifen / ausbreiten', en: '<b>Left-click</b> – attack / expand' },
  shRightClick: { de: '<b>Rechtsklick</b> – Menü (Allianz, Boot, Bauen)', en: '<b>Right-click</b> – menu (alliance, boat, build)' },
  shEscape: { de: '<b>Esc</b> – Modus / Menü abbrechen', en: '<b>Esc</b> – cancel mode / menu' },
  spectateBtn: { de: 'Zuschauen', en: 'Spectate' },
  waitLobbyBtn: { de: 'In Lobby warten', en: 'Wait in Lobby' },
  backToLobbyBtn: { de: 'Zurück zur Lobby', en: 'Back to Lobby' },
  backToMenuBtn: { de: 'Zurück zum Menü', en: 'Back to Menu' },

  buildModeTarget: { de: '{kind}: Zielfeld anklicken.', en: '{kind}: click a target tile.' },
  buildModeEnded: { de: 'Baumodus beendet.', en: 'Build mode ended.' },
  eliminatedTitle: { de: 'Eliminiert 💀', en: 'Eliminated 💀' },
  eliminatedText: { de: 'Dein Reich wurde erobert.', en: 'Your realm has been conquered.' },
  teamWinTitle: { de: 'Team-Sieg! 🏆🤝', en: 'Team victory! 🏆🤝' },
  teamWinText: { de: 'Gemeinsam gewonnen mit: {names}', en: 'Won together with: {names}' },
  winTitle: { de: 'Sieg! 🏆', en: 'Victory! 🏆' },
  winText: { de: 'Du beherrschst die Karte!', en: 'You dominate the map!' },
  gameOverTitle: { de: 'Spiel vorbei', en: 'Game over' },
  gameOverAlliance: { de: 'Das Bündnis {names} hat gewonnen.', en: 'The alliance {names} has won.' },
  gameOverSingle: { de: '{names} hat gewonnen.', en: '{names} has won.' },
  waitingLobbyTitle: { de: 'In der Lobby warten …', en: 'Waiting in the lobby …' },
  waitingLobbyText: { de: 'Du wartest auf das Spielende. Danach geht es zurück in die Lobby.', en: 'You are waiting for the game to end. You will then return to the lobby.' },
  spawnPrompt: { de: 'Wähle deinen Startpunkt! ({secs}s)', en: 'Choose your starting point! ({secs}s)' },

  allianceBroken: { de: 'Allianz mit {name} aufgekündigt.', en: 'Alliance with {name} broken off.' },
  allianceFormed: { de: 'Allianz mit {name} geschlossen! 🤝', en: 'Alliance with {name} formed! 🤝' },
  allianceRequestPending: { de: 'Anfrage an {name} läuft bereits …', en: 'Request to {name} is already pending …' },
  allianceRequestSent: { de: 'Allianz-Anfrage an {name} gesendet.', en: 'Alliance request sent to {name}.' },
  allianceRequestDeclined: { de: 'Allianz-Anfrage von {name} abgelehnt.', en: 'Alliance request from {name} declined.' },
  allianceOffer: { de: '{name} bietet eine Allianz an', en: '{name} is offering an alliance' },
  acceptBtn: { de: '🤝 Annehmen', en: '🤝 Accept' },
  declineBtn: { de: '✕ Ablehnen', en: '✕ Decline' },
  cannotAttackAlly: { de: 'Verbündete kannst du nicht angreifen.', en: 'You cannot attack allies.' },
  maxBoatsOut: { de: 'Maximal {max} Boote gleichzeitig.', en: 'Maximum of {max} boats at once.' },
  noSeaRoute: { de: 'Kein Seeweg – du brauchst eigene Küste mit Verbindung dorthin.', en: 'No sea route – you need your own coast connected to it.' },
  boatLaunched: { de: 'Boot gestartet! 🚢', en: 'Boat launched! 🚢' },
  attackCancelled: { de: 'Angriff auf {name} abgebrochen – Truppen kehren zurück.', en: 'Attack on {name} cancelled – troops are returning.' },
  cancelAttackTitle: { de: 'Klicken, um den Angriff abzubrechen – Truppen kehren zurück', en: 'Click to cancel the attack – troops will return' },
  yourAttacks: { de: 'Deine Angriffe', en: 'Your attacks' },
  againstYou: { de: 'Gegen dich', en: 'Against you' },
  neutral: { de: 'Neutral', en: 'Neutral' },
  youSuffix: { de: ' (Du)', en: ' (You)' },
  tipTroops: { de: 'Truppen: ', en: 'Troops: ' },
  tipMoney: { de: 'Geld: ', en: 'Money: ' },
  tipTerritory: { de: 'Gebiet: ', en: 'Territory: ' },
  eliminatedInline: { de: 'Eliminiert 💀', en: 'Eliminated 💀' },

  yourTerritory: { de: 'Dein Gebiet', en: 'Your territory' },
  neutralLand: { de: 'Neutrales Land', en: 'Neutral land' },
  breakAllianceLabel: { de: '💔 Allianz mit {name} brechen', en: '💔 Break alliance with {name}' },
  acceptAllianceLabel: { de: '🤝 Allianz mit {name} annehmen', en: '🤝 Accept alliance with {name}' },
  allianceRequestPendingLabel: { de: '⏳ Anfrage an {name} läuft …', en: '⏳ Request to {name} pending …' },
  requestAllianceLabel: { de: '🤝 Allianz mit {name} anfragen', en: '🤝 Request alliance with {name}' },
  attackLabel: { de: '⚔ Angreifen ({pct}%)', en: '⚔ Attack ({pct}%)' },
  boatHereLabel: { de: '🚢 Boot hierher ({pct}%)', en: '🚢 Boat here ({pct}%)' },
  buildWarshipLabel: { de: '⛴ Kriegsschiff bauen ({cost}€)', en: '⛴ Build warship ({cost}€)' },
  maxWarships: { de: 'Maximal 2 Kriegsschiffe je Hafen.', en: 'Maximum of 2 warships per port.' },
  notEnoughMoneyShort: { de: 'Nicht genug Geld.', en: 'Not enough money.' },
  warshipLaunched: { de: 'Kriegsschiff läuft vom Stapel! ⛴', en: 'Warship launched! ⛴' },
  buildKindLabel: { de: '{kind} bauen ({cost}€)', en: 'Build {kind} ({cost}€)' },

  // Fehlercodes von engine.js (canBuildAt)
  errNotOwnTerritory: { de: 'Nur auf eigenem Gebiet baubar.', en: 'Can only build on your own territory.' },
  errNotEnoughMoney: { de: 'Nicht genug Geld ({cost} € nötig).', en: 'Not enough money ({cost} € needed).' },
  errPortNeedsCoast: { de: 'Ein Hafen braucht Küste (Zelle am Wasser).', en: 'A port needs coast (a tile by the water).' },
  errTooCloseToBuilding: { de: 'Zu nah an einem eigenen Gebäude.', en: 'Too close to one of your own buildings.' },

  // Kartengrößen / Kartentypen (Anzeige, ids bleiben unverändert)
  mapSizeKlein: { de: 'Klein', en: 'Small' },
  mapSizeMittel: { de: 'Mittel', en: 'Medium' },
  mapSizeGross: { de: 'Groß', en: 'Large' },
  mapSizeRiesig: { de: 'Riesig', en: 'Huge' },
  mapTypeRandom: { de: '🎲 Zufalls-Archipel', en: '🎲 Random Archipelago' },
  mapTypeWorld: { de: '🌍 Weltkarte', en: '🌍 World Map' },
  mapTypeEurope: { de: 'Europa', en: 'Europe' },
  mapTypeAsia: { de: 'Asien', en: 'Asia' },
  mapTypeAfrica: { de: 'Afrika', en: 'Africa' },
  mapTypeNamerica: { de: 'Nordamerika', en: 'North America' },
  mapTypeSamerica: { de: 'Südamerika', en: 'South America' },
  mapTypeAustralia: { de: 'Australien & Ozeanien', en: 'Australia & Oceania' },
};

let lang = localStorage.getItem(STORAGE_KEY) || 'de';
if (lang !== 'de' && lang !== 'en') lang = 'de';

const listeners = new Set();

export function getLang() {
  return lang;
}

export function setLang(next) {
  if (next !== 'de' && next !== 'en') return;
  if (next === lang) return;
  lang = next;
  localStorage.setItem(STORAGE_KEY, lang);
  document.documentElement.lang = lang;
  applyStaticTranslations();
  for (const fn of listeners) fn(lang);
}

// Wird aufgerufen, wenn sich die Sprache ändert – für dynamisch erzeugte
// Inhalte (Rangliste, Dropdowns, Bau-Buttons …), die kein data-i18n haben.
export function onLangChange(fn) {
  listeners.add(fn);
}

// Übersetzung holen. vars ersetzt {platzhalter} im Text.
export function t(key, vars) {
  const entry = dict[key];
  let text = entry ? (entry[lang] || entry.de || key) : key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      text = text.split(`{${k}}`).join(v);
    }
  }
  return text;
}

// Alle Elemente mit data-i18n (Text), data-i18n-title (title-Attribut) und
// data-i18n-placeholder (placeholder-Attribut) auf die aktuelle Sprache setzen.
export function applyStaticTranslations(root = document) {
  for (const el of root.querySelectorAll('[data-i18n]')) {
    const key = el.getAttribute('data-i18n');
    if (el.dataset.i18nHtml !== undefined) el.innerHTML = t(key);
    else el.textContent = t(key);
  }
  for (const el of root.querySelectorAll('[data-i18n-title]')) {
    el.title = t(el.getAttribute('data-i18n-title'));
  }
  for (const el of root.querySelectorAll('[data-i18n-placeholder]')) {
    el.placeholder = t(el.getAttribute('data-i18n-placeholder'));
  }
}

document.documentElement.lang = lang;
