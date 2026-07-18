# Changelog

Alle nennenswerten Änderungen am OpenFront Klon.
Format angelehnt an [Keep a Changelog](https://keepachangelog.com/de/), Versionen nach [SemVer](https://semver.org/lang/de/).

## [0.19.0] – 2026-07-18

### Hinzugefügt
- **Lebendigere Schlacht**: Wo Gebiete den Besitzer wechseln, steigen jetzt
  kleine Glühfunken in der Farbe des neuen Besitzers auf (bei verbranntem
  Land in Aschgrau); neu entstehende Trümmerfelder zerplatzen in einem
  kurzen Staub-/Schutt-Burst.
- **Angriffs-Richtungspfeile**: Laufende Angriffe zeigen eine animierte
  gestrichelte Linie („marschierende Ameisen") vom Zentrum des Angreifers
  zur Front mit Pfeilspitze am Ziel – auf einen Blick sichtbar, wer wen
  angreift. Angriffs-Badges pulsieren zusätzlich leicht.
- **Brandung & Kielwasser**: Entlang der Küsten pulsiert ein feiner
  Schaum-Saum, und hinter Handelsschiffen, Transportbooten und fahrenden
  Kriegsschiffen zieht eine verblassende Kielwasser-Spur her.
- **Dampfzüge & Führungskrone**: Über jedem Zug steigen kleine
  Dampfwölkchen auf; das flächengrößte Reich trägt eine goldene Krone
  über seinem Namen auf der Karte.
- Alle neuen Effekte respektieren die Einstellung „Animationen aus"
  (statisch bzw. abgeschaltet) und sind rein kosmetisch – die Simulation
  bleibt unverändert deterministisch.

## [0.18.0] – 2026-07-18

### Behoben
- **Feuerpfeil eliminiert jetzt Spieler, deren letztes Gebiet verbrennt** –
  vorher blieb ein „Geister“-Spieler ohne einzige Zelle formal am Leben und
  konnte so sogar die Siegbedingung dauerhaft blockieren. Jetzt scheidet er
  aus wie bei Land- und Bootsangriffen (inkl. Meldung im Ereignis-Feed).
- Klick zum Feuern während der Nachladezeit zeigt jetzt die Restzeit an,
  statt fälschlich „Turm feuert!“ zu melden, obwohl die Engine den Schuss
  stumm verwirft.
- Wird der ausgewählte Turm zerstört oder erobert, hebt sich die Auswahl
  jetzt automatisch auf – vorher blieb das Panel „angelegt“ und Klicks
  verpufften kommentarlos.
- Kriegsschiff-/Katapult-Bau im Rechtsklick-Menü ist während der Aufbauzeit
  von Hafen bzw. Fabrik jetzt ausgegraut („Noch im Aufbau.“) statt einen
  Erfolgs-Toast zu zeigen, obwohl die Engine den Bau ablehnt.

### Geändert (Übersetzung/UI)
- Alle Turm-, Katapult- und Kriegsschiff-Hinweise (Toasts, Turm-Panel,
  Munitionsnamen, Ereignis-Feed, Rechtsklick-Menü) laufen jetzt über die
  Übersetzung (Deutsch/Englisch) statt hartkodiert deutsch zu sein; die
  Steuerungs-Legende wird mitübersetzt und nennt jetzt auch Taste 5 (Turm).
- **Turm griff Gegner faktisch nicht an**: Stein/Pfeil beschädigten bisher
  ausschließlich Gebäude im Aufschlagsradius – auf leerem Gegnerland (der
  Regelfall abseits von Städten/Festungen) passierte sichtbar gar nichts.
  Jeder Treffer auf gegnerisches Gebiet kostet den Getroffenen jetzt zusätzlich
  Truppen (Stein: 3, Pfeil: 6 – einmalig pro Schuss, nicht pro Zelle im
  Radius), unabhängig davon, ob dort ein Gebäude steht.

### Geändert
- **Turm-Reichweite ist jetzt global** (vorher 14 Zellen) – jede Landzelle
  der Karte ist ein gültiges Ziel. Ausgleich: die Nachladezeit wurde auf
  ca. 40 Sekunden je Schuss angehoben (vorher 1–4 s je nach Munition).
- Das Turm-Kontrollfeld ist jetzt ein permanent schwebendes Panel unten
  mittig (direkt über der Bau-Leiste, über allem anderen), das erscheint,
  sobald man einen fertig gebauten Turm besitzt – statt nur, solange ein
  Turm ausgewählt ist. Es zeigt jetzt auch die Munitionspreise direkt an
  den Buttons an.

### Hinzugefügt
- **Neues Gebäude: Turm** 🗼 – stationäres Verteidigungs-/Angriffsgebäude
  (350 €, globale Reichweite, wie eine Festung auf eigenem Gebiet baubar).
  Anklicken wählt den Turm aus, dann Munition wählen und eine Zielzelle in
  Reichweite anklicken, um zu feuern:
  - 🪨 **Stein** – billig (15 €), kleiner Aufschlagsradius, beschädigt nur
    gegnerische Gebäude im Umkreis (Trefferpunkte, wie beim Katapult).
  - 🏹 **Pfeil** – teurer (40 €), größerer Aufschlagsradius, sonst wie Stein.
  - 🔥 **Feuerpfeil** – teuerste Munition (90 €), setzt getroffenes
    Gegnerland in Brand statt Gebäude zu beschädigen: die Zellen werden
    neutral und hinterlassen ein Trümmerfeld – die Rückeroberung kostet dort
    doppelt so viele Truppen (nutzt dieselbe Ruinen-Mechanik wie zerstörte
    Festungen). Eigenes/verbündetes Land bleibt verschont.
  Jede Munitionsart hat ihre eigene Nachladezeit; der Turm zeigt die
  Aufschlagsfläche der gewählten Munition am Cursor.

## [0.17.0] – 2026-07-17

### Hinzugefügt
- **Neue Einheit: Katapult** 🏹 – Belagerungsgeschütz, das an der eigenen
  Fabrik gebaut wird (500 €, max. 2 je Fabrik, Rechtsklick-Menü nahe der
  Fabrik). Katapulte funktionieren wie Kriegsschiffe: anklicken (oder per
  Shift-Rechteck mehrere) und ein Ziel an Land schicken. Ohne Befehl suchen
  sie selbständig die nächste feindliche Festung im Umkreis und beschießen
  sie aus der Distanz – drei Treffer zerstören eine Festung. Vorsicht: Ein
  Katapult auf erobertem Gebiet geht verloren.
- **Ruinen**: Zerstörte Festungen bleiben als Trümmerfeld auf der Karte
  liegen. Die (Rück-)Eroberung im Umkreis kostet doppelt so viele Truppen;
  beschädigte Festungen zeigen einen Lebensbalken. Ein Neubau auf der Zelle
  räumt die Ruine ab.
- **Festungs-Radius sichtbar**: Jede fertige Festung zeigt ihren
  Schutzradius als feinen Ring in der Besitzerfarbe. Im Baumodus (Taste 2)
  werden die eigenen Ringe kräftiger und eine goldene Vorschau folgt dem
  Cursor – wie schon bei der Fabrik.

### Geändert
- **Festungen deutlich robuster**: Eroberungen im Schutzradius kosten jetzt
  das Achtfache statt des Fünffachen an Truppen.
- **Eroberte Festungen werden zerstört** statt den Besitzer zu wechseln –
  sie hinterlassen eine Ruine (siehe oben).

## [0.16.3] – 2026-07-17

### Geändert
- **Hübschere Spielwelt**: Die Karte im Spiel wirkt jetzt deutlich edler –
  feinerer Tiefenverlauf im Wasser mit hellem „Lagunen"-Saum an den Küsten,
  sanft pulsierende Lichtpunkte auf dem Meer (respektiert die Einstellung
  „Animationen aus"), weichere zweistufige Reichsgrenzen mit aufgehellten
  Innenflächen und Küstenschatten, dezente Vignette an den Bildschirmrändern.
- **Namen auf der Karte**: Spielernamen erscheinen in der Cinzel-Schrift
  des Menüs, weiß mit dunklem Outline und einem Farbbalken darunter.
- **Schiffe & Badges**: Angriffs-/Boot-Badges als Pillen mit Schatten,
  Handelsschiffe mit kleinem Segel, Transportboote und Kriegsschiffe mit
  abgerundeten Rümpfen, Schienen etwas kontrastreicher.

## [0.16.2] – 2026-07-17

### Hinzugefügt
- **Gebäudezahlen im HUD**: Die eigene Leiste unten zeigt jetzt dauerhaft,
  wie viele Gebäude man je Typ besitzt (🏙 Städte, 🛡 Festungen, ⚓ Häfen,
  🏭 Fabriken) – live aktualisiert, mit Tooltip beim Draufzeigen.

## [0.16.1] – 2026-07-17

### Hinzugefügt
- **Rechteckauswahl für Kriegsschiffe**: Shift + Linksklick-Ziehen zieht
  einen goldenen Auswahlrahmen auf – alle eigenen Kriegsschiffe darin sind
  danach gleichzeitig ausgewählt und fahren mit einem Klick aufs Wasser
  gemeinsam dorthin (jedes Schiff auf seinem eigenen Seeweg). Esc oder ein
  Klick an Land hebt die gesamte Auswahl auf.

### Behoben
- **Kriegsschiff-Befehl traf das falsche Schiff**: Im Lobby-Spiel hat der
  Server die Schiff-ID des Fahrbefehls verschluckt – dadurch bekam immer
  das zuerst gebaute Schiff den Kurs (bzw. beim Mitspieler gar keines).
  Das Feld heißt jetzt `ship` und wird vom Server durchgereicht; der
  Befehl landet immer beim ausgewählten Schiff.
- **Kriegsschiff-Steuerung für Mitspieler**: Beigetretene Spieler können
  ihre Kriegsschiffe jetzt auch im Online-Spiel steuern (gleiche Ursache).

## [0.16.0] – 2026-07-17

### Hinzugefügt
- **Kriegsschiffe steuerbar**: Eigenes Kriegsschiff anklicken (goldener
  Ring), dann ein Ziel auf dem Wasser anklicken – das Schiff nimmt den
  kürzesten Seeweg dorthin und patrouilliert danach dort weiter. Der
  Wegpunkt hat Vorrang vor der Handelsschiff-Jagd; nur ein schwer
  beschädigtes Schiff fährt weiterhin zuerst zur Reparatur. Esc oder ein
  Klick an Land hebt die Auswahl auf.
- **Profil & Erfolge** (von Tatze): Profil-Button oben rechts im Menü mit
  Spielername, 20 wählbaren Wappen und einem Erfolge-System – 26 Kategorien
  mit je 4 Stufen (Siege, Gebäude, Allianzen, erobertes Land, ausgelöschte
  Nationen u.v.m.), Fortschritt wird lokal gespeichert, neue Stufen
  erscheinen als Toast und im Siegesbildschirm.

## [0.15.0] – 2026-07-17

### Hinzugefügt
- **Ereignis-Feed** (unten links): meldet Eliminierungen („X wurde von Y
  ausgelöscht"), Angriffe auf dich und Allianzen/Allianzbrüche anderer –
  gerade mit vielen Bots verliert man so nicht mehr den Überblick.
- **Verräter-Mechanik**: Wer eine Allianz bricht, gilt 90 Sekunden als
  Verräter – markiert mit 🗡 in Rangliste und Tooltip. Bots und Nationen
  verweigern Verrätern in dieser Zeit jede neue Allianz.

## [0.14.2] – 2026-07-17

### Geändert
- **Größere Landmassen im Zufalls-Archipel**: Das Gelände-Rauschen bildet
  gröbere Strukturen und Splitter-Inseln unter 400 Zellen entfallen –
  z.B. auf mittlerer Karte ~9-14 Inseln statt 30-40, auf der riesigen
  ~70 statt ~240. Landanteil und die Preset-Karten (Weltkarte & Co.)
  bleiben unverändert.

## [0.14.1] – 2026-07-17

### Geändert
- **Bots und Nationen schlagen zurück**: Wer einen Bot oder eine Nation
  angreift (auch per Boot), macht sich für 60 Sekunden zum Feind – der
  Angegriffene schlägt bevorzugt zurück, sobald er annähernd gleich stark
  ist (80% reichen), und lehnt Allianz-Anfragen des Angreifers ab. Auch
  die sonst passiven Masse-Bots wehren sich jetzt. Angriffe sind damit
  nicht mehr "gratis".

## [0.14.0] – 2026-07-17

### Hinzugefügt
- **Einstellungen** (Zahnrad im Menü): Sprache (Deutsch/Englisch),
  Gebäude-Grafikstil (Emoji / Wappen / Inseln), FPS-Anzeige, Animationen
  und ein Lautstärke-Regler (Ton folgt später). Alles wird gespeichert.

### Behoben
- **FPS-Anzeige nach Neuladen**: Die gespeicherte Einstellung wirkt jetzt
  sofort, nicht erst nach erneutem Öffnen der Einstellungen.
- **Animationen-Schalter wirkt**: „Aus" stoppt jetzt wirklich die
  dekorativen Effekte (Geld-Popups, Übergänge, Hover-Zoom).

## [0.13.1] – 2026-07-16

### Geändert
- **Fabrik-Radius-Vorschau**: Im Fabrik-Baumodus zeigt ein gelber Kreis am
  Mauszeiger schon VOR dem Bau, welche Städte/Häfen angeschlossen würden.
- **Karten-Tooltip oben mittig**: Die Spieler-Infos beim Hover über fremdes
  Gebiet erscheinen jetzt fest am oberen Bildschirmrand statt am Cursor –
  und über eigenem Gebiet gar nicht (die eigenen Werte stehen unten im HUD).

## [0.13.0] – 2026-07-16

### Hinzugefügt
- **Aufbauzeit für Gebäude**: Neue Gebäude brauchen 5 Sekunden, bis sie
  wirken – Städte geben solange keine Kapazität, Festungen keinen Schutz,
  Häfen keinen Handel/Kriegsschiffe, Fabriken keine Züge. Auf der Karte
  erscheinen sie halbtransparent mit Fortschrittsbalken. Der Preis zählt
  sofort; wird ein Gebäude im Aufbau erobert, läuft die Bauzeit weiter.

## [0.12.1] – 2026-07-16

### Geändert
- **Meldungen verdecken nichts mehr**: Hinweise wie „Nicht genug Geld"
  erscheinen jetzt oben mittig statt direkt über der Truppenanzeige.
- **Spieler-Infos direkt auf der Karte**: Maus über fremdes Gebiet zeigt
  denselben Stats-Tooltip wie die Rangliste (Name, Truppen, Geld, Gebiet,
  Gebäude) – direkt neben dem Mauszeiger.

## [0.12.0] – 2026-07-16

### Hinzugefügt
- **Eigene Farbe wählbar**: Im Solo-Menü und in der Lobby („Deine Farbe")
  kannst du dir eine der 20 Spielerfarben aussuchen – nochmal klicken =
  Automatik. In der Lobby sind bereits vergebene Farben gesperrt; die Wahl
  wird gespeichert und beim nächsten Mal wieder benutzt.

### Geändert
- **Detailliertere Karten**: Wasser hat jetzt einen Tiefenverlauf (helle
  Küstensäume, dunkle offene See), neutrales Land sandige Strände und
  fleckige Geländetöne, Reiche eine dezente Struktur. Rein optisch – die
  Simulation bleibt unverändert.

## [0.11.1] – 2026-07-16

### Geändert
- **Fabriken gebufft**: Züge zahlen das Doppelte je Station (eigene 12 €,
  fremde 24 €, verbündete 36 €).
- **Häfen abgeschwächt**: Handelsgold halbiert (20 € Basis + 0,3 je
  Wegzelle^1,1) – Fabriken sind jetzt die stärkere Geldquelle.
- **Übermacht beschleunigt Angriffe**: Je größer der Angriffs-Pool im
  Verhältnis zu den haltenden Truppen des Verteidigers, desto schneller
  rückt die Front vor (bis 4x). Sie bleibt dabei eine geschlossene Linie
  an der Grenze – Angriffslinien bilden sich weiterhin.

## [0.11.0] – 2026-07-16

### Hinzugefügt
- **Zwei Bot-Arten**: Masse-Bots (viele, absichtlich schwach – expandieren
  nur langsam, bauen nichts, greifen kaum an) und **Nationen** (wenige,
  stark, mit Ländernamen wie 🇩🇪 Deutschland). Die Schwierigkeit im Menü
  gilt jetzt für die Nationen; Masse-Bots sind immer schwach.
- **Viel mehr Bots**: bis zu 30 Masse-Bots + 8 Nationen (vorher max. 15
  Bots) – einstellbar über zwei getrennte Regler in Solo und Lobby.

### Geändert
- **Farben**: Menschen und Nationen bekommen die kräftigen Farben,
  Masse-Bots gedeckte Grautöne – wichtige Gegner stechen sofort hervor.
- **Startgebiete**: Nationen starten größer, Masse-Bots kleiner.
- **Rangliste** zeigt bei vielen Spielern nur noch die Top 12 plus die
  eigene Zeile.

## [0.10.1] – 2026-07-16

### Geändert
- **Höhere Kampfverluste**: Im Gefecht sterben Truppen jetzt rund doppelt so
  schnell – auf beiden Seiten. Angreifer verlieren pro Gegner-Zelle mehr aus
  dem Pool (2,8 + Dichte×3,2 statt 1,4 + Dichte×1,6), Verteidiger pro Zelle
  mehr Truppen (Dichte×1,8 statt ×0,9). Armeen schmelzen im Kampf schneller
  dahin, statt sich hinzuziehen. Die Expansion ins neutrale Land bleibt
  unverändert günstig.

## [0.10.0] – 2026-07-16

### Geändert
- **Kämpfende Truppen zählen zur Kapazität**: Truppen in Angriffen und auf
  Booten belegen weiterhin Platz im Bevölkerungslimit. Wer alles in Angriffe
  steckt, wächst nicht mehr nebenbei nach, sondern muss warten, bis der
  Angriff endet. Das orange gestreifte Segment im Truppenbalken zeigt, wie
  viele Truppen gerade draußen kämpfen.

### Hinzugefügt
- **Angriffe abbrechen**: Klick auf einen eigenen Angriff in der Liste rechts
  („Deine Angriffe") holt die restlichen Truppen sofort zurück.

## [0.9.0] – 2026-07-16

### Hinzugefügt
- **Geld-Popups**: Einnahmen aus Handelsschiffen und Zügen poppen über der
  Geldanzeige auf (z.B. „+1,2k €"). Das Neuste steht direkt über dem Geld,
  Ältere rutschen nach oben (max. 5), jedes bleibt 3 Sekunden sichtbar.
- **Fabriken verbinden sich untereinander**: Fabriken in Reichweite (60 Felder)
  werden Teil desselben Schienennetzes. Züge fahren durch, aber Fabriken
  zahlen nichts – Geld gibt es weiterhin nur an Städten und Häfen.

### Geändert
- **Hafenbau großzügiger**: Ein Klick in Küstennähe reicht – der Hafen springt
  automatisch auf die nächste eigene Küstenzelle (bis 8 Felder Entfernung).

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
