// Canvas-Renderer: Karte als ImageData in Kartenauflösung,
// hochskaliert mit Zoom & Pan gezeichnet.
//
// Trick fuer Tempo: Die Karte (Zehntausende Zellen) wird pixelgenau in ein
// kleines Offscreen-Canvas in Kartenaufloesung gemalt und beim Zeichnen als
// EIN Bild hochskaliert. So muss pro Frame nicht jede Zelle einzeln gezeichnet
// werden; geaendert wird nur, was sich wirklich veraendert hat (markDirty).

import { FACTORY_RADIUS } from './engine.js';

// Basisfarben fuer Wasser und neutrales (herrenloses) Land, als [R,G,B].
const WATER = [45, 90, 140];
const NEUTRAL = [181, 173, 138];
const NEUTRAL_EDGE = [160, 152, 118];   // etwas dunkler fuer Grenzkanten

// Hex-Farbe ("#rrggbb") in ein [R,G,B]-Array umwandeln.
function hexToRgb(hex) {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}
// Farbe abdunkeln (Faktor f < 1) – fuer die dunkleren Grenzkanten der Reiche.
function darken(rgb, f) {
  return [rgb[0] * f | 0, rgb[1] * f | 0, rgb[2] * f | 0];
}

// Grosse Zahlen kompakt formatieren (1.2M, 3.4k …) fuer die Badges.
function fmt(n) {
  n = Math.floor(n);
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e4) return (n / 1e3).toFixed(1) + 'k';
  return String(n);
}

export class Renderer {
  constructor(canvas, game) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.game = game;
    // Von main.js gesetzt: eigener Spieler-Index (fuer den Fabrik-Radius) und
    // ob gerade der Fabrik-Baumodus laeuft (dann Radius deutlicher zeichnen).
    this.myIdx = -1;
    this.factoryHint = false;
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

