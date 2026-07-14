// Canvas-Renderer: Karte als ImageData in Kartenauflösung,
// hochskaliert mit Zoom & Pan gezeichnet.

const WATER = [45, 90, 140];
const NEUTRAL = [181, 173, 138];
const NEUTRAL_EDGE = [160, 152, 118];

function hexToRgb(hex) {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}
function darken(rgb, f) {
  return [rgb[0] * f | 0, rgb[1] * f | 0, rgb[2] * f | 0];
}

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
    this.mini = document.getElementById('minimap');
    this.miniCtx = this.mini ? this.mini.getContext('2d') : null;
    const { w, h } = game.map;
    this.off = document.createElement('canvas');
    this.off.width = w;
    this.off.height = h;
    this.offCtx = this.off.getContext('2d');
    this.img = this.offCtx.createImageData(w, h);
    this.imgDirty = true;

    this.colors = game.players.map(p => hexToRgb(p.color));
    this.colorsEdge = this.colors.map(c => darken(c, 0.62));

    this.resize();
    // Start: Karte einpassen
    const s = Math.min(canvas.width / w, canvas.height / h) * 0.95;
    this.scale = s;
    this.ox = (canvas.width - w * s) / 2;
    this.oy = (canvas.height - h * s) / 2;

    this.repaintAll();
  }

  resize() {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }

  cellColor(c) {
    const g = this.game;
    if (g.map.terrain[c] === 0) return WATER;
    const o = g.owner[c];
    // Randzellen dunkler zeichnen (Grenzen sichtbar machen)
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

  paintCell(c) {
    const rgb = this.cellColor(c);
    const i = c * 4;
    this.img.data[i] = rgb[0];
    this.img.data[i + 1] = rgb[1];
    this.img.data[i + 2] = rgb[2];
    this.img.data[i + 3] = 255;
  }

  repaintAll() {
    const n = this.game.map.w * this.game.map.h;
    for (let c = 0; c < n; c++) this.paintCell(c);
    this.imgDirty = true;
  }

  // Geänderte Zellen + Nachbarn neu einfärben (wegen Grenz-Schattierung)
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

  screenToCell(mx, my) {
    const x = Math.floor((mx - this.ox) / this.scale);
    const y = Math.floor((my - this.oy) / this.scale);
    const { w, h } = this.game.map;
    if (x < 0 || y < 0 || x >= w || y >= h) return -1;
    return y * w + x;
  }

  zoomAt(mx, my, factor) {
    const { w, h } = this.game.map;
    const minScale = Math.min(this.canvas.width / w, this.canvas.height / h) * 0.5;
    const ns = Math.max(minScale, Math.min(24, this.scale * factor));
    const f = ns / this.scale;
    this.ox = mx - (mx - this.ox) * f;
    this.oy = my - (my - this.oy) * f;
    this.scale = ns;
  }

  pan(dx, dy) {
    this.ox += dx;
    this.oy += dy;
  }

  // Ansicht auf eine Kartenposition zentrieren (für Minimap-Klicks)
  centerOn(mapX, mapY) {
    this.ox = this.canvas.width / 2 - mapX * this.scale;
    this.oy = this.canvas.height / 2 - mapY * this.scale;
  }

  draw() {
    if (this.imgDirty) {
      this.offCtx.putImageData(this.img, 0, 0);
      this.imgDirty = false;
    }
    const ctx = this.ctx;
    ctx.fillStyle = '#16283c';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.imageSmoothingEnabled = false;
    ctx.setTransform(this.scale, 0, 0, this.scale, this.ox, this.oy);
    ctx.drawImage(this.off, 0, 0);
    this.drawOverlays(ctx);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.drawBadges(ctx);
    this.drawMinimap();
  }

  // Truppen-Badges für laufende Angriffe und Boote (in Bildschirmkoordinaten)
  drawBadges(ctx) {
    const g = this.game;
    const w = g.map.w;
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
    for (const boat of g.boats) {
      const c = boat.path[Math.min(boat.path.length - 1, boat.pos | 0)];
      badge(c % w + 0.5, ((c / w) | 0) - 2.5, '🚢 ' + fmt(boat.troops), g.players[boat.owner].color);
    }
  }

  // Minimap mit Sichtfenster-Rahmen
  drawMinimap() {
    if (!this.miniCtx) return;
    const m = this.mini, mctx = this.miniCtx;
    mctx.imageSmoothingEnabled = false;
    mctx.fillStyle = '#16283c';
    mctx.fillRect(0, 0, m.width, m.height);
    mctx.drawImage(this.off, 0, 0, m.width, m.height);
    const fx = m.width / this.game.map.w, fy = m.height / this.game.map.h;
    const x0 = (-this.ox / this.scale) * fx;
    const y0 = (-this.oy / this.scale) * fy;
    const vw = (this.canvas.width / this.scale) * fx;
    const vh = (this.canvas.height / this.scale) * fy;
    mctx.strokeStyle = 'rgba(255,255,255,0.9)';
    mctx.lineWidth = 1;
    mctx.strokeRect(x0, y0, vw, vh);
  }

  // Gebäude und Boote (in Kartenkoordinaten, Transform ist aktiv)
  drawOverlays(ctx) {
    const g = this.game;
    const w = g.map.w;
    for (const b of g.buildings) {
      const x = b.cell % w + 0.5, y = ((b.cell / w) | 0) + 0.5;
      const col = b.owner >= 0 ? g.players[b.owner].color : '#888';
      if (b.kind === 'city') {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(x - 2, y - 2, 4, 4);
        ctx.fillStyle = col;
        ctx.fillRect(x - 1.2, y - 1.2, 2.4, 2.4);
      } else {
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(x, y, 2.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.arc(x, y, 1.3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    for (const boat of g.boats) {
      const c = boat.path[Math.min(boat.path.length - 1, boat.pos | 0)];
      const x = c % w + 0.5, y = ((c / w) | 0) + 0.5;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x - 1.8, y - 1.2, 3.6, 2.4);
      ctx.fillStyle = g.players[boat.owner].color;
      ctx.fillRect(x - 1.1, y - 0.6, 2.2, 1.2);
    }
  }
}
