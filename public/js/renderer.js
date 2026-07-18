// Canvas-Renderer: Karte als ImageData in Kartenauflösung,
// hochskaliert mit Zoom & Pan gezeichnet.
//
// Trick fuer Tempo: Die Karte (Zehntausende Zellen) wird pixelgenau in ein
// kleines Offscreen-Canvas in Kartenaufloesung gemalt und beim Zeichnen als
// EIN Bild hochskaliert. So muss pro Frame nicht jede Zelle einzeln gezeichnet
// werden; geaendert wird nur, was sich wirklich veraendert hat (markDirty).

import { FACTORY_RADIUS, BUILD_DEPLOY_TICKS, FORT_RADIUS, CATAPULT_RANGE, FORT_HP, TOWER_AMMO, TOWER_BUILDING_HP } from './engine.js';
import { hash2 } from './rng.js';

// Basisfarben fuer Wasser und neutrales (herrenloses) Land, als [R,G,B].
// Wasser wird nach Tiefe verlaufen gezeichnet (Kueste hell -> offene See dunkel).
const WATER_SHALLOW = [96, 170, 205];
const WATER_DEEP = [22, 52, 94];
const NEUTRAL = [186, 176, 138];
const NEUTRAL_EDGE = [163, 153, 116];   // etwas dunkler fuer Grenzkanten
const SAND = [219, 205, 156];           // Strandton fuer neutrale Kuestenzellen

// Hex-Farbe ("#rrggbb") in ein [R,G,B]-Array umwandeln.
function hexToRgb(hex) {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}
// Farbe abdunkeln (Faktor f < 1) – fuer die dunkleren Grenzkanten der Reiche.
function darken(rgb, f) {
  return [rgb[0] * f | 0, rgb[1] * f | 0, rgb[2] * f | 0];
}