    // Spielerfarben vorab in RGB umrechnen (normal + abgedunkelt fuer Kanten)
    this.colors = game.players.map(p => hexToRgb(p.color));
    this.colorsEdge = this.colors.map(c => darken(c, 0.62));

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
  }

  // Farbe einer einzelnen Zelle bestimmen (Wasser / neutral / Spielerfarbe),
  // Randzellen zusaetzlich abgedunkelt, damit Reichsgrenzen sichtbar werden.
  cellColor(c) {
    const g = this.game;
    if (g.map.terrain[c] === 0) return WATER;
    const o = g.owner[c];
    // Randzellen dunkler zeichnen (Grenzen sichtbar machen): eine Zelle ist
    // "Rand", wenn eine angrenzende Landzelle einem anderen Besitzer gehoert.
    const w = g.map.w, h = g.map.h;
    const x = c % w, y = (c / w) | 0;
    let edge = false;
    if (x > 0 && g.map.terrain[c - 1] === 1 && g.owner[c - 1] !== o) edge = true;
    else if (x < w - 1 && g.map.terrain[c + 1] === 1 && g.owner[c + 1] !== o) edge = true;
    else if (y > 0 && g.map.terrain[c - w] === 1 && g.owner[c - w] !== o) edge = true;
    else if (y < h - 1 && g.map.terrain[c + w] === 1 && g.owner[c + w] !== o) edge = true;
    if (o < 0) return edge ? NEUTRAL_EDGE : NEUTRAL;
    return edge ? this.colorsEdge[o] : this.colors[o];
  }

  // Eine Zelle in die Rohpixel (this.img) schreiben (4 Bytes: R,G,B,A).
  paintCell(c) {
    const rgb = this.cellColor(c);
    const i = c * 4;
    this.img.data[i] = rgb[0];
    this.img.data[i + 1] = rgb[1];
    this.img.data[i + 2] = rgb[2];
    this.img.data[i + 3] = 255;
  }

  // Komplette Karte neu einfaerben (nur zum Start noetig).
  repaintAll() {
    const n = this.game.map.w * this.game.map.h;
    for (let c = 0; c < n; c++) this.paintCell(c);
    this.imgDirty = true;
  }

  // Geänderte Zellen + Nachbarn neu einfärben (wegen Grenz-Schattierung).
  // Nachbarn muessen mit, weil sich deren "Rand"-Status mitaendern kann.
  markDirty(cells) {
    if (!cells.length) return;
    const w = this.game.map.w, h = this.game.map.h;
    for (const c of cells) {
      this.paintCell(c);
      const x = c % w, y = (c / w) | 0;
      if (x > 0) this.paintCell(c - 1);
      if (x < w - 1) this.paintCell(c + 1);
      if (y > 0) this.paintCell(c - w);
      if (y < h - 1) this.paintCell(c + w);
    }
    this.imgDirty = true;
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
  // Transform aufrufen).
  drawLabels(ctx) {
    const g = this.game;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#000';

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

      ctx.font = `700 ${fontSize}px 'Segoe UI', sans-serif`;
      ctx.fillText(p.name, px, py);
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
    ctx.fillStyle = '#16283c';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.imageSmoothingEnabled = false;   // harte Pixel statt Weichzeichnen
    // Transform = Zoom + Pan: ab hier wird in Kartenkoordinaten gezeichnet.
    ctx.setTransform(this.scale, 0, 0, this.scale, this.ox, this.oy);
    ctx.drawImage(this.off, 0, 0);       // die ganze Karte in einem Rutsch
    this.drawOverlays(ctx);              // Gebaeude/Schiffe/Zuege darueber
    ctx.setTransform(1, 0, 0, 1, 0, 0);  // zurueck zu Bildschirmkoordinaten
    this.drawBadges(ctx);

    this.updateLabels(now);              // Flaechen-Schwerpunkte periodisch neu berechnen
    this.drawLabels(ctx);                // Spielernamen auf groesster Flaeche

    this.drawMinimap();
  }

  // Truppen-Badges für laufende Angriffe und Boote (in Bildschirmkoordinaten)
  drawBadges(ctx) {
    const g = this.game;
    const w = g.map.w;
    // Hilfsfunktion: eine kleine beschriftete Sprechblase an Kartenposition
    // (mapX, mapY) zeichnen. Ausserhalb des Sichtfensters wird uebersprungen.
    const badge = (mapX, mapY, label, color) => {
      const px = mapX * this.scale + this.ox;
      const py = mapY * this.scale + this.oy;
      if (px < -60 || py < -30 || px > this.canvas.width + 60 || py > this.canvas.height + 30) return;
      ctx.font = 'bold 11px sans-serif';
      const tw = ctx.measureText(label).width;
      ctx.fillStyle = 'rgba(10, 20, 32, 0.75)';
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(px - tw / 2 - 6, py - 9, tw + 12, 18, 9);
      else ctx.rect(px - tw / 2 - 6, py - 9, tw + 12, 18);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.fillText(label, px - tw / 2, py + 4);
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
      badge(sx / n + 0.5, sy / n + 0.5, '⚔ ' + fmt(atk.pool), g.players[atk.attacker].color);
    }
    // Pro Transportboot eine Badge (🚢 + Truppenzahl) an der aktuellen Position
    for (const boat of g.boats) {
      const c = boat.path[Math.min(boat.path.length - 1, boat.pos | 0)];
      badge(c % w + 0.5, ((c / w) | 0) - 2.5, '🚢 ' + fmt(boat.troops), g.players[boat.owner].color);
    }
  }

  // Minimap mit Sichtfenster-Rahmen: die Karte verkleinert plus ein weisses
  // Rechteck, das den aktuell sichtbaren Ausschnitt markiert.
  drawMinimap() {
    if (!this.miniCtx) return;
    const m = this.mini, mctx = this.miniCtx;
    mctx.imageSmoothingEnabled = false;
    mctx.fillStyle = '#16283c';
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
  drawOverlays(ctx) {
    const g = this.game;
    const w = g.map.w;
    const cx = c => c % w + 0.5, cy = c => ((c / w) | 0) + 0.5;

    // Schienennetz zuerst (unter allem): alle Kanten aus dem Engine-Graph –
    // Fabrik–Station UND Stadt–Stadt (siehe buildRailNetwork). Alles in einem
    // Pfad, das ist deutlich schneller als ein Pfad je Kante.
    if (g.rails && g.rails.edges.length) {
      ctx.strokeStyle = 'rgba(40, 32, 24, 0.6)';
      ctx.lineWidth = 0.5;
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
      ctx.restore();
    }

    // Gebaeude-Icons: erst eine weisse Silhouette als Kontrast zum Untergrund,
    // darin dasselbe Motiv kleiner in Spielerfarbe. Die Silhouetten sind bewusst
    // gut unterscheidbar (Haeuserzeile / Turm / Anker / Halle mit Schornstein),
    // denn bei kleinem Zoom sind das nur wenige Pixel.
    for (const b of g.buildings) {
      const x = cx(b.cell), y = cy(b.cell);
      const col = b.owner >= 0 ? g.players[b.owner].color : '#888';
      if (b.kind === 'city') {
        // Haeuserzeile: drei unterschiedlich hohe Haeuser
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(x - 2.9, y - 1, 2, 3.6);
        ctx.fillRect(x - 1.1, y - 2.7, 2.2, 5.3);
        ctx.fillRect(x + 0.9, y - 1.7, 2, 4.3);
        ctx.fillStyle = col;
        ctx.fillRect(x - 2.45, y - 0.5, 1.1, 2.6);
        ctx.fillRect(x - 0.65, y - 2.2, 1.3, 4.3);
        ctx.fillRect(x + 1.35, y - 1.2, 1.1, 3.3);
      } else if (b.kind === 'fort') {
        // Turm mit Zinnen
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(x, y, 2.9, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = col;
        ctx.fillRect(x - 1.6, y - 1.1, 3.2, 3.1);      // Turmkoerper
        ctx.fillRect(x - 1.6, y - 2, 0.9, 1);          // Zinne links
        ctx.fillRect(x - 0.45, y - 2, 0.9, 1);         // Zinne mitte
        ctx.fillRect(x + 0.7, y - 2, 0.9, 1);          // Zinne rechts
      } else if (b.kind === 'port') {
        // Anker auf einer Raute
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.moveTo(x, y - 3); ctx.lineTo(x + 3, y); ctx.lineTo(x, y + 3); ctx.lineTo(x - 3, y);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = col;
        ctx.beginPath();                                // Ring oben
        ctx.arc(x, y - 1.5, 0.75, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillRect(x - 0.35, y - 1.2, 0.7, 3);        // Schaft
        ctx.fillRect(x - 1.4, y - 0.6, 2.8, 0.6);       // Querbalken
        ctx.strokeStyle = col;
        ctx.lineWidth = 0.7;
        ctx.beginPath();                                // Flunken (Bogen unten)
        ctx.moveTo(x - 1.7, y + 0.9);
        ctx.quadraticCurveTo(x, y + 3.1, x + 1.7, y + 0.9);
        ctx.stroke();
      } else if (b.kind === 'factory') {
        // Halle mit Schornstein (Schornstein ragt heraus -> klare Silhouette)
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(x - 2.7, y - 1.7, 5.4, 4.3);
        ctx.fillRect(x + 0.7, y - 3.4, 1.8, 2);
        ctx.fillStyle = col;
        ctx.fillRect(x - 2.1, y - 1.1, 4.2, 3.1);       // Halle
        ctx.fillRect(x + 1.05, y - 3, 1.1, 1.9);        // Schornstein
      }
    }

    // Züge auf den Schienen
    for (const tr of g.trains) {
      const [tx, ty] = g.trainPos(tr);
      ctx.fillStyle = '#2b2016';
      ctx.fillRect(tx - 1.4, ty - 0.9, 2.8, 1.8);
      ctx.fillStyle = g.players[tr.owner].color;
      ctx.fillRect(tx - 0.8, ty - 0.4, 1.6, 0.8);
    }

    // Handelsschiffe (kleine Kreise)
    for (const s of g.tradeShips) {
      const c = g.tradeShipCell(s);
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(cx(c), cy(c), 1.4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = g.players[s.owner].color;
      ctx.beginPath(); ctx.arc(cx(c), cy(c), 0.85, 0, Math.PI * 2); ctx.fill();
    }

    // Transportboote (Invasion)
    for (const boat of g.boats) {
      const c = boat.path[Math.min(boat.path.length - 1, boat.pos | 0)];
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(cx(c) - 1.8, cy(c) - 1.2, 3.6, 2.4);
      ctx.fillStyle = g.players[boat.owner].color;
      ctx.fillRect(cx(c) - 1.1, cy(c) - 0.6, 2.2, 1.2);
    }

    // Kriegsschiffe (größer, mit Lebensbalken)
    for (const ws of g.warships) {
      const x = cx(ws.cell), y = cy(ws.cell);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x - 2.4, y - 1.3, 4.8, 2.6);
      ctx.fillStyle = g.players[ws.owner].color;
      ctx.fillRect(x - 1.7, y - 0.7, 3.4, 1.4);
      // Lebensbalken darueber: gruen > 50% HP, sonst rot
      const maxHp = g.warshipMaxHp(ws);
      const frac = Math.max(0, (maxHp - ws.dmg) / maxHp);
      ctx.fillStyle = '#222';
      ctx.fillRect(x - 2.4, y - 2.4, 4.8, 0.7);
      ctx.fillStyle = frac > 0.5 ? '#38b000' : '#e63946';
      ctx.fillRect(x - 2.4, y - 2.4, 4.8 * frac, 0.7);
    }
  }
}
