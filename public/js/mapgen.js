// Prozedurale Kartengenerierung: Archipel aus mehreren Inseln
// (fraktales Value-Noise + schwacher radialer Abfall zu den Rändern).
import { hash2 } from './rng.js';

function smooth(t) { return t * t * (3 - 2 * t); }

function valueNoise(x, y, seed) {
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const fx = smooth(x - x0), fy = smooth(y - y0);
  const v00 = hash2(x0, y0, seed);
  const v10 = hash2(x0 + 1, y0, seed);
  const v01 = hash2(x0, y0 + 1, seed);
  const v11 = hash2(x0 + 1, y0 + 1, seed);
  const a = v00 + (v10 - v00) * fx;
  const b = v01 + (v11 - v01) * fx;
  return a + (b - a) * fy;
}

function fractal(x, y, seed) {
  let v = 0, amp = 0.55, freq = 1 / 34, norm = 0;
  for (let o = 0; o < 4; o++) {
    v += valueNoise(x * freq, y * freq, seed + o * 101) * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2.1;
  }
  return v / norm;
}

const MIN_ISLAND_SIZE = 100; // kleinere Landflecken werden zu Wasser

// Zusammenhängende Landmassen finden; kleine entfernen.
// Liefert pro Zelle die Insel-Nummer (-1 = Wasser) und die Inselgrößen.
function labelIslands(terrain, w, h) {
  const label = new Int32Array(w * h).fill(-1);
  const queue = new Int32Array(w * h);
  const sizes = [];
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
      if (x > 0 && terrain[c - 1] === 1 && label[c - 1] === -1) { label[c - 1] = L; queue[tail++] = c - 1; }
      if (x < w - 1 && terrain[c + 1] === 1 && label[c + 1] === -1) { label[c + 1] = L; queue[tail++] = c + 1; }
      if (y > 0 && terrain[c - w] === 1 && label[c - w] === -1) { label[c - w] = L; queue[tail++] = c - w; }
      if (y < h - 1 && terrain[c + w] === 1 && label[c + w] === -1) { label[c + w] = L; queue[tail++] = c + w; }
    }
    sizes.push(size);
  }
  // Kleine Inseln entfernen, verbleibende kompakt neu nummerieren
  const remap = new Int32Array(sizes.length).fill(-1);
  const newSizes = [];
  for (let L = 0; L < sizes.length; L++) {
    if (sizes[L] >= MIN_ISLAND_SIZE) {
      remap[L] = newSizes.length;
      newSizes.push(sizes[L]);
    }
  }
  const island = new Int16Array(w * h).fill(-1);
  let landCount = 0;
  for (let i = 0; i < w * h; i++) {
    if (terrain[i] !== 1) continue;
    const L = remap[label[i]];
    if (L === -1) {
      terrain[i] = 0;
    } else {
      island[i] = L;
      landCount++;
    }
  }
  return { island, islandSizes: newSizes, landCount };
}

export function generateMap(seed, w, h) {
  const terrain = new Uint8Array(w * h); // 0 = Wasser, 1 = Land
  const heights = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const nx = (x / w) * 2 - 1, ny = (y / h) * 2 - 1;
      const r = Math.sqrt(nx * nx + ny * ny);
      // Schwacher Radial-Abfall: mehrere Inseln statt eines Kontinents
      heights[y * w + x] = fractal(x, y, seed) * 0.9 + (1 - r) * 0.24;
    }
  }
  // Schwellwert anpassen, bis der Landanteil passt
  let threshold = 0.66;
  for (let tries = 0; tries < 24; tries++) {
    let landCount = 0;
    for (let i = 0; i < w * h; i++) {
      terrain[i] = heights[i] > threshold ? 1 : 0;
      if (terrain[i]) landCount++;
    }
    const frac = landCount / (w * h);
    if (frac < 0.3) threshold -= 0.015;
    else if (frac > 0.46) threshold += 0.015;
    else break;
  }
  const { island, islandSizes, landCount } = labelIslands(terrain, w, h);
  return { w, h, terrain, landCount, island, islandSizes };
}