// Zwei RGB-Farben mischen (t = Anteil von b). Liefert ein neues Array.
function mixRgb(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

// Gelaende-Toene fuer die Terraintypen (map.landType: 0 Grün, 1 Hügel, 2 Gebirge)
const HILLS_TINT = [148, 134, 104];   // erdiger Braunton fuer Huegelland
const MOUNT_TINT = [148, 148, 152];   // Felsgrau fuer Gebirge
const PEAK_TINT = [238, 238, 244];    // helle Felsspitzen/Schnee im Gebirge

// Hex-Farbe mit Alpha als rgba()-String (z.B. fuer Radius-Ringe).
function hexA(hex, a) {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

// Grosse Zahlen kompakt formatieren (1.2M, 3.4k …) fuer die Badges.
function fmt(n) {
  n = Math.floor(n);
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e4) return (n / 1e3).toFixed(1) + 'k';
  return String(n);
}

// Gebaeude-Badge-Bilder (Wappen-Icons). Werden einmal geladen und dann fuer
// Bau-Menue UND Karten-Icons wiederverwendet; das Zeichnen wartet nicht auf
// das Laden (Image.complete wird pro Frame geprueft), es blinkt hoechstens
// beim allerersten Frame ein Fallback (Kreis in Spielerfarbe).
// Gebaeude-Badge-Bilder: zwei Sets (v1 = altes Wappen-Design, v2 = neues
// Insel-Design), zwischen denen der Spieler in den Einstellungen wechseln
// kann (Renderer#buildingStyle). Werden einmal geladen und dann fuer
// Bau-Menue UND Karten-Icons wiederverwendet; das Zeichnen wartet nicht auf
// das Laden (Image.complete wird pro Frame geprueft), es blinkt hoechstens
// beim allerersten Frame ein Fallback (Kreis in Spielerfarbe).
const BUILDING_ICONS = { v1: {}, v2: {} };
for (const kind of ['city', 'fort', 'port', 'factory']) {
  const im1 = new Image();
  im1.src = `images/buildings/${kind}.png`;
  BUILDING_ICONS.v1[kind] = im1;
  const im2 = new Image();
  im2.src = `images/buildings_v2/${kind}.png`;
  BUILDING_ICONS.v2[kind] = im2;
}
// Zug-Sprite (Dampflok, passend zum Wappen-Stil der Gebaeude-Badges).
// Die Front (Laterne/Bugräumer) zeigt im Bild nach links; beim Zeichnen wird
// die Lok in Fahrtrichtung gedreht.
const TRAIN_IMG = new Image();
TRAIN_IMG.src = 'images/units/train.png';

export class Renderer {
  constructor(canvas, game) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.game = game;
    // Von main.js gesetzt: eigener Spieler-Index (fuer den Fabrik-Radius) und
    // ob gerade der Fabrik-Baumodus laeuft (dann Radius deutlicher zeichnen).
    this.myIdx = -1;
    this.factoryHint = false;
    this.fortHint = false;      // Festungs-Baumodus: Radius-Ringe deutlicher + Vorschau
    this.towerAim = null;       // { cell, ammo } waehrend ein eigener Turm zielt (main.js setzt das)
    this.buildingStyle = 'orig'; // 'orig' = Emoji/Formen, 'v1' = altes Wappen-Set, 'v2' = neues Insel-Set
    this.animations = true;   // von main.js gesetzt (Einstellung "Animationen")
    this.hoverCell = -1;    // Zelle unter dem Cursor (fuer die Radius-Vorschau)
    this.selectedWarshipIds = new Set(); // per Klick/Rechteck ausgewaehlte eigene Kriegsschiffe
    this.selectedCatapultIds = new Set(); // per Klick/Rechteck ausgewaehlte eigene Katapulte
    this.selectRect = null; // Shift-Auswahlrechteck in Bildschirmkoordinaten ({x0,y0,x1,y1})
    // Kosmetische Partikel (Eroberungs-Funken, Ruinen-Staub): {x, y, dx, dy,
    // born, life, size, alpha, color} – Position ergibt sich aus der Lebens-
    // zeit (t = 0..1), keine Integration noetig. Rein visuell, kein Spielzustand.
    this.particles = [];
    this.ruinsKnown = new Set(); // Zellen bekannter Truemmerfelder (Burst nur bei NEUEN Ruinen)
    // Fliegende Turm-Geschosse: die Engine markiert jeden durchgegangenen
    // Schuss am Turm (b.lastShot = { target, ammo, turn }); drawProjectiles
    // spannt daraus ein Projektil. towerShotsSeen verhindert Doppel-Starts.
    this.projectiles = [];
    this.towerShotsSeen = new Map(); // Turm-Zelle -> letzter animierter turn
    // Katapult-Schuesse: Katapult-ID -> letzter animierter turn; Arm-Anim:
    // Katapult-ID -> Startzeit des Wurfarm-Rueckschwungs (ms, performance.now)
    this.catapultShotsSeen = new Map();
    this.catapultArmAnim = new Map();
    // Letzter bekannter Kurs je Kriegsschiff-ID: damit liegen Schiffe im
    // Stillstand nicht alle starr nach rechts, sondern behalten ihre
    // Ausrichtung (wird wie ruinsKnown periodisch aufgeraeumt).
    this.shipAngles = new Map();
    // Minimap-Canvas (optional; im Solo/Online-Spiel vorhanden)
    this.mini = document.getElementById('minimap');
    this.miniCtx = this.mini ? this.mini.getContext('2d') : null;
    // Offscreen-Canvas in Kartenaufloesung: hier wird die Karte pixelgenau
    // gehalten (this.img = Rohpixel), spaeter hochskaliert aufs sichtbare Canvas.
    const { w, h } = game.map;
    this.off = document.createElement('canvas');
    this.off.width = w;
    this.off.height = h;
    this.offCtx = this.off.getContext('2d');
    this.img = this.offCtx.createImageData(w, h);
    this.imgDirty = true;   // muss img erst wieder ins Offscreen-Canvas geschrieben werden?

    // Spielerfarben vorab in RGB umrechnen (normal + abgedunkelt fuer Kanten,
    // + Zwischenton fuer den Grenzsaum + aufgehellt fuer die Innenflaeche)
    this.colors = game.players.map(p => hexToRgb(p.color));
    this.colorsEdge = this.colors.map(c => darken(c, 0.62));
    this.colorsSeam = this.colors.map(c => darken(c, 0.82));
    this.colorsLight = this.colors.map(c => [
      Math.min(255, c[0] * 1.08) | 0, Math.min(255, c[1] * 1.08) | 0, Math.min(255, c[2] * 1.08) | 0]);

    // Statische Gelaende-Details (Wassertiefe + Rauschen) einmal vorberechnen
    this.computeTerrainDetail();

    // Cache fuer die Namens-Label-Positionen (groesste Flaeche je Spieler),
    // wird nur periodisch neu berechnet (siehe updateLabels).
    this.labelCache = new Map();
    this.lastLabelUpdate = -Infinity;

    this.resize();
    // Start: Karte einpassen (scale = Zoom, ox/oy = Verschiebung/Pan)
    // x3: die Karte startet dreimal so groß / reingezoomt wie vorher.
    const s = Math.min(canvas.width / w, canvas.height / h) * 0.95 * 3;
    this.scale = s;
    this.ox = (canvas.width - w * s) / 2;
    this.oy = (canvas.height - h * s) / 2;

    this.repaintAll();
  }

  // Canvas an die Fenstergroesse anpassen (bei Start und Resize).
  resize() {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
    // Vignette (dezente Randabdunklung) einmal pro Groesse vorberechnen,
    // damit pro Frame nur ein fillRect noetig ist.
    const w = this.canvas.width, h = this.canvas.height;
    const vg = this.ctx.createRadialGradient(
      w / 2, h / 2, Math.min(w, h) * 0.42, w / 2, h / 2, Math.hypot(w, h) / 2);
    vg.addColorStop(0, 'rgba(6, 12, 20, 0)');
    vg.addColorStop(1, 'rgba(6, 12, 20, 0.26)');
    this.vignette = vg;
  }

  // Statische Gelaende-Details einmal vorberechnen – rein optisch, die
  // Simulation kennt weiterhin nur Wasser/Land:
  // - depth: Wasser-Abstand zur Kueste (1..8, BFS) fuer den Tiefenverlauf
  // - noise: Hell-Dunkel-Rauschen je Zelle (grobe Flecken + feines Korn)
  // - sparkles: wenige Wasserzellen fuer den animierten Wellen-Schimmer
  computeTerrainDetail() {
    const { w, h, terrain } = this.game.map;
    const n = w * h;
    const depth = new Uint8Array(n);
    const queue = [];
    for (let c = 0; c < n; c++) {
      if (terrain[c] !== 0) continue;
      const x = c % w, y = (c / w) | 0;
      if ((x > 0 && terrain[c - 1] === 1) || (x < w - 1 && terrain[c + 1] === 1) ||
          (y > 0 && terrain[c - w] === 1) || (y < h - 1 && terrain[c + w] === 1)) {
        depth[c] = 1;
        queue.push(c);
      }
    }
    for (let qi = 0; qi < queue.length; qi++) {
      const c = queue[qi];
      const d = depth[c];
      if (d >= 8) continue;
      const x = c % w, y = (c / w) | 0;
      if (x > 0 && terrain[c - 1] === 0 && depth[c - 1] === 0) { depth[c - 1] = d + 1; queue.push(c - 1); }
      if (x < w - 1 && terrain[c + 1] === 0 && depth[c + 1] === 0) { depth[c + 1] = d + 1; queue.push(c + 1); }
      if (y > 0 && terrain[c - w] === 0 && depth[c - w] === 0) { depth[c - w] = d + 1; queue.push(c - w); }
      if (y < h - 1 && terrain[c + w] === 0 && depth[c + w] === 0) { depth[c + w] = d + 1; queue.push(c + w); }
    }
    this.depth = depth;

    const noise = new Float32Array(n);
    const seed = this.game.seed | 0;
    const sparkles = [];
    const surf = [];   // Uferzellen (depth 1) fuer den Brandungs-Schaum
    const lt = this.game.map.landType || null; // Gelaendetypen (0 Grün, 1 Hügel, 2 Gebirge)
    const peaks = new Uint8Array(n);           // helle Felsspitzen-Maske (Gebirge)
    this.mountains = []; // Gebirgszellen (Zoom-Relief: Dreiecke)
    this.hills = [];     // Huegelzellen, ausgeduennt (Zoom-Relief: Kuppen)
    // Jeder Relief-Eintrag bekommt einen stabilen Hash h in [0,1), mit dem
    // beim Zeichnen je nach Zoomstufe gleichmaessig ausgeduennt wird.
    for (let c = 0; c < n; c++) {
      const x = c % w, y = (c / w) | 0;
      const patch = hash2(x >> 2, y >> 2, seed);       // 4x4-Flecken (Gelaende-Toene)
      const grain = hash2(x, y, seed ^ 0x9e37);        // feines Korn
      noise[c] = (patch - 0.5) * 0.65 + (grain - 0.5) * 0.35; // -0.5 .. 0.5
      // Schimmer-Zellen: ~1.4 % der Wasserzellen, Phase aus dem Hash ableiten
      if (terrain[c] === 0) {
        const g2 = hash2(x, y, seed ^ 0x5f2b);
        if (g2 > 0.986) sparkles.push({ x, y, phase: g2 * 40 });
        // Brandung: gut die Haelfte der direkten Uferzellen (depth 1) als
        // pulsierender Schaum-Saum; eigener Hash, damit Schaum & Schimmer
        // nicht korrelieren.
        if (depth[c] === 1) {
          const g3 = hash2(x, y, seed ^ 0x2c1b);
          if (g3 > 0.42) surf.push({ x, y, phase: g3 * 6.28 });
        }
      } else if (lt) {
        // Gelaende-Relief vorberechnen (statisch, nur einmal noetig)
        if (lt[c] === 2) {
          if (hash2(x, y, seed ^ 0x77) > 0.72) peaks[c] = 1;
          this.mountains.push({ x, y, h: hash2(x, y, seed ^ 0x66) });
        } else if (lt[c] === 1 && hash2(x, y, seed ^ 0x51) > 0.55) {
          this.hills.push({ x, y, h: hash2(x, y, seed ^ 0x66) });
        }
      }
    }
    this.noise = noise;
    this.sparkles = sparkles;
    this.surf = surf;
    this.peaks = peaks;
    this.landTypes = lt;
  }

  // Eine Zelle in die Rohpixel (this.img) schreiben (4 Bytes: R,G,B,A).
  // Wasser: Tiefenverlauf (Kueste hell -> See dunkel) + leichtes Rauschen,
  // direkt am Land ein heller "Lagunen"-Saum.
  // Neutrales Land: deutlich strukturiert, Kuestenzellen als sandiger Strand.
  // Reiche: Spielerfarbe, innen dezent aufgehellt; Grenzen zweistufig
  // (dunkle Kante + dunklerer Saum dahinter); am Wasser ein Kuestenschatten.
  paintCell(c) {
    const g = this.game;
    const w = g.map.w, h = g.map.h;
    let r, gr, b;
    if (g.map.terrain[c] === 0) {
      const t = Math.min(1, (this.depth[c] - 1) / 7);  // 0 = Kueste, 1 = offene See
      // Lagunen-Effekt: die ersten beiden Wasser-Ringe um Land aufhellen
      const boost = this.depth[c] === 1 ? 1.16 : this.depth[c] === 2 ? 1.06 : 1;
      const f = (1 + this.noise[c] * 0.08) * boost;
      r = (WATER_SHALLOW[0] + (WATER_DEEP[0] - WATER_SHALLOW[0]) * t) * f;
      gr = (WATER_SHALLOW[1] + (WATER_DEEP[1] - WATER_SHALLOW[1]) * t) * f;
      b = (WATER_SHALLOW[2] + (WATER_DEEP[2] - WATER_SHALLOW[2]) * t) * f;
    } else {
      const o = g.owner[c];
      const x = c % w, y = (c / w) | 0;
      // Randzellen dunkler zeichnen (Grenzen sichtbar machen): eine Zelle ist
      // "Rand", wenn eine angrenzende Landzelle einem anderen Besitzer gehoert.
      let edge = false, coast = false;
      if (x > 0) { if (g.map.terrain[c - 1] === 0) coast = true; else if (g.owner[c - 1] !== o) edge = true; }
      if (x < w - 1) { if (g.map.terrain[c + 1] === 0) coast = true; else if (g.owner[c + 1] !== o) edge = true; }
      if (y > 0) { if (g.map.terrain[c - w] === 0) coast = true; else if (g.owner[c - w] !== o) edge = true; }
      if (y < h - 1) { if (g.map.terrain[c + w] === 0) coast = true; else if (g.owner[c + w] !== o) edge = true; }
      // "Saum": keine Randzelle, aber direkt hinter einer Randzelle – wird
      // halbdunkel gezeichnet, dadurch wirken Grenzen weicher (2 Zonen).
      // Prueft, ob ein gleichfarbiger Nachbar selbst eine Randzelle ist.
      let seam = false;
      if (o >= 0 && !edge) {
        const isBorder = nb => {
          if (g.map.terrain[nb] !== 1 || g.owner[nb] !== o) return false;
          const nx = nb % w, ny = (nb / w) | 0;
          return (nx > 0 && g.map.terrain[nb - 1] === 1 && g.owner[nb - 1] !== o) ||
                 (nx < w - 1 && g.map.terrain[nb + 1] === 1 && g.owner[nb + 1] !== o) ||
                 (ny > 0 && g.map.terrain[nb - w] === 1 && g.owner[nb - w] !== o) ||
                 (ny < h - 1 && g.map.terrain[nb + w] === 1 && g.owner[nb + w] !== o);
        };
        if (x > 0) seam = isBorder(c - 1);
        if (!seam && x < w - 1) seam = isBorder(c + 1);
        if (!seam && y > 0) seam = isBorder(c - w);
        if (!seam && y < h - 1) seam = isBorder(c + w);
      }
      let base;
      let amp; // Staerke des Rauschens
      if (o < 0) {
        base = coast && !edge ? SAND : edge ? NEUTRAL_EDGE : NEUTRAL;
        amp = 0.16;
      } else {
        base = edge ? this.colorsEdge[o] : seam ? this.colorsSeam[o] : this.colorsLight[o];
        amp = 0.09;
      }
      // Gelaende-Toenung: Huegel erdig, Gebirge felsgrau mit hellen Spitzen.
      // Auf Spielerland deutlich schwächer eingemischt, damit die Reichsfarbe
      // (und damit die Territorien) dominant lesbar bleibt.
      const lt = this.landTypes ? this.landTypes[c] : 0;
      if (lt === 1) {
        base = mixRgb(base, HILLS_TINT, o < 0 ? 0.5 : 0.2);
      } else if (lt === 2) {
        base = mixRgb(base, MOUNT_TINT, o < 0 ? 0.62 : 0.32);
        amp += 0.07; // mehr Struktur im Fels
        if (this.peaks[c]) base = mixRgb(base, PEAK_TINT, o < 0 ? 0.5 : 0.3);
      }
      // Kuestenschatten auf Spieler-Land (Plastizitaet der Inseln)
      const shore = o >= 0 && coast && !edge ? 0.88 : 1;
      const f = (1 + this.noise[c] * amp) * shore;
      r = base[0] * f;
      gr = base[1] * f;
      b = base[2] * f;
    }
    const i = c * 4;
    const D = this.img.data;
    D[i] = r > 255 ? 255 : r;
    D[i + 1] = gr > 255 ? 255 : gr;
    D[i + 2] = b > 255 ? 255 : b;
    D[i + 3] = 255;
  }

  // Komplette Karte neu einfaerben (nur zum Start noetig).
  repaintAll() {
    const n = this.game.map.w * this.game.map.h;
    for (let c = 0; c < n; c++) this.paintCell(c);
    this.imgDirty = true;
  }

  // Geänderte Zellen + Umkreis neu einfärben (wegen Grenz-Schattierung).
  // Es muss der 2er-Ring (5x5-Block) mit, weil sich durch die Saum-Logik
  // (paintCell) auch Zellen zwei Schritte neben einer Grenzaenderung
  // umfaerben koennen.
  markDirty(cells) {
    if (!cells.length) return;
    const w = this.game.map.w, h = this.game.map.h;
    for (const c of cells) {
      const x = c % w, y = (c / w) | 0;
      const x0 = Math.max(0, x - 2), x1 = Math.min(w - 1, x + 2);
      const y0 = Math.max(0, y - 2), y1 = Math.min(h - 1, y + 2);
      for (let yy = y0; yy <= y1; yy++)
        for (let xx = x0; xx <= x1; xx++)
          this.paintCell(yy * w + xx);
    }
    this.imgDirty = true;
    // Eroberungs-Funken: eine kleine Stichprobe der umgefaerbten Zellen als
    // aufsteigende Gluehpartikel (Farbe = neuer Besitzer, Aschton bei
    // neutral/verbrannt). Gedeckelt, damit grosse Eroberungen nicht flackern.
    if (this.animations && this.particles.length < 420) {
      const step = Math.max(1, Math.floor(cells.length / 16));
      const now = performance.now();
      for (let i = 0; i < cells.length; i += step) {
        const c = cells[i];
        if (this.game.map.terrain[c] !== 1) continue;
        const o = this.game.owner[c];
        this.particles.push({
          x: c % w + 0.5, y: ((c / w) | 0) + 0.5,
          dx: (Math.random() - 0.5) * 1.4, dy: -(1.6 + Math.random() * 2.2),
          born: now, life: 550 + Math.random() * 450,
          size: 0.5 + Math.random() * 0.55, alpha: 0.5,
          color: o >= 0 ? this.game.players[o].color : '#9a917e',
        });
      }
    }
  }

  // Bildschirm-Pixel (Maus) in eine Karten-Zellennummer umrechnen (-1 = daneben).
  screenToCell(mx, my) {
    const x = Math.floor((mx - this.ox) / this.scale);
    const y = Math.floor((my - this.oy) / this.scale);
    const { w, h } = this.game.map;
    if (x < 0 || y < 0 || x >= w || y >= h) return -1;
    return y * w + x;
  }

  // Zoomen um den Punkt (mx, my): scale aendern, aber so, dass die Kartenstelle
  // unter der Maus an Ort und Stelle bleibt. Zoom ist nach oben/unten begrenzt.
  zoomAt(mx, my, factor) {
    const { w, h } = this.game.map;
    const minScale = Math.min(this.canvas.width / w, this.canvas.height / h) * 0.5;
    const ns = Math.max(minScale, Math.min(24, this.scale * factor));
    const f = ns / this.scale;
    this.ox = mx - (mx - this.ox) * f;
    this.oy = my - (my - this.oy) * f;
    this.scale = ns;
  }

  // Karte verschieben (Tastatur/Drag).
  pan(dx, dy) {
    this.ox += dx;
    this.oy += dy;
  }

  // Ansicht auf eine Kartenposition zentrieren (für Minimap-Klicks)
  centerOn(mapX, mapY) {
    this.ox = this.canvas.width / 2 - mapX * this.scale;
    this.oy = this.canvas.height / 2 - mapY * this.scale;
  }

  // Fuer jeden Spieler die groesste zusammenhaengende Landflaeche finden
  // (Flood-Fill ueber gleich-besitzte, benachbarte Landzellen) und deren
  // Schwerpunkt (Mittelpunkt) merken. Laeuft nur ~1x/Sekunde, nicht pro Frame,
  // da ein voller Durchlauf ueber die Karte etwas kostet.
  updateLabels(now) {
    if (now - this.lastLabelUpdate < 1000) return;
    this.lastLabelUpdate = now;

    const g = this.game;
    const w = g.map.w, h = g.map.h;
    const n = w * h;
    const visited = new Uint8Array(n);
    const bestByOwner = new Map(); // idx -> { count, x, y }
    const stack = [];

    for (let start = 0; start < n; start++) {
      if (visited[start]) continue;
      if (g.map.terrain[start] !== 1 || g.owner[start] < 0) { visited[start] = 1; continue; }

      const o = g.owner[start];
      visited[start] = 1;
      stack.length = 0;
      stack.push(start);
      let count = 0, sx = 0, sy = 0;

      while (stack.length) {
        const c = stack.pop();
        count++;
        sx += c % w;
        sy += (c / w) | 0;
        const x = c % w, y = (c / w) | 0;
        if (x > 0) {
          const nb = c - 1;
          if (!visited[nb] && g.map.terrain[nb] === 1 && g.owner[nb] === o) { visited[nb] = 1; stack.push(nb); }
        }
        if (x < w - 1) {
          const nb = c + 1;
          if (!visited[nb] && g.map.terrain[nb] === 1 && g.owner[nb] === o) { visited[nb] = 1; stack.push(nb); }
        }
        if (y > 0) {
          const nb = c - w;
          if (!visited[nb] && g.map.terrain[nb] === 1 && g.owner[nb] === o) { visited[nb] = 1; stack.push(nb); }
        }
        if (y < h - 1) {
          const nb = c + w;
          if (!visited[nb] && g.map.terrain[nb] === 1 && g.owner[nb] === o) { visited[nb] = 1; stack.push(nb); }
        }
      }

      const cur = bestByOwner.get(o);
      if (!cur || count > cur.count) {
        bestByOwner.set(o, { count, x: sx / count, y: sy / count });
      }
    }

    this.labelCache = bestByOwner;
  }

  // Spielernamen zentriert auf der groessten Flaeche zeichnen (Bildschirm-
  // koordinaten, analog zu drawBadges — daher nach dem Zuruecksetzen der
  // Transform aufrufen). Cinzel-Schrift wie im Menü, weiss mit dunklem
  // Outline, darunter ein kurzer Balken in Spielerfarbe.
  drawLabels(ctx) {
    const g = this.game;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';

    // Das flaechengroesste lebende Reich bekommt eine kleine goldene Krone
    // ueber den Namen (sichtbare Fuehrungsmarkierung wie im Menue-Stil).
    let crownIdx = -1, crownCount = 0;
    for (const [idx, info] of this.labelCache) {
      const p = g.players[idx];
      if (p && p.alive && info.count > crownCount) { crownCount = info.count; crownIdx = idx; }
    }

    for (const [idx, info] of this.labelCache) {
      const p = g.players[idx];
      if (!p || !p.alive) continue;

      const px = info.x * this.scale + this.ox;
      const py = info.y * this.scale + this.oy;
      if (px < -100 || py < -40 || px > this.canvas.width + 100 || py > this.canvas.height + 40) continue;

      // Schriftgroesse waechst mit Flaeche & Zoom, aber begrenzt (nicht zu klein/gross)
      const areaScale = Math.sqrt(info.count) * this.scale;
      const fontSize = Math.max(9, Math.min(22, areaScale * 0.28));
      if (fontSize < 9.5) continue; // zu winzig -> weglassen statt Buchstabensalat

      // Krone ueber dem Label des groessten Reichs (Zinnen-Polygon, gold)
      if (idx === crownIdx && fontSize >= 11) {
        const cw = fontSize * 0.85, ch = fontSize * 0.5;
        const ky = py - fontSize * 0.85;
        ctx.beginPath();
        ctx.moveTo(px - cw / 2, ky);
        ctx.lineTo(px - cw / 2, ky - ch * 0.6);
        ctx.lineTo(px - cw * 0.22, ky - ch * 0.22);
        ctx.lineTo(px, ky - ch);
        ctx.lineTo(px + cw * 0.22, ky - ch * 0.22);
        ctx.lineTo(px + cw / 2, ky - ch * 0.6);
        ctx.lineTo(px + cw / 2, ky);
        ctx.closePath();
        ctx.fillStyle = '#ffd60a';
        ctx.strokeStyle = 'rgba(8, 14, 24, 0.9)';
        ctx.lineWidth = 1;
        ctx.fill();
        ctx.stroke();
      }

      ctx.font = `700 ${fontSize}px 'Cinzel', serif`;
      // Outline fuer Lesbarkeit auf jeder Territoriumsfarbe
      ctx.lineWidth = Math.max(2, fontSize * 0.22);
      ctx.strokeStyle = 'rgba(8, 14, 24, 0.9)';
      ctx.strokeText(p.name, px, py);
      ctx.fillStyle = '#f4efe2';
      ctx.fillText(p.name, px, py);
      // Kurzer Balken in Spielerfarbe unter dem Namen
      const tw = ctx.measureText(p.name).width;
      ctx.fillStyle = p.color;
      ctx.fillRect(px - tw * 0.3, py + fontSize * 0.62, tw * 0.6, Math.max(1.5, fontSize * 0.11));
    }
    ctx.restore();
  }

  // Ein kompletter Frame: Hintergrund, hochskalierte Karte, Overlays (in
  // Kartenkoordinaten), danach Badges/Labels/Minimap (in Bildschirmkoordinaten).
  draw(now = performance.now()) {
    // Nur wenn sich Zellen geaendert haben, die Rohpixel ins Offscreen schreiben.
    if (this.imgDirty) {
      this.offCtx.putImageData(this.img, 0, 0);
      this.imgDirty = false;
    }
    const ctx = this.ctx;
    ctx.fillStyle = '#0e2136';           // an den tiefen Wasserton angelehnt
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.imageSmoothingEnabled = false;   // harte Pixel statt Weichzeichnen
    // Transform = Zoom + Pan: ab hier wird in Kartenkoordinaten gezeichnet.
    ctx.setTransform(this.scale, 0, 0, this.scale, this.ox, this.oy);
    ctx.drawImage(this.off, 0, 0);       // die ganze Karte in einem Rutsch
    this.drawShimmer(ctx, now);          // pulsierende Lichtpunkte auf dem Wasser
    this.drawOverlays(ctx, now);         // Gebaeude/Schiffe/Zuege darueber
    this.drawProjectiles(ctx, now);      // fliegende Turm-Geschosse
    this.drawParticles(ctx, now);        // Eroberungs-Funken & Ruinen-Staub
    ctx.setTransform(1, 0, 0, 1, 0, 0);  // zurueck zu Bildschirmkoordinaten
    // Vignette: dezente Abdunklung der Bildschirmraender ueber der Karte,
    // aber unter Badges/Labels.
    ctx.fillStyle = this.vignette;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    this.drawBadges(ctx, now);
    this.drawAttackArrows(ctx, now);     // Richtungspfeile laufender Angriffe

    this.updateLabels(now);              // Flaechen-Schwerpunkte periodisch neu berechnen
    this.drawLabels(ctx);                // Spielernamen auf groesster Flaeche

    // Shift-Auswahlrechteck (Bildschirmkoordinaten, von main.js gesetzt)
    if (this.selectRect) {
      const r = this.selectRect;
      const x = Math.min(r.x0, r.x1), y = Math.min(r.y0, r.y1);
      const rw = Math.abs(r.x1 - r.x0), rh = Math.abs(r.y1 - r.y0);
      ctx.fillStyle = 'rgba(244, 162, 97, 0.15)';
      ctx.fillRect(x, y, rw, rh);
      ctx.strokeStyle = '#f4a261';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x, y, rw, rh);
    }

    this.drawMinimap();
  }

  // Wellen-Schimmer: wenige vorberechnete Wasserzellen (this.sparkles) als
  // pulsierende Lichtpunkte. Nur der sichtbare Ausschnitt wird gezeichnet;
  // die Pixelkarte selbst bleibt statisch (kein teures Repaint).
  // Bei ausgeschalteten Animationen: statischer, schwacher Schimmer.
  drawShimmer(ctx, now) {
    const vx0 = -this.ox / this.scale - 1, vy0 = -this.oy / this.scale - 1;
    const vx1 = vx0 + this.canvas.width / this.scale + 2;
    const vy1 = vy0 + this.canvas.height / this.scale + 2;
    // Statt pro Zelle globalAlpha zu wechseln und einzeln zu fuellen:
    // Alpha auf 1/48-Stufen quantisieren (Fehler <= ~0.01, praktisch
    // unsichtbar) und alle Zellen einer Stufe in EINEM Pfad fuellen.
    const buckets = new Map(); // quantisiertes Alpha -> [x0, y0, x1, y1, ...]
    const push = (a, x, y) => {
      const q = Math.round(a * 48) / 48;
      let pts = buckets.get(q);
      if (!pts) buckets.set(q, pts = []);
      pts.push(x, y);
    };
    const flush = () => {
      for (const [q, pts] of buckets) {
        ctx.globalAlpha = q;
        ctx.beginPath();
        for (let i = 0; i < pts.length; i += 2) ctx.rect(pts[i], pts[i + 1], 1, 1);
        ctx.fill();
      }
      buckets.clear();
    };
    // Brandung: Schaum-Saum entlang der Kuesten (vor den Lichtpunkten, da
    // er groessere Flaechen abdeckt). Sanftes, phasenversetztes Pulsieren.
    if (this.surf.length) {
      ctx.fillStyle = '#eaf6ff';
      for (const sf of this.surf) {
        if (sf.x < vx0 || sf.x > vx1 || sf.y < vy0 || sf.y > vy1) continue;
        push(this.animations
          ? 0.05 + 0.15 * (0.5 + 0.5 * Math.sin(now / 900 + sf.phase))
          : 0.08, sf.x, sf.y);
      }
      flush();
    }
    if (!this.sparkles.length) { ctx.globalAlpha = 1; return; }
    ctx.fillStyle = '#dff3ff';
    for (const sp of this.sparkles) {
      if (sp.x < vx0 || sp.x > vx1 || sp.y < vy0 || sp.y > vy1) continue;
      push(this.animations
        ? 0.08 + 0.3 * (0.5 + 0.5 * Math.sin(now / 750 + sp.phase))
        : 0.14, sp.x, sp.y);
    }
    flush();
    ctx.globalAlpha = 1;
  }

  // Kosmetische Partikel (Eroberungs-Funken, Ruinen-Staub) in Karten-
  // koordinaten. Position/Alpha ergeben sich aus der Lebenszeit t = 0..1,
  // abgelaufene Partikel werden per Swap-Pop entfernt.
  drawParticles(ctx, now) {
    const ps = this.particles;
    if (!ps.length) return;
    for (let i = ps.length - 1; i >= 0; i--) {
      const p = ps[i];
      const t = (now - p.born) / p.life;
      if (t >= 1) { ps[i] = ps[ps.length - 1]; ps.pop(); continue; }
      ctx.globalAlpha = (1 - t) * p.alpha;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x + p.dx * t, p.y + p.dy * t, p.size * (1 - t * 0.55), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // Fliegende Geschosse (Kartenkoordinaten): Turm-Projektile und Katapult-
  // Felsbrocken. Neue Schuesse erkennt der Renderer an b.lastShot.turn (siehe
  // Engine 'tower_shoot') bzw. cp.lastShot.turn (siehe processCatapults);
  // jedes Geschoss fliegt in einem Bogen zum Ziel und verpufft dort in einem
  // kleinen Burst. Laeuft auch fuer gegnerische Einheiten – so sind alle
  // Schuesse auf der Karte sichtbar.
  drawProjectiles(ctx, now) {
    if (!this.animations) { this.projectiles.length = 0; return; }
    const g = this.game, w = g.map.w;
    for (const b of g.buildings) {
      if (b.kind !== 'tower' || !b.lastShot) continue;
      if (this.towerShotsSeen.get(b.cell) === b.lastShot.turn) continue;
      this.towerShotsSeen.set(b.cell, b.lastShot.turn);
      const x0 = b.cell % w + 0.5, y0 = ((b.cell / w) | 0) + 0.5;
      const x1 = b.lastShot.target % w + 0.5, y1 = ((b.lastShot.target / w) | 0) + 0.5;
      const dist = Math.hypot(x1 - x0, y1 - y0);
      if (dist < 1) continue;
      this.projectiles.push({
        x0, y0, x1, y1, dist, ammo: b.lastShot.ammo, born: now,
        dur: Math.min(1400, Math.max(320, dist * 14)), // weiter Schuss = laengerer Flug
      });
      // Mündungsblitz am Turm: kurzer heller Aufleucht-Blitz (in Munitions-
      // farbe) plus eine kleine, laenger nachziehende Rauchfahne.
      const mcol = b.lastShot.ammo === 'fire' ? '#ffb347' : b.lastShot.ammo === 'arrow' ? '#fff2c0' : '#f4e8c8';
      for (let k = 0; k < 3; k++) {
        this.particles.push({
          x: x0 + (Math.random() - 0.5) * 0.6, y: y0 - 2 + (Math.random() - 0.5) * 0.6,
          dx: (Math.random() - 0.5) * 0.8, dy: -(0.8 + Math.random() * 1.2),
          born: now, life: 140 + Math.random() * 120,
          size: 0.7 + Math.random() * 0.5, alpha: 0.95, color: mcol,
        });
      }
      for (let k = 0; k < 2; k++) {
        this.particles.push({
          x: x0 + (Math.random() - 0.5) * 0.8, y: y0 - 2.4,
          dx: (Math.random() - 0.5) * 0.5, dy: -(0.5 + Math.random() * 0.8),
          born: now, life: 500 + Math.random() * 350,
          size: 0.5 + Math.random() * 0.4, alpha: 0.4, color: '#c8c2b4',
        });
      }
    }
    // Katapult-Felsbrocken: schwerer, hoeher und langsamer als Turm-Geschosse.
    // Beim Spawn wird zugleich der Wurfarm-Rueckschwung am Katapult gestartet.
    if (this.catapultShotsSeen.size > g.catapults.length + 30) {
      const ids = new Set(g.catapults.map(cp => cp.id));
      for (const id of this.catapultShotsSeen.keys()) if (!ids.has(id)) this.catapultShotsSeen.delete(id);
    }
    for (const cp of g.catapults) {
      if (!cp.lastShot) continue;
      if (this.catapultShotsSeen.get(cp.id) === cp.lastShot.turn) continue;
      this.catapultShotsSeen.set(cp.id, cp.lastShot.turn);
      const x0 = cp.cell % w + 0.5, y0 = ((cp.cell / w) | 0) + 0.5;
      const x1 = cp.lastShot.target % w + 0.5, y1 = ((cp.lastShot.target / w) | 0) + 0.5;
      const dist = Math.hypot(x1 - x0, y1 - y0);
      if (dist < 1) continue;
      this.projectiles.push({
        x0, y0, x1, y1, dist, ammo: 'boulder', born: now,
        dur: Math.min(1600, Math.max(400, dist * 18)), // Wurfstein fliegt traeger
      });
      this.catapultArmAnim.set(cp.id, now);
    }
    if (!this.projectiles.length) return;
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const pr = this.projectiles[i];
      const t = (now - pr.born) / pr.dur;
      if (t >= 1) {
        // Einschlag: kleiner Burst in Munitionsfarbe am Zielpunkt
        const col = pr.ammo === 'fire' ? '#ff7b33' : pr.ammo === 'arrow' ? '#e8d8a8'
          : pr.ammo === 'boulder' ? '#8a7a5c' : '#b8b0a0';
        for (let k = 0; k < 7; k++) {
          const ang = Math.random() * Math.PI * 2, d = 1 + Math.random() * 1.8;
          this.particles.push({
            x: pr.x1, y: pr.y1,
            dx: Math.cos(ang) * d, dy: Math.sin(ang) * d - 1,
            born: now, life: 350 + Math.random() * 250,
            size: 0.45 + Math.random() * 0.4, alpha: 0.7, color: col,
          });
        }
        this.projectiles.splice(i, 1);
        continue;
      }
      // Bahn: linear zum Ziel, darueber ein Hoehenbogen (Steilwurf-Optik);
      // der Bogen ist bei kurzen Schuessen gedeckelt, sonst wirkt er albern.
      // Felsbrocken fliegen sichtbar hoeher als Turm-Munition.
      const arc = pr.ammo === 'boulder' ? Math.min(9, pr.dist * 0.3) : Math.min(6, pr.dist * 0.22);
      // Glutschweif: drei Punkte entlang der Bahn, der vorderste ist die Spitze
      for (let k = 2; k >= 0; k--) {
        const tk = Math.max(0, t - k * 0.025);
        const kx = pr.x0 + (pr.x1 - pr.x0) * tk;
        const ky = pr.y0 + (pr.y1 - pr.y0) * tk - Math.sin(Math.PI * tk) * arc;
        if (pr.ammo === 'fire') ctx.fillStyle = k ? `rgba(255, 140, 60, ${0.5 - k * 0.18})` : '#ffcf6e';
        else if (pr.ammo === 'arrow') ctx.fillStyle = k ? `rgba(230, 216, 168, ${0.42 - k * 0.14})` : '#efe6c4';
        else if (pr.ammo === 'boulder') ctx.fillStyle = k ? `rgba(120, 105, 85, ${0.5 - k * 0.18})` : '#9c8b6a';
        else ctx.fillStyle = k ? `rgba(190, 182, 168, ${0.42 - k * 0.14})` : '#cfc8ba';
        ctx.beginPath();
        ctx.arc(kx, ky, (pr.ammo === 'boulder' ? 1.15 : pr.ammo === 'stone' ? 0.85 : 0.6) * (1 - k * 0.28), 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // Truppen-Badges für laufende Angriffe und Boote (in Bildschirmkoordinaten)
  drawBadges(ctx, now) {
    const g = this.game;
    const w = g.map.w;
    // Hilfsfunktion: eine kleine beschriftete Pille an Kartenposition
    // (mapX, mapY) zeichnen. Ausserhalb des Sichtfensters wird uebersprungen.
    // pulse = true laesst die Pille leicht atmen (laufende Angriffe).
    const badge = (mapX, mapY, label, color, pulse = false) => {
      const px = mapX * this.scale + this.ox;
      const py = mapY * this.scale + this.oy;
      if (px < -60 || py < -30 || px > this.canvas.width + 60 || py > this.canvas.height + 30) return;
      ctx.save();
      if (pulse && this.animations) {
        const f = 1 + 0.06 * Math.sin(now / 300);
        ctx.translate(px, py); ctx.scale(f, f); ctx.translate(-px, -py);
      }
      ctx.font = 'bold 11px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const tw = ctx.measureText(label).width;
      const bw = tw + 14, bh = 19;
      // Pille mit weichem Schatten, danach Rand in Spielerfarbe
      ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
      ctx.shadowBlur = 5;
      ctx.shadowOffsetY = 1;
      ctx.fillStyle = 'rgba(10, 20, 32, 0.85)';
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(px - bw / 2, py - bh / 2, bw, bh, bh / 2);
      else ctx.rect(px - bw / 2, py - bh / 2, bw, bh);
      ctx.fill();
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
      ctx.shadowOffsetY = 0;
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(px - bw / 2, py - bh / 2, bw, bh, bh / 2);
      else ctx.rect(px - bw / 2, py - bh / 2, bw, bh);
      ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.fillText(label, px, py + 0.5);
      ctx.restore();
    };
    // Pro Angriff eine Badge am Schwerpunkt der Front (⚔ + Truppenzahl)
    for (const atk of g.attacks) {
      if (atk.frontier.size === 0) continue;
      let sx = 0, sy = 0, n = 0;
      for (const c of atk.frontier) {
        sx += c % w;
        sy += (c / w) | 0;
        if (++n >= 150) break; // Stichprobe reicht für den Schwerpunkt
      }
      badge(sx / n + 0.5, sy / n + 0.5, '⚔ ' + fmt(atk.pool), g.players[atk.attacker].color, true);
    }
    // Pro Transportboot eine Badge (🚢 + Truppenzahl) an der aktuellen Position
    for (const boat of g.boats) {
      const c = boat.path[Math.min(boat.path.length - 1, boat.pos | 0)];
      badge(c % w + 0.5, ((c / w) | 0) - 2.5, '🚢 ' + fmt(boat.troops), g.players[boat.owner].color);
    }
  }

  // Richtungspfeile laufender Angriffe (Bildschirmkoordinaten): eine animierte
  // gestrichelte Linie ("marschierende Ameisen") vom Zentrum des Angreifers
  // zum Schwerpunkt der Front, mit Pfeilspitze am Ziel. Macht auf einen Blick
  // sichtbar, wer wen angreift.
  drawAttackArrows(ctx, now) {
    const g = this.game;
    const w = g.map.w;
    ctx.save();
    ctx.lineCap = 'round';
    for (const atk of g.attacks) {
      if (!atk.frontier.size) continue;
      const src = this.labelCache.get(atk.attacker);
      if (!src) continue; // Angreifer ohne nennenswerte Flaeche -> kein Pfeil
      let sx = 0, sy = 0, n = 0;
      for (const c of atk.frontier) {
        sx += c % w;
        sy += (c / w) | 0;
        if (++n >= 150) break;
      }
      const x0 = src.x * this.scale + this.ox, y0 = src.y * this.scale + this.oy;
      const x1 = (sx / n + 0.5) * this.scale + this.ox, y1 = (sy / n + 0.5) * this.scale + this.oy;
      const dx = x1 - x0, dy = y1 - y0;
      const len = Math.hypot(dx, dy);
      if (len < 40) continue; // Front fast am Zentrum -> Linie waere nur ein Punkt
      const ux = dx / len, uy = dy / len;
      const ax = x0 + ux * 26, ay = y0 + uy * 26;   // startet neben dem Label
      const bx = x1 - ux * 14, by = y1 - uy * 14;   // endet vor der Badge
      const col = g.players[atk.attacker].color;
      ctx.strokeStyle = hexA(col, 0.5);
      ctx.lineWidth = 2;
      ctx.setLineDash([7, 7]);
      if (this.animations) ctx.lineDashOffset = -(now / 60) % 14;
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
      ctx.setLineDash([]);
      // Pfeilspitze am Ziel
      ctx.fillStyle = hexA(col, 0.75);
      const pxn = -uy, pyn = ux;
      ctx.beginPath();
      ctx.moveTo(bx + ux * 8, by + uy * 8);
      ctx.lineTo(bx - ux * 4 + pxn * 4.5, by - uy * 4 + pyn * 4.5);
      ctx.lineTo(bx - ux * 4 - pxn * 4.5, by - uy * 4 - pyn * 4.5);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  // Minimap mit Sichtfenster-Rahmen: die Karte verkleinert plus ein weisses
  // Rechteck, das den aktuell sichtbaren Ausschnitt markiert.
  drawMinimap() {
    if (!this.miniCtx) return;
    const m = this.mini, mctx = this.miniCtx;
    mctx.imageSmoothingEnabled = false;
    mctx.fillStyle = '#0e2136';
    mctx.fillRect(0, 0, m.width, m.height);
    mctx.drawImage(this.off, 0, 0, m.width, m.height);
    // Sichtfenster-Rechteck: aktueller Ausschnitt in Minimap-Koordinaten
    const fx = m.width / this.game.map.w, fy = m.height / this.game.map.h;
    const x0 = (-this.ox / this.scale) * fx;
    const y0 = (-this.oy / this.scale) * fy;
    const vw = (this.canvas.width / this.scale) * fx;
    const vh = (this.canvas.height / this.scale) * fy;
    mctx.strokeStyle = 'rgba(255,255,255,0.9)';
    mctx.lineWidth = 1;
    mctx.strokeRect(x0, y0, vw, vh);
  }

  // Gebäude, Schienen, Züge und Schiffe (in Kartenkoordinaten, Transform aktiv).
  // cx/cy liefern die Zellmitte (+0.5) einer Zellennummer.
  drawOverlays(ctx, now) {
    const g = this.game;
    const w = g.map.w;
    const cx = c => c % w + 0.5, cy = c => ((c / w) | 0) + 0.5;

    // Kielwasser-Helfer: ein paar verblassende Schaumtupten hinter einem
    // Schiff, entgegen seiner Fahrtrichtung (dx, dy = Richtung, beliebig
    // skaliert). Leichtes Zickzack wirkt organischer als eine starre Linie.
    const wake = (x, y, dx, dy, n = 3) => {
      const len = Math.hypot(dx, dy);
      if (len < 0.01) return;
      const ux = dx / len, uy = dy / len;
      const pxn = -uy, pyn = ux;
      for (let k = 1; k <= n; k++) {
        const off = (k % 2 ? 0.35 : -0.35) * k * 0.5;
        ctx.fillStyle = `rgba(235, 246, 255, ${0.2 * (1 - k / (n + 1))})`;
        ctx.beginPath();
        ctx.arc(x - ux * k * 1.5 + pxn * off, y - uy * k * 1.5 + pyn * off,
          0.35 + k * 0.22, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    // Gelaende-Relief bei groesseren Zoomstufen: schattierte Dreiecke auf
    // Gebirgszellen, kleine Kuppen auf Huegeln. Aus vorberechneten Listen,
    // nur der sichtbare Ausschnitt; bei weiterem Zoom wirkt es unruhig.
    // Je Gruppe wird alles in EINEN Pfad gesammelt und einmal gefuellt bzw.
    // gestrichelt (statt tausender Einzel-Calls pro Frame – sonst spuerbarer
    // Kamera-Lag im mittleren Zoom-Band). moveTo() vor jedem arc(), damit
    // die Kuppen nicht durch Verbindungslinien verklebt werden.
    // Zoom-adaptive Dichte: ab scale 9 alles wie bisher (h ist stets < 1,
    // also faellt nichts weg), darunter linear ausgeduennt bis ~15 % bei
    // 4.5 – dort werden die Einzelsymbole ohnehin zu Pixelmatsch.
    if (this.scale >= 4.5) {
      const rx0 = -this.ox / this.scale - 1, ry0 = -this.oy / this.scale - 1;
      const rx1 = rx0 + this.canvas.width / this.scale + 2;
      const ry1 = ry0 + this.canvas.height / this.scale + 2;
      const dens = Math.min(1, Math.max(0.15, (this.scale - 4.5) / 4.5));
      ctx.fillStyle = 'rgba(56, 48, 38, 0.5)';
      ctx.beginPath();
      for (const hp of this.hills) {
        if (hp.h > dens) continue;
        if (hp.x < rx0 || hp.x > rx1 || hp.y < ry0 || hp.y > ry1) continue;
        ctx.moveTo(hp.x + 0.02, hp.y + 0.55);
        ctx.arc(hp.x + 0.3, hp.y + 0.55, 0.28, Math.PI, 0);
        ctx.moveTo(hp.x + 0.52, hp.y + 0.55);
        ctx.arc(hp.x + 0.72, hp.y + 0.55, 0.2, Math.PI, 0);
      }
      ctx.fill();
      ctx.fillStyle = 'rgba(48, 46, 44, 0.62)';
      ctx.beginPath();
      for (const mp of this.mountains) {
        if (mp.h > dens) continue;
        if (mp.x < rx0 || mp.x > rx1 || mp.y < ry0 || mp.y > ry1) continue;
        ctx.moveTo(mp.x - 0.02, mp.y + 0.95);
        ctx.lineTo(mp.x + 0.5, mp.y + 0.06);
        ctx.lineTo(mp.x + 1.02, mp.y + 0.95);
        ctx.closePath();
      }
      ctx.fill();
      // helle Gipfelstriche
      ctx.strokeStyle = 'rgba(240, 240, 246, 0.7)';
      ctx.lineWidth = 0.12;
      ctx.beginPath();
      for (const mp of this.mountains) {
        if (mp.h > dens) continue;
        if (mp.x < rx0 || mp.x > rx1 || mp.y < ry0 || mp.y > ry1) continue;
        ctx.moveTo(mp.x + 0.34, mp.y + 0.38);
        ctx.lineTo(mp.x + 0.5, mp.y + 0.06);
        ctx.lineTo(mp.x + 0.66, mp.y + 0.38);
      }
      ctx.stroke();
    }

    // Schienennetz zuerst (unter allem): alle Kanten aus dem Engine-Graph –
    // Fabrik–Station UND Stadt–Stadt (siehe buildRailNetwork). Alles in einem
    // Pfad, das ist deutlich schneller als ein Pfad je Kante.
    if (g.rails && g.rails.edges.length) {
      ctx.strokeStyle = 'rgba(46, 36, 26, 0.8)';
      ctx.lineWidth = 0.55;
      ctx.beginPath();
      for (const [a, b] of g.rails.edges) {
        ctx.moveTo(cx(a), cy(a));
        ctx.lineTo(cx(b), cy(b));
      }
      ctx.stroke();
    }

    // Radius der EIGENEN Fabriken andeuten – zeigt, welche Städte/Häfen ans
    // Netz angeschlossen werden. Im Fabrik-Baumodus deutlicher (Platzierhilfe).
    if (this.myIdx >= 0) {
      const strong = this.factoryHint;
      ctx.save();
      ctx.setLineDash([3, 3]);
      ctx.lineWidth = strong ? 0.9 : 0.4;
      ctx.strokeStyle = strong ? 'rgba(244, 162, 97, 0.85)' : 'rgba(244, 162, 97, 0.28)';
      for (const b of g.buildings) {
        if (b.kind !== 'factory' || b.owner !== this.myIdx) continue;
        ctx.beginPath();
        ctx.arc(cx(b.cell), cy(b.cell), FACTORY_RADIUS, 0, Math.PI * 2);
        ctx.stroke();
      }
      // Vorschau im Fabrik-Baumodus: Radius schon an der Zelle unter dem
      // Cursor zeigen, BEVOR gebaut wird (hoverCell setzt main.js).
      if (strong && this.hoverCell >= 0) {
        ctx.strokeStyle = 'rgba(255, 214, 10, 0.9)';
        ctx.beginPath();
        ctx.arc(cx(this.hoverCell), cy(this.hoverCell), FACTORY_RADIUS, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    }

    // Schutzradius ALLER fertigen Festungen andeuten (Besitzerfarbe, dezent) –
    // wichtige Information fuers Angriffsziel. Im Festungs-Baumodus werden die
    // eigenen Ringe kraeftiger und eine goldene Vorschau folgt dem Cursor.
    {
      const strong = this.fortHint;
      ctx.save();
      ctx.setLineDash([2.5, 2.5]);
      for (const b of g.buildings) {
        if (b.kind !== 'fort' || g.underConstruction(b)) continue;
        const own = b.owner === this.myIdx;
        ctx.lineWidth = own && strong ? 0.9 : 0.4;
        ctx.strokeStyle = hexA(g.players[b.owner].color, own && strong ? 0.85 : 0.3);
        ctx.beginPath();
        ctx.arc(cx(b.cell), cy(b.cell), FORT_RADIUS, 0, Math.PI * 2);
        ctx.stroke();
      }
      if (strong && this.hoverCell >= 0) {
        ctx.lineWidth = 0.9;
        ctx.strokeStyle = 'rgba(255, 214, 10, 0.9)';
        ctx.beginPath();
        ctx.arc(cx(this.hoverCell), cy(this.hoverCell), FORT_RADIUS, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    }

    // Turm im Zielmodus (main.js setzt this.towerAim = { cell, ammo }, wenn
    // ein eigener Turm zum Schuss ausgewaehlt ist): Reichweite ist global
    // (kein Ring mehr noetig) – nur der Aufschlagsradius der gewaehlten
    // Munition wird am Cursor eingeblendet.
    if (this.towerAim) {
      const { cell, ammo } = this.towerAim;
      if (this.hoverCell >= 0) {
        const cfg = TOWER_AMMO[ammo] || TOWER_AMMO.stone;
        const tb = g.buildingAt.get(cell);
        const loaded = !!tb && !(tb.cd > 0); // schussbereit? (Nachladen = rote Linie)
        ctx.save();
        // Ziel-Linie vom Turm zum Cursor: gold = bereit, rot = laedt noch nach
        ctx.strokeStyle = loaded ? 'rgba(255, 214, 10, 0.55)' : 'rgba(230, 57, 70, 0.55)';
        ctx.lineWidth = 0.6;
        ctx.setLineDash([2, 2]);
        ctx.beginPath();
        ctx.moveTo(cx(cell), cy(cell));
        ctx.lineTo(cx(this.hoverCell), cy(this.hoverCell));
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = !loaded ? 'rgba(230, 57, 70, 0.22)'
          : ammo === 'fire' ? 'rgba(230, 57, 70, 0.28)' : 'rgba(255, 214, 10, 0.22)';
        ctx.beginPath();
        ctx.arc(cx(this.hoverCell), cy(this.hoverCell), cfg.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }

    // Trümmerfelder zerstörter Festungen: dunkler Schutt-Haufen.
    // NEU aufgetauchte Ruinen loesen zuerst einen kurzen Staub-/Schutt-Burst
    // aus (ruinsKnown merkt, welche Zellen schon bekannt sind).
    if (this.animations) {
      if (this.ruinsKnown.size > g.ruins.length + 30) {
        // Set gedeiht nicht unbegrenzt: ab und zu auf die aktuellen Ruinen
        // zuruecksetzen (abgeraeumte Felder fallen so wieder raus).
        this.ruinsKnown = new Set(g.ruins.map(r => r.cell));
      }
      for (const r of g.ruins) {
        if (this.ruinsKnown.has(r.cell)) continue;
        this.ruinsKnown.add(r.cell);
        const bx = cx(r.cell), by = cy(r.cell);
        const t0 = performance.now();
        for (let k = 0; k < 14; k++) {
          const ang = (k / 14) * Math.PI * 2 + Math.random() * 0.4;
          const dist = 2.2 + Math.random() * 2.4;
          this.particles.push({
            x: bx, y: by,
            dx: Math.cos(ang) * dist, dy: Math.sin(ang) * dist - 1.2,
            born: t0, life: 650 + Math.random() * 500,
            size: 0.6 + Math.random() * 0.7, alpha: 0.65,
            color: k % 3 === 0 ? '#c9b48a' : k % 3 === 1 ? '#8a7a5a' : '#5c564c',
          });
        }
      }
    } else if (this.ruinsKnown.size !== g.ruins.length) {
      this.ruinsKnown = new Set(g.ruins.map(r => r.cell));
    }
    for (const r of g.ruins) {
      const x = cx(r.cell), y = cy(r.cell);
      ctx.fillStyle = '#3a3630';
      ctx.beginPath();
      ctx.moveTo(x - 2.2, y + 1.6);
      ctx.lineTo(x - 0.9, y - 1.4);
      ctx.lineTo(x + 0.2, y + 0.2);
      ctx.lineTo(x + 1.3, y - 1.8);
      ctx.lineTo(x + 2.3, y + 1.6);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#57524a';
      ctx.fillRect(x - 0.7, y - 0.6, 1.5, 1.2);
    }

    // Gebaeude-Icons: im Standard-Stil ('orig') die urspruenglichen, per Code
    // gezeichneten Formen (Haeuserzeile/Turm/Anker/Halle); im Wappen- bzw.
    // Insel-Stil ('v1'/'v2') das Badge-Bild, umrandet von einem Ring in
    // Spielerfarbe (zeigt den Besitzer auch bei kleinem Zoom).
    // WICHTIG: Der gewaehlte Stil gilt nur fuer die eigenen Gebaeude – Bots,
    // andere Nationen und herrenlose Gebaeude bleiben immer beim Standard
    // (Emoji/Formen), damit sich der eigene Skin klar vom Rest abhebt.
    const ICON_R = 3.4; // Radius des Icons in Kartenzellen (~wie vorher)
    for (const b of g.buildings) {
      const x = cx(b.cell), y = cy(b.cell);
      const col = b.owner >= 0 ? g.players[b.owner].color : '#888';
      const style = (b.owner === this.myIdx) ? this.buildingStyle : 'orig';
      // Im Aufbau: Icon halbtransparent, darunter ein kleiner Fortschrittsbalken
      const deploying = g.underConstruction(b);
      if (deploying) ctx.globalAlpha = 0.45;

      if (style === 'orig') {
        // Urspruengliche Silhouetten: weiss als Kontrast, darin dasselbe
        // Motiv kleiner in Spielerfarbe.
        if (b.kind === 'city') {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(x - 2.9, y - 1, 2, 3.6);
          ctx.fillRect(x - 1.1, y - 2.7, 2.2, 5.3);
          ctx.fillRect(x + 0.9, y - 1.7, 2, 4.3);
          ctx.fillStyle = col;
          ctx.fillRect(x - 2.45, y - 0.5, 1.1, 2.6);
          ctx.fillRect(x - 0.65, y - 2.2, 1.3, 4.3);
          ctx.fillRect(x + 1.35, y - 1.2, 1.1, 3.3);
          // First-Linien: duennere dunkle Dachkante auf jedem Haus
          ctx.fillStyle = 'rgba(8, 14, 24, 0.65)';
          ctx.fillRect(x - 2.9, y - 1, 2, 0.3);
          ctx.fillRect(x - 1.1, y - 2.7, 2.2, 0.3);
          ctx.fillRect(x + 0.9, y - 1.7, 2, 0.3);
          // Fensterpunkte in den farbigen Fassaden (dezent dunkel)
          ctx.fillStyle = 'rgba(8, 14, 24, 0.5)';
          ctx.fillRect(x - 2.12, y + 0.2, 0.34, 0.4);
          ctx.fillRect(x - 2.12, y + 1.2, 0.34, 0.4);
          ctx.fillRect(x - 0.32, y - 1.6, 0.34, 0.4);
          ctx.fillRect(x - 0.32, y - 0.6, 0.34, 0.4);
          ctx.fillRect(x - 0.32, y + 0.5, 0.34, 0.4);
          ctx.fillRect(x + 1.68, y - 0.5, 0.34, 0.4);
          ctx.fillRect(x + 1.68, y + 0.6, 0.34, 0.4);
        } else if (b.kind === 'fort') {
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.arc(x, y, 2.9, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = col;
          ctx.fillRect(x - 1.6, y - 1.1, 3.2, 3.1);
          ctx.fillRect(x - 1.6, y - 2, 0.9, 1);
          ctx.fillRect(x - 0.45, y - 2, 0.9, 1);
          ctx.fillRect(x + 0.7, y - 2, 0.9, 1);
        } else if (b.kind === 'port') {
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.moveTo(x, y - 3); ctx.lineTo(x + 3, y); ctx.lineTo(x, y + 3); ctx.lineTo(x - 3, y);
          ctx.closePath(); ctx.fill();
          ctx.fillStyle = col;
          ctx.beginPath();
          ctx.arc(x, y - 1.5, 0.75, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillRect(x - 0.35, y - 1.2, 0.7, 3);
          ctx.fillRect(x - 1.4, y - 0.6, 2.8, 0.6);
          ctx.strokeStyle = col;
          ctx.lineWidth = 0.7;
          ctx.beginPath();
          ctx.moveTo(x - 1.7, y + 0.9);
          ctx.quadraticCurveTo(x, y + 3.1, x + 1.7, y + 0.9);
          ctx.stroke();
        } else if (b.kind === 'factory') {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(x - 2.7, y - 1.7, 5.4, 4.3);
          ctx.fillRect(x + 0.7, y - 3.4, 1.8, 2);
          ctx.fillStyle = col;
          ctx.fillRect(x - 2.1, y - 1.1, 4.2, 3.1);
          ctx.fillRect(x + 1.05, y - 3, 1.1, 1.9);
        } else if (b.kind === 'tower') {
          // Wachturm: schmaler Schaft mit spitzem Dach, wie Festung/Stadt in
          // Weiss als Kontrastrahmen und darin kleiner in Spielerfarbe.
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(x - 1.7, y - 1, 3.4, 4.4);
          ctx.beginPath();
          ctx.moveTo(x - 2.2, y - 1);
          ctx.lineTo(x, y - 3.8);
          ctx.lineTo(x + 2.2, y - 1);
          ctx.closePath();
          ctx.fill();
          ctx.fillStyle = col;
          ctx.fillRect(x - 1.05, y - 0.4, 2.1, 3.3);
          ctx.beginPath();
          ctx.moveTo(x - 1.6, y - 1);
          ctx.lineTo(x, y - 3.1);
          ctx.lineTo(x + 1.6, y - 1);
          ctx.closePath();
          ctx.fill();
        }
      } else {
        // Besitzer-Ring als Kontrast-/Farbtraeger hinter dem Badge
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.arc(x, y, ICON_R, 0, Math.PI * 2);
        ctx.fill();

        const im = BUILDING_ICONS[style][b.kind];
        if (im && im.complete && im.naturalWidth > 0) {
          const d = ICON_R * 1.8; // Badge etwas kleiner als der Ring darunter
          ctx.save();
          ctx.beginPath();
          ctx.arc(x, y, ICON_R * 0.92, 0, Math.PI * 2);
          ctx.clip();
          ctx.drawImage(im, x - d / 2, y - d / 2, d, d);
          ctx.restore();
        }
      }
      if (deploying) {
        const t = Math.min(1, (g.turnNo - b.built) / BUILD_DEPLOY_TICKS);
        ctx.globalAlpha = 1;
        ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
        ctx.fillRect(x - 3, y + 3.4, 6, 1);
        ctx.fillStyle = '#ffd60a';
        ctx.fillRect(x - 3, y + 3.4, 6 * t, 1);
      }
      // Beschädigte Festung (von Katapult/Turm beschossen): kleiner Lebensbalken
      if (b.kind === 'fort' && b.hp !== undefined && b.hp < FORT_HP) {
        const frac = Math.max(0, b.hp / FORT_HP);
        ctx.fillStyle = '#222';
        ctx.fillRect(x - 3, y - 4.6, 6, 0.9);
        ctx.fillStyle = frac > 0.5 ? '#38b000' : '#e63946';
        ctx.fillRect(x - 3, y - 4.6, 6 * frac, 0.9);
      } else if (b.kind !== 'fort' && b.dmg) {
        const frac = Math.max(0, 1 - b.dmg / TOWER_BUILDING_HP);
        ctx.fillStyle = '#222';
        ctx.fillRect(x - 3, y - 4.6, 6, 0.9);
        ctx.fillStyle = frac > 0.5 ? '#38b000' : '#e63946';
        ctx.fillRect(x - 3, y - 4.6, 6 * frac, 0.9);
      }
      // Beschaedigte Gebaeude qualmen: unter 50 % Rest-HP leichter grauer
      // Rauch, unter 25 % dichterer und dunkler (Phase aus der Zellennummer,
      // damit nicht alle synchron puffen).
      let dmgFrac = 1;
      if (b.kind === 'fort' && b.hp !== undefined) dmgFrac = Math.max(0, b.hp / FORT_HP);
      else if (b.kind !== 'fort' && b.dmg) dmgFrac = Math.max(0, 1 - b.dmg / TOWER_BUILDING_HP);
      if (this.animations && dmgFrac < 0.5) {
        const heavy = dmgFrac < 0.25;
        const puffs = heavy ? 3 : 2;
        const base2 = (now / (heavy ? 1100 : 1500) + (b.cell * 0.61803) % 1) % 1;
        for (let k = 0; k < puffs; k++) {
          const t = (base2 + k / puffs) % 1;
          ctx.globalAlpha = (1 - t) * (heavy ? 0.55 : 0.35);
          ctx.fillStyle = heavy ? '#6b675f' : '#9d988c';
          ctx.beginPath();
          ctx.arc(x + t * 0.6 - 0.3, y - 1.5 - t * 3.2, 0.45 + t * (heavy ? 1.1 : 0.8), 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      }
      // Eigener fertiger Turm: schussbereit = pulsierender goldener Punkt
      // ("kann angreifen"), sonst goldener Ladebogen fuer das Nachladen.
      if (b.kind === 'tower' && b.owner === this.myIdx && !deploying) {
        if (b.cd > 0) {
          const frac = 1 - b.cd / TOWER_AMMO.stone.reload; // reload ist bei allen Munitionen gleich
          ctx.strokeStyle = 'rgba(255, 214, 10, 0.85)';
          ctx.lineWidth = 0.7;
          ctx.beginPath();
          ctx.arc(x, y, 4.3, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2);
          ctx.stroke();
        } else {
          const pulse = this.animations ? 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(now / 340 + b.cell)) : 0.9;
          ctx.fillStyle = `rgba(255, 214, 10, ${pulse})`;
          ctx.beginPath();
          ctx.arc(x, y - 5.4, 1.05, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = 'rgba(120, 84, 0, 0.9)';
          ctx.lineWidth = 0.3;
          ctx.stroke();
        }
      }
    }
    ctx.globalAlpha = 1;

    // Fabrik-Schornsteine qualmen (nur fertig gebaute): zwei aufsteigende
    // Woelkchen, Phase aus der Zellennummer, damit die Fabriken versetzt
    // puffen (Muster wie der Zugdampf unten).
    if (this.animations) {
      for (const b of g.buildings) {
        if (b.kind !== 'factory' || g.underConstruction(b)) continue;
        const x = cx(b.cell), y = cy(b.cell);
        const base = (now / 1600 + (b.cell * 0.61803) % 1) % 1;
        for (let k = 0; k < 2; k++) {
          const t = (base + k / 2) % 1;
          ctx.globalAlpha = (1 - t) * 0.45;
          ctx.fillStyle = '#e8e4da';
          ctx.beginPath();
          ctx.arc(x + 1.6 - t * 0.8, y - 3.8 - t * 2.6, 0.5 + t * 0.9, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
    }

    // Züge auf den Schienen: im Standard-Stil das urspruengliche einfache
    // Rechteck, sonst die Dampflok-Sprite (gedreht in Fahrtrichtung, mit
    // Wimpel in Spielerfarbe an der Kabine). Auch hier gilt der gewaehlte
    // Skin nur fuer die eigenen Zuege. Ueber jedem Zug steigen kleine
    // Dampfwoelkchen auf (Phase aus dem Zug-Index, damit sie versetzt puffen).
    let ti = 0;
    for (const tr of g.trains) {
      const [tx, ty] = g.trainPos(tr);
      const trainStyle = (tr.owner === this.myIdx) ? this.buildingStyle : 'orig';
      if (trainStyle === 'orig') {
        ctx.fillStyle = '#2b2016';
        ctx.fillRect(tx - 1.4, ty - 0.9, 2.8, 1.8);
        ctx.fillStyle = g.players[tr.owner].color;
        ctx.fillRect(tx - 0.8, ty - 0.4, 1.6, 0.8);
      } else {
        const fx = tr.from % w, fy = (tr.from / w) | 0;
        const gx = tr.to % w, gy = (tr.to / w) | 0;
        const angle = Math.atan2(gy - fy, gx - fx);
        ctx.save();
        ctx.translate(tx, ty);
        // Bild-Front zeigt nach links (Winkel PI) -> auf Fahrtrichtung drehen.
        ctx.rotate(angle - Math.PI);
        if (TRAIN_IMG.complete && TRAIN_IMG.naturalWidth > 0) {
          const iw = TRAIN_IMG.naturalWidth, ih = TRAIN_IMG.naturalHeight;
          const drawW = 6.2, drawH = drawW * (ih / iw);
          const scale = drawW / iw;
          // Bildmitte (Lok-Koerpermitte, nicht Bild-Mitte) auf den Ursprung legen
          const originX = iw * 0.40, originY = ih * 0.52;
          ctx.drawImage(TRAIN_IMG, -originX * scale, -originY * scale, iw * scale, ih * scale);
          // Wimpel an der Kabine in Spielerfarbe (Kabine liegt bei ~72% der Bildbreite)
          ctx.fillStyle = g.players[tr.owner].color;
          ctx.fillRect((iw * 0.70 - originX) * scale, (ih * 0.18 - originY) * scale, drawW * 0.14, drawH * 0.16);
        } else {
          // Fallback, solange das Sprite noch laedt
          ctx.fillStyle = '#2b2016';
          ctx.fillRect(-1.4, -0.9, 2.8, 1.8);
          ctx.fillStyle = g.players[tr.owner].color;
          ctx.fillRect(-0.8, -0.4, 1.6, 0.8);
        }
        ctx.restore();
      }
      // Dampfwoelkchen ueber der Lok: drei deutlich sichtbare Puffs, je Zug
      // phasenversetzt, die aufsteigen und auseinanderziehen.
      if (this.animations) {
        const base = (now / 1000 + ti * 0.53) % 1;
        for (let k = 0; k < 3; k++) {
          const t = (base + k / 3) % 1;
          ctx.globalAlpha = (1 - t) * 0.6;
          ctx.fillStyle = '#f2eee2';
          ctx.beginPath();
          ctx.arc(tx - t * 1.0, ty - 1.6 - t * 3.4, 0.75 + t * 1.2, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      }
      ti++;
    }

    // Handelsschiffe: Rumpf mit zugespitztem Bug in Fahrtrichtung gedreht,
    // weisses Segel als Spitze zum Bug hin (traegt die Richtung optisch mit).
    // Fahrtrichtung aus dem Pfad, wie beim Kielwasser; Stillstand = nach rechts.
    for (const s of g.tradeShips) {
      const c = g.tradeShipCell(s);
      const x = cx(c), y = cy(c);
      // Kielwasser entgegen der Fahrtrichtung (zentrierte Pfad-Differenz)
      let ang = 0;
      if (s.path.length > 1) {
        const i = Math.min(s.path.length - 1, s.pos | 0);
        const pc = s.path[Math.max(0, i - 1)], nc = s.path[Math.min(s.path.length - 1, i + 1)];
        const dx = (nc % w) - (pc % w), dy = ((nc / w) | 0) - ((pc / w) | 0);
        wake(x, y, dx, dy);
        if (dx || dy) ang = Math.atan2(dy, dx);
      }
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(ang);
      // Rumpf in Besitzerfarbe: rechts der Bug, links das gerade Heck
      ctx.fillStyle = g.players[s.owner].color;
      ctx.beginPath();
      ctx.moveTo(1.6, 0);
      ctx.lineTo(0.6, 0.7);
      ctx.lineTo(-1.3, 0.55);
      ctx.lineTo(-1.3, -0.55);
      ctx.lineTo(0.6, -0.7);
      ctx.closePath();
      ctx.fill();
      // Segel: weisses Dreieck mit Spitze zum Bug
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(0.9, 0);
      ctx.lineTo(-0.3, -0.8);
      ctx.lineTo(-0.3, 0.8);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    // Transportboote (Invasion): weisser Rumpf mit zugespitztem Bug in
    // Fahrtrichtung, darin ein kleineres Deck in Besitzerfarbe.
    for (const boat of g.boats) {
      const c = boat.path[Math.min(boat.path.length - 1, boat.pos | 0)];
      const x = cx(c), y = cy(c);
      let ang = 0;
      if (boat.path.length > 1) {
        const i = Math.min(boat.path.length - 1, boat.pos | 0);
        const pc = boat.path[Math.max(0, i - 1)], nc = boat.path[Math.min(boat.path.length - 1, i + 1)];
        const dx = (nc % w) - (pc % w), dy = ((nc / w) | 0) - ((pc / w) | 0);
        wake(x, y, dx, dy);
        if (dx || dy) ang = Math.atan2(dy, dx);
      }
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(ang);
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(2.1, 0);
      ctx.lineTo(1.0, 1.0);
      ctx.lineTo(-1.6, 0.8);
      ctx.lineTo(-1.9, 0);
      ctx.lineTo(-1.6, -0.8);
      ctx.lineTo(1.0, -1.0);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = g.players[boat.owner].color;
      ctx.beginPath();
      ctx.moveTo(1.3, 0);
      ctx.lineTo(0.6, 0.55);
      ctx.lineTo(-1.1, 0.45);
      ctx.lineTo(-1.3, 0);
      ctx.lineTo(-1.1, -0.45);
      ctx.lineTo(0.6, -0.55);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    // Kriegsschiffe (größer, mit Lebensbalken): Rumpf in Fahrtrichtung
    // gedreht; bei Stillstand behaelt das Schiff seinen letzten Kurs
    // (this.shipAngles, wird hier periodisch aufgeraeumt).
    if (this.shipAngles.size > g.warships.length + 20) {
      const ids = new Set(g.warships.map(ws => ws.id));
      for (const id of this.shipAngles.keys()) if (!ids.has(id)) this.shipAngles.delete(id);
    }
    for (const ws of g.warships) {
      const x = cx(ws.cell), y = cy(ws.cell);
      let ang = this.shipAngles.get(ws.id) || 0;
      // Kielwasser nur, solange das Schiff unterwegs ist (Pfad nicht abgefahren)
      if (ws.pi < ws.path.length) {
        const pc = ws.path[Math.max(0, ws.pi - 1)], nc = ws.path[ws.pi];
        const dx = (nc % w) - (pc % w), dy = ((nc / w) | 0) - ((pc / w) | 0);
        wake(x, y, dx, dy);
        if (dx || dy) { ang = Math.atan2(dy, dx); this.shipAngles.set(ws.id, ang); }
      }
      // Ausgewaehlte eigene Schiffe: goldener Ring + Linie/Marke zum Wegpunkt
      if (this.selectedWarshipIds.has(ws.id) && ws.owner === this.myIdx) {
        if (ws.order >= 0) {
          const ox = cx(ws.order), oy = cy(ws.order);
          ctx.strokeStyle = 'rgba(244,162,97,0.7)';
          ctx.lineWidth = 0.5;
          ctx.setLineDash([1.5, 1.5]);
          ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(ox, oy); ctx.stroke();
          ctx.setLineDash([]);
          ctx.beginPath(); ctx.arc(ox, oy, 1.6, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.strokeStyle = '#f4a261';
        ctx.lineWidth = 0.7;
        ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2);
        ctx.stroke();
      }
      // Rumpf gedreht zeichnen: weisser Grundrumpf mit Bug, darin Deck in
      // Besitzerfarbe
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(ang);
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(2.7, 0);
      ctx.lineTo(1.5, 1.2);
      ctx.lineTo(-2.0, 1.0);
      ctx.lineTo(-2.4, 0);
      ctx.lineTo(-2.0, -1.0);
      ctx.lineTo(1.5, -1.2);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = g.players[ws.owner].color;
      ctx.beginPath();
      ctx.moveTo(1.8, 0);
      ctx.lineTo(1.0, 0.7);
      ctx.lineTo(-1.4, 0.6);
      ctx.lineTo(-1.7, 0);
      ctx.lineTo(-1.4, -0.6);
      ctx.lineTo(1.0, -0.7);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      // Lebensbalken darueber (achsenfest): gruen > 50% HP, sonst rot
      const maxHp = g.warshipMaxHp(ws);
      const frac = Math.max(0, (maxHp - ws.dmg) / maxHp);
      ctx.fillStyle = '#222';
      ctx.fillRect(x - 2.4, y - 2.4, 4.8, 0.7);
      ctx.fillStyle = frac > 0.5 ? '#38b000' : '#e63946';
      ctx.fillRect(x - 2.4, y - 2.4, 4.8 * frac, 0.7);
    }

    // Katapulte (Belagerungs-Einheiten zu Land): Gestell mit Rädern und
    // Wurfarm in Besitzerfarbe. Ausgewählte eigene Katapulte bekommen einen
    // goldenen Ring, eine Linie/Marke zum Wegpunkt und den Reichweiten-Ring.
    for (const cp of g.catapults) {
      const x = cx(cp.cell), y = cy(cp.cell);
      const col = g.players[cp.owner].color;
      if (this.selectedCatapultIds.has(cp.id) && cp.owner === this.myIdx) {
        if (cp.order >= 0) {
          const ox = cx(cp.order), oy = cy(cp.order);
          ctx.strokeStyle = 'rgba(244,162,97,0.7)';
          ctx.lineWidth = 0.5;
          ctx.setLineDash([1.5, 1.5]);
          ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(ox, oy); ctx.stroke();
          ctx.setLineDash([]);
          ctx.beginPath(); ctx.arc(ox, oy, 1.6, 0, Math.PI * 2);
          ctx.stroke();
        }
        // Schussweite andeuten
        ctx.strokeStyle = 'rgba(244,162,97,0.35)';
        ctx.lineWidth = 0.4;
        ctx.beginPath(); ctx.arc(x, y, CATAPULT_RANGE, 0, Math.PI * 2); ctx.stroke();
        ctx.strokeStyle = '#f4a261';
        ctx.lineWidth = 0.7;
        ctx.beginPath(); ctx.arc(x, y, 3.6, 0, Math.PI * 2);
        ctx.stroke();
      }
      // Räder
      ctx.fillStyle = '#2b2016';
      ctx.beginPath(); ctx.arc(x - 1.5, y + 1.5, 0.9, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(x + 1.5, y + 1.5, 0.9, 0, Math.PI * 2); ctx.fill();
      // Gestell (Dreieck) in Besitzerfarbe mit hellem Rand
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(x - 2.1, y + 1.3); ctx.lineTo(x, y - 2.3); ctx.lineTo(x + 2.1, y + 1.3);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.moveTo(x - 1.4, y + 1.1); ctx.lineTo(x, y - 1.5); ctx.lineTo(x + 1.4, y + 1.1);
      ctx.closePath(); ctx.fill();
      // Wurfarm + Schleuderkelle. Nach einem Schuss schwingt der Arm kurz
      // hoch und faellt weich zurueck (Rueckschwung; Startzeit kommt aus
      // drawProjectiles, wo der Felsbrocken gestartet wird).
      let armS = 0; // 0 = Ruhelage, 1 = hochgerissen
      const kick = this.catapultArmAnim.get(cp.id);
      if (kick !== undefined) {
        const kt = (now - kick) / 380;
        if (kt >= 1) this.catapultArmAnim.delete(cp.id);
        else armS = Math.sin(Math.PI * Math.min(1, kt * 1.6)); // schnell hoch, weich zurueck
      }
      const tipX = x + 1.6 - 1.5 * armS, tipY = y - 2.6 - 1.0 * armS;
      ctx.strokeStyle = '#2b2016';
      ctx.lineWidth = 0.7;
      ctx.beginPath(); ctx.moveTo(x - 0.6, y - 0.2); ctx.lineTo(tipX, tipY); ctx.stroke();
      ctx.fillStyle = '#2b2016';
      ctx.beginPath(); ctx.arc(tipX + 0.1, tipY - 0.1, 0.7, 0, Math.PI * 2); ctx.fill();
    }
  }
}
