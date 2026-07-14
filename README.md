# OpenFront Klon

Ein Browser-Strategiespiel im Stil von [openfront.io](https://openfront.io/) / territorial.io:
Startpunkt wählen, Truppen wachsen lassen, Gebiete erobern und die Karte dominieren.

## Features

- **Einzelspieler** gegen 1–8 Bots (läuft komplett lokal im Browser)
- **3 Bot-Schwierigkeitsgrade**: 🟢 Leicht, 🟡 Mittel, 🔴 Schwer
  (Schwer denkt schneller, greift aggressiver an, baut Städte & Festungen
  und geht selten Allianzen ein)
- **Mehrspieler-Lobby** für bis zu 5 Freunde + Bots (per 4-stelligem Code)
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

## Steuerung

| Aktion | Eingabe |
| --- | --- |
| Startpunkt wählen (erste 12s) | Klick auf freies Land |
| Angreifen / Ausbreiten | **Linksklick** auf neutrales oder gegnerisches Gebiet |
| Karte bewegen | **W A S D** oder **Pfeiltasten** (oder mit der Maus ziehen) |
| Zoom | Mausrad · **Minimap** anklicken springt zur Stelle |
| Stadt bauen | Taste **1** (oder Button), dann eigenes Gebiet anklicken |
| Festung bauen | Taste **2** (oder Button), dann eigenes Gebiet anklicken |
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
- **Stadt** (500 Truppen): +2500 Truppenlimit und zusätzliches Einkommen.
- **Festung** (300 Truppen): Angriffe im Radius 8 kosten den Angreifer das Doppelte.
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
