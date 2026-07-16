# Changelog

Alle nennenswerten Änderungen am OpenFront Klon.
Format angelehnt an [Keep a Changelog](https://keepachangelog.com/de/), Versionen nach [SemVer](https://semver.org/lang/de/).

## [0.8.1] – 2026-07-16

### Geändert
- **Gegenangriffe entscheiden sich schneller**: Greifen sich zwei Spieler
  gegenseitig an, rückt die stärkere Front in kürzerem Takt vor – je größer
  das Truppen-Verhältnis, desto schneller (bis zu 5x). Ein Schlagabtausch
  zieht sich damit nicht mehr endlos hin.

### Behoben
- **Riesige Karte in der Lobby wählbar**: Der Server kannte die Größe
  „Riesig" nicht und setzte die Auswahl immer auf den alten Wert zurück.

## [0.8.0] – 2026-07-16

### Geändert
- **Bevölkerung an die Referenz angeglichen**: Eine Zelle trägt jetzt 3
  Bevölkerung (statt 120), eine Stadt +25.000 (statt +2.500). Städte sind
  damit wie vorgesehen das wichtigste Gebäude – eine Stadt entspricht 8.333
  Feldern statt bisher 21.
- **Wachstum hängt an der Kapazität** (`max / REFILL_TICKS * Kurve`) statt an
  festen Koeffizienten. Vorher klebte der Füllstand bei 0–7%, wodurch die
  Wachstumskurve wirkungslos war und die Bots nie Städte bauten (ihre Regel
  verlangt 60% Füllstand). Jetzt durchläuft der Füllstand den ganzen Bereich.
- **Wachstums-Maximum bei 42%** des Limits (vorher 40%).
- **Festungs-Radius 30** statt 8 Felder. 5x Verteidigung und das Nicht-Stapeln
  mehrerer Festungen galten bereits.
- **Handelsgold steigt überproportional mit der Distanz**:
  `40 + 0,6 * Distanz^1,1` statt linear `40 + 0,35 * Distanz`. Entspricht der
  Referenzformel `10.000 + 150 * d^1,1`, auf unsere Geld-Größenordnung
  heruntergerechnet. Handel bringt dadurch rund 2,6x mehr.
- **Preise**: Stadt geht eine Verdopplung weiter (250 → 500 → 1.000 → 2.000 →
  4.000 €), Festung 200 → 300 €, Hafen 250 → 400 €, Fabrik 400 → 600 €.

## [0.7.1] – 2026-07-15

### Geändert
- **Steigende Baupreise**: Jedes weitere Gebäude eines Typs kostet das
  Doppelte des vorherigen, gecappt nach 3 Verdopplungen (max. 8-facher
  Grundpreis). Häfen und Fabriken teilen sich einen gemeinsamen Zähler,
  Festungen bleiben konstant. Der Preis richtet sich nach den aktuell
  besessenen Gebäuden – verlorene Gebäude machen den nächsten Bau wieder
  günstiger. Buttons und Kontextmenü zeigen immer den aktuellen Preis.

## [0.7.0] – 2026-07-15

### Hinzugefügt
- **Geld (€)** als Bauwährung: Basiseinkommen aus Gebiet, Anzeige im HUD.
- **Hafen** (braucht Küste): schickt automatisch Handelsschiffe zu fremden
  Häfen – bei Ankunft verdienen beide Seiten.
- **Kriegsschiffe** (am eigenen Hafen per Rechtsklick baubar):
  - versenken nicht-verbündete Transportboote mit einem Treffer
  - beschießen feindliche Kriegsschiffe (5–8 Leben, wächst mit dem Alter
    des Schiffs)
  - fahren beschädigt automatisch zum Hafen zurück und reparieren sich
  - kapern fremde Handelsschiffe durch Berührung (Geld geht an den Käpt'n)
- **Fabrik**: verbindet alle Städte und Häfen im Radius 30 – eigene wie
  fremde – mit einem sichtbaren Schienennetz. Züge spawnen mit einer
  Chance (mehrere gleichzeitig möglich) und zahlen pro Stationsbesuch:
  eigene Station < fremde < verbündete.
- Bau-Shortcuts **3** (Hafen) und **4** (Fabrik); Bot-KI baut und nutzt
  die neuen Gebäude mit.

### Geändert
- **Truppenwachstum als Kurve**: Maximum bei 40 % des Truppenlimits,
  darüber abfallend bis 0 – der Anstieg wird orange im HUD angezeigt.
  Der alte Zinseszins-Effekt entfällt.
- Gebäude kosten Geld statt Truppen.
- **Festungen** verteuern Angriffe im Radius 8 jetzt um das 5-fache
  (vorher 2-fach).

## [0.6.0] – 2026-07-15

### Behoben
- **Angriffe rücken als geschlossene Linie vor** statt in Flecken: Die
  komplette Front fällt im festen Takt (0,3 s gegen Neutral, 0,5 s gegen
  Spieler) und wird vor jedem Vorstoß frisch von der aktuellen Grenze
  berechnet.
- Gegenangriffe brechen den eigenen Angriff nicht mehr vorzeitig ab –
  beide Fronten kämpfen, bis ein Truppen-Pool erschöpft ist.
- Mehrere gleichzeitige Angriffe auf verschiedene Ziele funktionieren
  zuverlässig; Klicks aufs selbe Ziel schicken Nachschub an die Front.

## [0.5.0] – 2026-07-15

### Hinzugefügt
- **8 Karten**: Zufalls-Archipel, stilisierte Weltkarte sowie Europa,
  Asien, Afrika, Nordamerika, Südamerika und Australien & Ozeanien –
  Küstenlinien variieren leicht pro Spiel.
- **3 Kartengrößen**: Klein (320×200), Mittel (480×300, Standard),
  Groß (640×400).
- Bis zu **15 Bots** (vorher 8), 20 eindeutige Spielerfarben.
- Karten- und Größenauswahl in Menü und Lobby (Host-gesteuert,
  für Mitspieler sichtbar).

### Geändert
- **Online-Hosting vorbereitet**: WebSocket-Keepalive gegen
  Proxy-Timeouts, Dockerfile, `.gitignore`/`.dockerignore`,
  Deploy-Anleitung für Render/Railway/Docker im README.

## [0.4.0] – 2026-07-14

### Hinzugefügt
- **Kamerasteuerung mit WASD / Pfeiltasten** (flüssig, zeitbasiert).
- **Zifferntasten** als Bau-Shortcuts (1 = Stadt, 2 = Festung).
- **Rechtsklick-Kontextmenü** auf Gebiete und Ranglisten-Namen:
  Allianz anfragen/annehmen/brechen, Angreifen, Boot schicken, Bauen.
  Rechtsklick aufs Wasser wählt automatisch das nächstgelegene Land.
- Ein-/ausklappbare **Shortcut-Legende** oben links.

## [0.3.0] – 2026-07-14

### Hinzugefügt
- **Angriffs-Anzeigen**: Badges an der Front zeigen die verbleibenden
  Truppen laufender Angriffe und Boote (⚔ / 🚢).
- **Minimap** unten rechts mit Sichtfenster-Rahmen; Klick/Ziehen springt
  zur Position.
- **3 Bot-Schwierigkeitsgrade** 🟢 Leicht / 🟡 Mittel / 🔴 Schwer –
  unterschiedlich in Denktempo, Aggressivität, Bauverhalten und
  Allianzbereitschaft; wählbar im Menü und in der Lobby.

### Geändert
- **Team-Sieg**: Verbündete gewinnen gemeinsam (70 % Land zusammen oder
  letztes verbliebenes Bündnis) statt „größtes Reich gewinnt".

## [0.2.0] – 2026-07-14

### Hinzugefügt
- **Archipel-Karten** mit mehreren Inseln pro Spiel.
- **Boote**: Klick auf eine fremde Insel schickt eine Invasionsflotte
  (max. 3, braucht eigene Küste, landet als Brückenkopf).
- **Gebäude**: Stadt (+Truppenlimit, +Einkommen) und Festung
  (Verteidigungsbonus im Radius) – wechseln bei Eroberung den Besitzer.
- **Allianzen** per Klick auf die Rangliste; Verbündete können sich
  nicht angreifen. Bots nehmen Anfragen situativ an.
- Verlassene Spieler werden von der Bot-KI übernommen.

## [0.1.0] – 2026-07-13

### Hinzugefügt
- Erste spielbare Version im Stil von openfront.io / territorial.io:
  - Prozedural generierte Karten, Startpunkt-Wahl, Truppenwachstum,
    Expansion und Angriffe per Klick mit Truppen-Slider
  - **Einzelspieler** gegen Bots (läuft komplett lokal im Browser)
  - **Mehrspieler-Lobby** für bis zu 5 Freunde per 4-stelligem Code
  - Deterministische Lockstep-Engine: Der Server verteilt nur Eingaben,
    alle Clients simulieren identisch (gleicher Code offline wie online)
  - Canvas-Renderer mit Zoom & Pan, Rangliste, Sieg bei 70 % der Karte
  - Headless-Testsuite (`npm test`)
