// Prozedurale Kartengenerierung.
// - 'random': Archipel aus fraktalem Value-Noise (jedes Spiel neu)
// - Preset-Karten ('world', 'europe', …): stilisierte Erd-Geografie aus
//   worldmap.js, gerastert mit Küsten-Rauschen (variiert leicht pro Seed).
import { hash2 } from './rng.js';
import { LAND_SHAPES, SEA_SHAPES, MAP_VIEWS } from './worldmap.js';

// Weiche Interpolationskurve (smoothstep): macht die Uebergaenge zwischen den
// Rausch-Gitterpunkten sanft statt eckig.
function smooth(t) { return t * t * (3 - 2 * t); }

// Value-Noise: glattes Rauschen. An ganzzahligen Gitterpunkten wird der
// deterministische Hash abgefragt und dazwischen bilinear interpoliert.
function valueNoise(x, y, seed) {
  const x0 = Math.floor(x), y0 = Math.floor(y);       // linke obere Gitterzelle
  const fx = smooth(x - x0), fy = smooth(y - y0);     // weiche Nachkommaanteile
  // Rauschwerte an den vier Ecken der Gitterzelle
  const v00 = hash2(x0, y0, seed);
  const v10 = hash2(x0 + 1, y0, seed);
  const v01 = hash2(x0, y0 + 1, seed);
  const v11 = hash2(x0 + 1, y0 + 1, seed);
  // erst in x-Richtung interpolieren, dann in y-Richtung
  const a = v00 + (v10 - v00) * fx;
  const b = v01 + (v11 - v01) * fx;
  return a + (b - a) * fy;
}

// Fraktales Rauschen: mehrere Rausch-Ebenen ("Oktaven") uebereinanderlegen –
// grobe Ebenen fuer die grosse Form, feine fuer Details. Ergibt natuerlich
// wirkende Hoehenverteilungen. Rueckgabe normiert auf ca. 0..1.
function fractal(x, y, seed) {
  let v = 0, amp = 0.55, freq = 1 / 34, norm = 0;
  for (let o = 0; o < 4; o++) {
    v += valueNoise(x * freq, y * freq, seed + o * 101) * amp;
    norm += amp;
    amp *= 0.5;    // jede Oktave traegt halb so stark bei ...
    freq *= 2.1;   // ... dafuer mit hoeherer Frequenz (feinere Details)
  }
  return v / norm;
}

// Zusammenhängende Landmassen finden; kleine entfernen.
// Liefert pro Zelle die Insel-Nummer (-1 = Wasser) und die Inselgrößen.
function labelIslands(terrain, w, h, minSize) {
  const label = new Int32Array(w * h).fill(-1);
  const queue = new Int32Array(w * h);
  const sizes = [];
  // Flood-Fill (Breitensuche) ueber alle noch nicht besuchten Landzellen:
  // jede zusammenhaengende Landflaeche bekommt eine eigene Nummer L.
  for (let i = 0; i < w * h; i++) {
    if (terrain[i] !== 1 || label[i] !== -1) continue;
    const L = sizes.length;
    let head = 0, tail = 0, size = 0;
    queue[tail++] = i;
    label[i] = L;
    while (head < tail) {
      const c = queue[head++];
      size++;
      const x = c % w, y = (c / w) | 0;
      // Die vier Nachbarzellen pruefen und – falls Land und unbesucht – anhaengen
      if (x > 0 && terrain[c - 1] === 1 && label[c - 1] === -1) { label[c - 1] = L; queue[tail++] = c - 1; }
      if (x < w - 1 && terrain[c + 1] === 1 && label[c + 1] === -1) { label[c + 1] = L; queue[tail++] = c + 1; }
      if (y > 0 && terrain[c - w] === 1 && label[c - w] === -1) { label[c - w] = L; queue[tail++] = c - w; }
      if (y < h - 1 && terrain[c + w] === 1 && label[c + w] === -1) { label[c + w] = L; queue[tail++] = c + w; }
    }
    sizes.push(size);
  }
  // Kleine Inseln entfernen, verbleibende kompakt neu nummerieren.
  // remap[alteNummer] = neueNummer (oder -1, wenn zu klein und verworfen).
  const remap = new Int32Array(sizes.length).fill(-1);
  const newSizes = [];
  for (let L = 0; L < sizes.length; L++) {
    if (sizes[L] >= minSize) {
      remap[L] = newSizes.length;
      newSizes.push(sizes[L]);
    }
  }
  // Endgueltiges Insel-Raster aufbauen; zu kleine Inseln werden zu Wasser (0).
  const island = new Int16Array(w * h).fill(-1);
  let landCount = 0;
  for (let i = 0; i < w * h; i++) {
    if (terrain[i] !== 1) continue;
    const L = remap[label[i]];
    if (L === -1) {
      terrain[i] = 0;         // verworfene Miniinsel -> Wasser
    } else {
      island[i] = L;
      landCount++;
    }
  }
  return { island, islandSizes: newSizes, landCount };
}

