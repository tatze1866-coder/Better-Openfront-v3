# Better Openfront

Ein Browser-Strategiespiel im Stil von [openfront.io](https://openfront.io/) / territorial.io:
Startpunkt wählen, Truppen wachsen lassen, Gebiete erobern und die Karte dominieren.

Alle Änderungen und Versionen: siehe [CHANGELOG.md](CHANGELOG.md).

try : https://better-openfront-v3.onrender.com

## Features

- **Einzelspieler** gegen 1–15 Bots (läuft komplett lokal im Browser)
- **3 Bot-Schwierigkeitsgrade**: 🟢 Leicht, 🟡 Mittel, 🔴 Schwer
  (Schwer denkt schneller, greift aggressiver an, baut Städte & Festungen
  und geht selten Allianzen ein)
- **Mehrspieler-Lobby** für bis zu 5 Freunde + Bots (per 4-stelligem Code)
- **8 Karten**: 🎲 Zufalls-Archipel, 🌍 Weltkarte, Europa, Asien, Afrika,
  Nord-/Südamerika, Australien & Ozeanien – jeweils in 3 Größen
  (320×200 / 480×300 / 640×400); Küstenlinien variieren leicht pro Spiel
- **Angriffs-Anzeigen**: laufende Angriffe und Boote zeigen ihre
  verbleibenden Truppen direkt auf der Karte (⚔ / 🚢)
- **Minimap** unten rechts mit Sichtfenster – Klick/Ziehen springt dorthin
- Prozedural generierte **Archipel-Karten** (mehrere Inseln pro Spiel)
- **Boote**: Klick auf eine fremde Insel schickt eine Invasionsflotte
- **Gebäude**: Städte (mehr Einkommen & Truppenlimit) und Festungen
  (doppelte Verteidigung im Umkreis) – erobert werden sie mit dem Gebiet
- **Allianzen**: per Klick auf die Rangliste anfragen/annehmen/brechen
- Verlassene Spieler werden automatisch von Bots übernommen

## Starten

Voraussetzung: [Node.js](https://nodejs.org/) installiert.

```
npm install
npm start
```

Dann im Browser öffnen: **http://localhost:3000**

## Mit Freunden spielen

1. Einer startet den Server (`npm start`) und erstellt eine Lobby.
2. Freunde im **gleichen Netzwerk** öffnen `http://<deine-IP>:3000`
   (IP herausfinden: `ipconfig` → IPv4-Adresse) und treten mit dem Code bei.
3. Über das Internet: Port 3000 im Router freigeben oder ein Tool wie
   [Tailscale](https://tailscale.com/) / Hamachi nutzen.

## Online hosten (öffentlicher Server)

Der Server ist hosting-fertig: er liest `PORT` aus der Umgebung, lauscht auf
`0.0.0.0`, hält WebSocket-Verbindungen per Ping am Leben, und der Client
nutzt automatisch `wss://` hinter HTTPS. Damit funktioniert jeder
Node-Hoster mit WebSocket-Unterstützung:

- **Render** (kostenloser Tarif): Repo zu GitHub pushen → auf
  [render.com](https://render.com/) „New Web Service" → Build `npm install`,
  Start `node server.js`. Fertig – Freunde öffnen einfach die Render-URL.
  (Im Free-Tarif schläft der Server nach Inaktivität; erster Aufruf dauert
  dann ~30 s.)
- **Railway / Fly.io**: analog, beide erkennen Node automatisch.
- **Eigener Server / Docker**: `docker build -t openfront . && docker run -p 3000:3000 openfront`

Hinweis: Der Server verteilt nur Lobby-Daten und Eingaben (kein
Spielzustand) – er braucht praktisch keine Rechenleistung, der kleinste
Tarif reicht.

## Steuerung

| Aktion | Eingabe |
| --- | --- |
| Startpunkt wählen (erste 12s) | Klick auf freies Land |
| Angreifen / Ausbreiten | **Linksklick** auf neutrales oder gegnerisches Gebiet |
| Karte bewegen | **W A S D** oder **Pfeiltasten** (oder mit der Maus ziehen) |
| Zoom | Mausrad · **Minimap** anklicken springt zur Stelle |
| Bauen | Tasten **1**–**4** (Stadt/Festung/Hafen/Fabrik) oder Buttons, dann eigenes Gebiet anklicken |
| Kriegsschiff bauen | **Rechtsklick** auf eigenen Hafen |
| Kontextmenü (Allianz, Boot, Bauen) | **Rechtsklick** auf ein Gebiet oder einen Namen in der Rangliste |
| Boot auf fremde Insel schicken | **Rechtsklick** auf die Ziel-Insel → „Boot hierher" (braucht eigene Küste) |
| Allianz anfragen / annehmen / brechen | Rechtsklick auf Spieler, oder Namen in der Rangliste anklicken |
| Truppen-Anteil des Angriffs | Slider unten |
| Modus / Menü abbrechen | **Esc** |

Eine Kurzübersicht der Steuerung wird im Spiel oben links eingeblendet
(lässt sich ein-/ausklappen).

## Spielregeln (Kurzfassung)

- Truppen wachsen mit der Zeit; mehr Gebiet = mehr Einkommen.
- Ein Angriff schickt den eingestellten Prozentsatz deiner Truppen los;
  sie erobern Zellen entlang der gemeinsamen Grenze.
- Neutrales Land ist billig, Gegner kosten je nach Truppendichte mehr.
- **Truppenwachstum** folgt einer Kurve: am schnellsten bei **40 %** des
  Truppenlimits, darüber fällt es bis 0 ab (orange Anzeige im HUD).
- **Geld (€)** ist die Bauwährung: Basiseinkommen aus Gebiet, richtig
  lukrativ sind Handel (Häfen) und Züge (Fabriken).
- **Steigende Preise**: Jede weitere Stadt kostet das Doppelte der
  vorherigen (max. 8-facher Grundpreis). Häfen und Fabriken teilen sich
  dabei einen gemeinsamen Zähler; Festungen bleiben konstant. Verlierst
  du Gebäude, sinkt der Preis wieder.
- **Stadt** (250 €): +2500 Truppenlimit und mehr Truppenwachstum.
- **Festung** (200 €): Angriffe im Radius 8 kosten den Angreifer das **5-fache**.
- **Hafen** (250 €, braucht Küste): schickt automatisch Handelsschiffe zu
  fremden Häfen – bei Ankunft verdienen **beide** Seiten. Am Hafen lassen
  sich **Kriegsschiffe** (300 €) bauen: Sie versenken nicht-verbündete
  Transportboote (1 Treffer) und beschießen feindliche Kriegsschiffe
  (5–8 Leben, wächst mit dem Alter). Beschädigte Schiffe fahren zum
  Reparieren automatisch zurück zum Hafen. Berühren sie ein fremdes
  Handelsschiff, wird es **gekapert** – das Geld gehört dann dir.
- **Fabrik** (400 €): verbindet alle Städte und Häfen im Radius 30 –
  eigene wie fremde – mit einem Schienennetz. Mit etwas Glück spawnen
  Züge (mehrere gleichzeitig möglich), die pro Stationsbesuch Geld
  bringen: eigene Station < fremde < verbündete.
- **Boote** (max. 3 gleichzeitig): landen am nächstgelegenen passenden
  Küstenabschnitt der Ziel-Insel und kämpfen dort als Brückenkopf weiter.
- **Allianzen**: Verbündete können sich nicht angreifen und gewinnen
  als **Team**: Hält ein Bündnis zusammen 70 % des Landes oder sind nur
  noch Verbündete übrig, gewinnen alle Partner gemeinsam.
- Wer 70 % des Landes hält oder als Letzter übrig ist, gewinnt.

## Technik

Der Server (`server.js`) simuliert nichts, er verteilt nur Eingaben im
100-ms-Takt (Lockstep). Jeder Client simuliert das Spiel deterministisch
mit demselben Seed – dadurch nutzen Einzelspieler und Mehrspieler
denselben Engine-Code (`public/js/engine.js`).
