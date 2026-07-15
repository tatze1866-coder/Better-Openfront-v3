// Deterministischer Zufallsgenerator (mulberry32) – wichtig für Lockstep:
// alle Clients simulieren mit demselben Seed exakt dasselbe Spiel.
// Math.random() waere hier verboten, weil jeder Client andere Werte bekaeme
// und die Spiele auseinanderlaufen wuerden.
export function mulberry32(seed) {
  // Interner 32-Bit-Zustand; wird bei jedem Aufruf weitergedreht.
  let a = seed | 0;
  // Zurueckgegeben wird eine Funktion, die bei jedem Aufruf die naechste
  // Zufallszahl im Bereich [0, 1) liefert (wie Math.random, aber reproduzierbar).
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    // Ergebnis auf 32 Bit begrenzen und auf 0..1 normieren.
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Deterministischer 2D-Hash für Rauschen (nur 32-Bit-Operationen).
// Liefert fuer dieselben (x, y, seed) immer denselben Wert in [0, 1) – wird
// bei der Kartengenerierung als "Rauschen pro Zelle" benutzt (siehe mapgen.js).
export function hash2(x, y, seed) {
  // Koordinaten und Seed zu einem Startwert vermischen ...
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 974634211)) | 0;
  // ... dann kraeftig durchmischen (Bit-Shifts), damit benachbarte Zellen
  // sehr unterschiedliche Werte bekommen.
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