// ---------- Zufalls-Archipel ----------
// Erzeugt eine Hoehenkarte aus fraktalem Rauschen und macht daraus Land/Wasser.
function generateRandomTerrain(seed, w, h) {
  const terrain = new Uint8Array(w * h);
  const heights = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      // Normierte Koordinaten -1..1 und Abstand r zur Kartenmitte
      const nx = (x / w) * 2 - 1, ny = (y / h) * 2 - 1;
      const r = Math.sqrt(nx * nx + ny * ny);
      // Schwacher Radial-Abfall: mehrere Inseln statt eines Kontinents
      heights[y * w + x] = fractal(x, y, seed) * 0.9 + (1 - r) * 0.24;
    }
  }
  // Schwellwert anpassen, bis der Landanteil passt: alles ueber dem Schwellwert
  // wird Land. Der Schwellwert wird iterativ nachgeregelt, bis der Landanteil
  // zwischen ~30% und ~46% liegt (sonst zu viel/zu wenig Land).
  let threshold = 0.66;
  for (let tries = 0; tries < 24; tries++) {
    let landCount = 0;
    for (let i = 0; i < w * h; i++) {
      terrain[i] = heights[i] > threshold ? 1 : 0;
      if (terrain[i]) landCount++;
    }
    const frac = landCount / (w * h);
    if (frac < 0.3) threshold -= 0.015;        // zu wenig Land -> Schwelle senken
    else if (frac > 0.46) threshold += 0.015;  // zu viel Land -> Schwelle heben
    else break;                                // Landanteil passt
  }
  return terrain;
}

// ---------- Preset-Karten (Welt / Kontinente) ----------
// Punkt-in-Polygon-Test (Ray-Casting): zaehlt, wie oft ein Strahl nach rechts
// die Polygonkanten schneidet. Ungerade Anzahl = Punkt liegt innen.
function inPoly(pts, x, y) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i][0], yi = pts[i][1];
    const xj = pts[j][0], yj = pts[j][1];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// Punkt-in-Ellipse-Test. Der Punkt wird zuerst um -rot in das lokale
// Ellipsen-Koordinatensystem gedreht, dann die Ellipsengleichung geprueft.
function inEllipse(e, x, y) {
  const [cx, cy, rx, ry, rot = 0] = e;
  const a = (-rot * Math.PI) / 180;      // Rotation in Radiant (Gegenrichtung)
  const dx = x - cx, dy = y - cy;        // Punkt relativ zum Ellipsenzentrum
  const px = dx * Math.cos(a) - dy * Math.sin(a);
  const py = dx * Math.sin(a) + dy * Math.cos(a);
  return (px * px) / (rx * rx) + (py * py) / (ry * ry) <= 1;
}

// Bounding-Boxen einmalig vorberechnen (schneller Vorab-Test).
// Liefert [x0, y0, x1, y1] – die umschliessende Box einer Form.
function shapeBBox(s) {
  if (s.poly) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [x, y] of s.poly) {
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
    return [x0, y0, x1, y1];
  }
  // Ellipse: quadratische Box mit dem groesseren Radius als Halbkante
  const [cx, cy, rx, ry] = s.ellipse;
  const r = Math.max(rx, ry);
  return [cx - r, cy - r, cx + r, cy + r];
}
// Vorberechnete Boxen fuer Land- und Meer-Formen (einmal beim Laden)
const LAND_BB = LAND_SHAPES.map(shapeBBox);
const SEA_BB = SEA_SHAPES.map(shapeBBox);

// Liegt (lon, lat) in irgendeiner der Formen? Erst der billige Bounding-Box-Test,
// nur bei Treffer der teurere exakte Polygon-/Ellipsentest.
function inShapes(shapes, bbs, lon, lat) {
  for (let i = 0; i < shapes.length; i++) {
    const bb = bbs[i];
    if (lon < bb[0] || lon > bb[2] || lat < bb[1] || lat > bb[3]) continue;
    const s = shapes[i];
    if (s.poly ? inPoly(s.poly, lon, lat) : inEllipse(s.ellipse, lon, lat)) return true;
  }
  return false;
}

// Rastert einen Weltausschnitt (view) auf das Zellen-Raster: jede Zelle wird
// auf Lon/Lat zurueckgerechnet und ist Land, wenn sie in einer Landform, aber
// in keiner Meerform liegt.
function generatePresetTerrain(seed, w, h, view) {
  const terrain = new Uint8Array(w * h);
  const lonSpan = view.lon[1] - view.lon[0];
  const latSpan = view.lat[1] - view.lat[0];
  // Küsten-Jitter in Grad, relativ zur Kartengröße: verwackelt die Kueste ein
  // wenig, damit sie nicht messerscharf-geometrisch aussieht.
  const jLon = lonSpan * 0.012;
  const jLat = latSpan * 0.012;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      // Zellmittelpunkt auf Lon/Lat abbilden (+ leichtes Rausch-Wackeln).
      // Beachte: y ist oben=Norden, deshalb wird lat von oben (lat[1]) abgezogen.
      const lon = view.lon[0] + ((x + 0.5) / w) * lonSpan + (fractal(x, y, seed) - 0.5) * jLon;
      const lat = view.lat[1] - ((y + 0.5) / h) * latSpan + (fractal(x + 5000, y, seed) - 0.5) * jLat;
      if (inShapes(LAND_SHAPES, LAND_BB, lon, lat) && !inShapes(SEA_SHAPES, SEA_BB, lon, lat)) {
        terrain[y * w + x] = 1;
      }
    }
  }
  return terrain;
}

// Einstiegspunkt: erzeugt die komplette Karte fuer den gewaehlten Typ.
// Rueckgabe enthaelt Breite/Hoehe, Land/Wasser-Raster (terrain), Anzahl
// Landzellen sowie die Insel-Zuordnung pro Zelle und die Inselgroessen.
export function generateMap(seed, w, h, type = 'random') {
  const view = MAP_VIEWS[type];
  const terrain = view ? generatePresetTerrain(seed, w, h, view) : generateRandomTerrain(seed, w, h);
  // Preset-Karten behalten kleine Inseln (GB, Japan …), Zufallskarten nicht
  const minIsland = view ? 12 : 100;
  const { island, islandSizes, landCount } = labelIslands(terrain, w, h, minIsland);
  return { w, h, terrain, landCount, island, islandSizes };
}
